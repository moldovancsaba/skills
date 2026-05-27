import { NextRequest, NextResponse } from "next/server";
import { executeDestinationMissionDaemonForCompany, readConfiguredDaemonCompanyIds, readDaemonDefaults } from "@/lib/destination-mission-daemon";
import { verifyBackgroundJobSecret } from "@/lib/ingest-auth";

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

  const companyIds = parseCompanyIds(request);
  if (!companyIds.length) {
    return NextResponse.json(
      { error: "No daemon companies configured. Set DESTINATION_MISSION_DAEMON_COMPANY_IDS or pass companyId query params." },
      { status: 400 },
    );
  }

  const defaults = readDaemonDefaults();
  const results = [];
  for (const companyId of companyIds) {
    results.push(
      await executeDestinationMissionDaemonForCompany({
        companyId,
        maxRuns: defaults.maxRuns,
        maxPasses: defaults.maxPasses,
        maxAutoRejections: defaults.maxAutoRejections,
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    cron: true,
    companyIds,
    processedCompanies: results.length,
    results,
  });
}
