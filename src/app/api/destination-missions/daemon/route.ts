import { NextRequest, NextResponse } from "next/server";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { verifyMembership } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { escalateCompanyPipelineJob } from "@/lib/pipeline-queue";

export const dynamic = "force-dynamic";

function readConfiguredDaemonCompanyIds() {
  return Array.from(new Set((process.env.DESTINATION_MISSION_DAEMON_COMPANY_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean)));
}

function readApiSafeDaemonDefaults() {
  const maxRuns = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_RUNS ?? 5);
  const maxPasses = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_PASSES ?? 3);
  const maxAutoRejections = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_AUTO_REJECTIONS ?? 5);
  const maxRevisionIntakes = Number(process.env.DESTINATION_MAINTENANCE_MAX_REVISION_INTAKES ?? 10);
  const maxApprovedPublishes = Number(process.env.DESTINATION_MAINTENANCE_MAX_APPROVED_PUBLISHES ?? 10);

  return {
    maxRuns: Number.isFinite(maxRuns) ? Math.max(1, Math.min(Math.round(maxRuns), 20)) : 5,
    maxPasses: Number.isFinite(maxPasses) ? Math.max(1, Math.min(Math.round(maxPasses), 8)) : 3,
    maxAutoRejections: Number.isFinite(maxAutoRejections) ? Math.max(1, Math.min(Math.round(maxAutoRejections), 10)) : 5,
    maxRevisionIntakes: Number.isFinite(maxRevisionIntakes) ? Math.max(1, Math.min(Math.round(maxRevisionIntakes), 20)) : 10,
    maxApprovedPublishes: Number.isFinite(maxApprovedPublishes) ? Math.max(1, Math.min(Math.round(maxApprovedPublishes), 20)) : 10,
  };
}

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

    const defaults = readApiSafeDaemonDefaults();
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

    const queued = [];
    for (const companyId of companyIds) {
      const entityType = "DESTINATION_SERVICE";
      const entityId = "destination-service";
      const job = await escalateCompanyPipelineJob(prisma, companyId, "DESTINATION_MISSION_DAEMON", entityType, entityId);
      queued.push({
        companyId,
        destinationKey: destinationKey ?? null,
        jobId: job?.id ?? null,
        queued: Boolean(job),
      });
    }

    return NextResponse.json({
      ok: true,
      queued: true,
      lane: "PLAYLIST",
      jobType: "DESTINATION_MISSION_DAEMON",
      companyIds,
      destinationScope: destinationKey ?? null,
      overrides: {
        maxRuns: maxRuns ?? defaults.maxRuns,
        maxPasses: maxPasses ?? defaults.maxPasses,
        maxAutoRejections: maxAutoRejections ?? defaults.maxAutoRejections,
        maxRevisionIntakes: maxRevisionIntakes ?? defaults.maxRevisionIntakes,
        maxApprovedPublishes: maxApprovedPublishes ?? defaults.maxApprovedPublishes,
      },
      results: queued,
      message: "Destination mission daemon work was queued for CHECK Local instead of executing directly.",
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
