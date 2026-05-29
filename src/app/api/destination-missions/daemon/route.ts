import { NextRequest, NextResponse } from "next/server";
import { executeDestinationMissionDaemonForCompany, readConfiguredDaemonCompanyIds, readDaemonDefaults } from "@/lib/destination-mission-daemon";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { classifyPersistenceFailure } from "@/lib/persistence-failures";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const explicitCompanyId = String(body.companyId || "").trim();
  const configuredCompanyIds = readConfiguredDaemonCompanyIds();
  const companyIds = explicitCompanyId ? [explicitCompanyId] : configuredCompanyIds;
  if (!companyIds.length) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const membership = explicitCompanyId ? await verifyMembership(request, explicitCompanyId, "ADMIN") : { error: null };
  const ingestAuth = membership.error ? await verifyIngestSecret(request) : null;
  if (membership.error && ingestAuth?.error) {
    return membership.error;
  }

  const defaults = readDaemonDefaults();
  const maxRuns = Math.max(1, Math.min(typeof body.maxRuns === "number" ? body.maxRuns : defaults.maxRuns, 20));
  const maxPasses = Math.max(1, Math.min(typeof body.maxPasses === "number" ? body.maxPasses : defaults.maxPasses, 8));
  const maxAutoRejections = Math.max(
    1,
    Math.min(typeof body.maxAutoRejections === "number" ? body.maxAutoRejections : defaults.maxAutoRejections, 10),
  );
  const maxRevisionIntakes = Math.max(
    1,
    Math.min(typeof body.maxRevisionIntakes === "number" ? body.maxRevisionIntakes : defaults.maxRevisionIntakes, 20),
  );
  const maxApprovedPublishes = Math.max(
    1,
    Math.min(typeof body.maxApprovedPublishes === "number" ? body.maxApprovedPublishes : defaults.maxApprovedPublishes, 20),
  );

  const results = [];
  const failures = [];
  for (const companyId of companyIds) {
    try {
      results.push(
        await executeDestinationMissionDaemonForCompany({
          companyId,
          maxRuns,
          maxPasses,
          maxAutoRejections,
          maxRevisionIntakes,
          maxApprovedPublishes,
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
      companyIds,
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
    companyIds,
    processedCompanies: results.length,
    results,
  });
}
