import { NextRequest, NextResponse } from "next/server";
import { executeDestinationMissionDaemonForCompany, readConfiguredDaemonCompanyIds, readDaemonDefaults } from "@/lib/destination-mission-daemon";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { classifyPersistenceFailure } from "@/lib/persistence-failures";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => null);
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, unknown>;
    const explicitCompanyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    const destinationKeyRaw = body.destinationKey;
    if (destinationKeyRaw !== undefined && !normalizeDestinationKey(destinationKeyRaw)) {
      return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    const configuredCompanyIds = readConfiguredDaemonCompanyIds();
    const companyIds = explicitCompanyId ? [explicitCompanyId] : configuredCompanyIds;
    if (!companyIds.length) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

    const membership = explicitCompanyId ? await verifyMembership(request, explicitCompanyId, "ADMIN") : { error: null };
    const ingestAuth = !explicitCompanyId || membership.error ? await verifyIngestSecret(request) : null;
    if (!explicitCompanyId && ingestAuth?.error) {
      return ingestAuth.error;
    }
    if (membership.error && ingestAuth?.error) {
      return membership.error;
    }

    const defaults = readDaemonDefaults();
    const maxRuns = typeof body.maxRuns === "number"
      ? Math.max(1, Math.min(body.maxRuns, 20))
      : undefined;
    const maxPasses = typeof body.maxPasses === "number"
      ? Math.max(1, Math.min(body.maxPasses, 8))
      : undefined;
    const maxAutoRejections = typeof body.maxAutoRejections === "number"
      ? Math.max(1, Math.min(body.maxAutoRejections, 10))
      : undefined;
    const maxRevisionIntakes = typeof body.maxRevisionIntakes === "number"
      ? Math.max(1, Math.min(body.maxRevisionIntakes, 20))
      : undefined;
    const maxApprovedPublishes = typeof body.maxApprovedPublishes === "number"
      ? Math.max(1, Math.min(body.maxApprovedPublishes, 20))
      : undefined;

    const results = [];
    const failures = [];
    for (const companyId of companyIds) {
      try {
        results.push(
          await executeDestinationMissionDaemonForCompany({
            companyId,
            destinationKey: destinationKey ?? undefined,
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
      companyIds,
      destinationScope: destinationKey ?? null,
      processedCompanies: results.length,
      overrides: {
        maxRuns: maxRuns ?? defaults.maxRuns,
        maxPasses: maxPasses ?? defaults.maxPasses,
        maxAutoRejections: maxAutoRejections ?? defaults.maxAutoRejections,
        maxRevisionIntakes: maxRevisionIntakes ?? defaults.maxRevisionIntakes,
        maxApprovedPublishes: maxApprovedPublishes ?? defaults.maxApprovedPublishes,
      },
      results,
    });
  } catch (error) {
    const stack = error instanceof Error && process.env.CHECK_DEBUG_DAEMON_ERRORS === "true"
      ? error.stack?.split("\n").slice(0, 8)
      : undefined;
    return NextResponse.json({
      ok: false,
      reasonCode: "destination_mission_daemon_unhandled_error",
      summary: error instanceof Error ? error.message : String(error),
      stack,
    }, { status: 500 });
  }
}
