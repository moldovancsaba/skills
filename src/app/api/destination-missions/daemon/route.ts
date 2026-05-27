import { NextRequest, NextResponse } from "next/server";
import { executeDestinationMissionDaemonForCompany, readConfiguredDaemonCompanyIds, readDaemonDefaults } from "@/lib/destination-mission-daemon";
import { verifyIngestSecret } from "@/lib/ingest-auth";
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

  const results = [];
  for (const companyId of companyIds) {
    results.push(
      await executeDestinationMissionDaemonForCompany({
        companyId,
        maxRuns,
        maxPasses,
        maxAutoRejections,
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    companyIds,
    processedCompanies: results.length,
    results,
  });
}
