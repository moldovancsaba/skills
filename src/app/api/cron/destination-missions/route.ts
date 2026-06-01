import { NextRequest, NextResponse } from "next/server";
import { executeDestinationMissionDaemonForCompany, readConfiguredDaemonCompanyIds } from "@/lib/destination-mission-daemon";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { verifyBackgroundJobSecret } from "@/lib/ingest-auth";
import { classifyPersistenceFailure } from "@/lib/persistence-failures";

export const dynamic = "force-dynamic";

function parseCompanyIds(request: NextRequest) {
  const queryIds = request.nextUrl.searchParams.getAll("companyId");
  const csvIds = request.nextUrl.searchParams.get("companyIds");
  const explicitIds = [
    ...queryIds,
    ...(csvIds ? csvIds.split(",") : []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return explicitIds.length ? Array.from(new Set(explicitIds)) : readConfiguredDaemonCompanyIds();
}

export async function GET(request: NextRequest) {
  const auth = await verifyBackgroundJobSecret(request);
  if (auth.error) return auth.error;
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);

  const companyIds = parseCompanyIds(request);
  if (!companyIds.length) {
    return NextResponse.json(
      { error: "No daemon companies configured. Set DESTINATION_MISSION_DAEMON_COMPANY_IDS or pass companyId query params." },
      { status: 400 },
    );
  }

  const results = [];
  const failures = [];
  for (const companyId of companyIds) {
    try {
      results.push(
        await executeDestinationMissionDaemonForCompany({
          companyId,
          destinationKey: destinationKey ?? undefined,
        }),
      );
    } catch (error) {
      const classified = classifyPersistenceFailure(error);
      if (!classified) throw error;
      failures.push({
        companyId,
        ...classified,
      });
    }
  }

  if (failures.length > 0) {
    const status = failures.some((failure) => failure.status !== 503) ? 500 : 503;
    return NextResponse.json({
      ok: false,
      cron: true,
      companyIds,
      destinationScope: destinationKey ?? null,
      processedCompanies: results.length,
      results,
      failures,
      retryable: failures.every((failure) => failure.retryable),
      retryAfterMs: Math.max(...failures.map((failure) => failure.retryAfterMs)),
      reasonCode: failures[0]?.reasonCode ?? "destination_mission_daemon_failed",
      summary: failures[0]?.summary ?? "Destination mission daemon failed.",
    }, { status });
  }

  return NextResponse.json({
    ok: true,
    cron: true,
    companyIds,
    destinationScope: destinationKey ?? null,
    processedCompanies: results.length,
    results,
  });
}
