import { NextRequest, NextResponse } from "next/server";
import { DestinationMissionState } from "@prisma/client";
import { executeClassScoutMissionUntilBlocked } from "@/lib/destination-mission-runner";
import { listDestinationMissionRuns } from "@/lib/destination-missions";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function readExecutionMode(run: {
  policySnapshot?: { policyJson?: unknown } | null;
}) {
  const policy = run.policySnapshot && typeof run.policySnapshot === "object" && "policyJson" in run.policySnapshot
    ? (run.policySnapshot as { policyJson?: unknown }).policyJson
    : null;
  if (policy && typeof policy === "object" && !Array.isArray(policy) && typeof (policy as Record<string, unknown>).executionMode === "string") {
    return String((policy as Record<string, unknown>).executionMode);
  }
  return "manual";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "").trim();
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await verifyMembership(request, companyId, "ADMIN");
  const ingestAuth = membership.error ? await verifyIngestSecret(request) : null;
  if (membership.error && ingestAuth?.error) {
    return membership.error;
  }

  const maxRuns = Math.max(1, Math.min(typeof body.maxRuns === "number" ? body.maxRuns : 5, 20));
  const maxPasses = Math.max(1, Math.min(typeof body.maxPasses === "number" ? body.maxPasses : 3, 8));
  const maxAutoRejections = Math.max(1, Math.min(typeof body.maxAutoRejections === "number" ? body.maxAutoRejections : 5, 10));

  const runs = await listDestinationMissionRuns({
    companyId,
    destinationKey: "classscout",
    missionKind: "rulebook_new_listing",
  });

  const eligibleStates = new Set<DestinationMissionState>([
    DestinationMissionState.QUEUED,
    DestinationMissionState.CATALOG_INSPECTED,
    DestinationMissionState.DISCOVERING,
    DestinationMissionState.FAILED_RECOVERABLE,
    DestinationMissionState.CANDIDATE_IN_REVIEW,
    DestinationMissionState.PUBLISHING,
  ]);

  const selectedRuns = runs
    .filter((run) => eligibleStates.has(run.state))
    .filter((run) => {
      const mode = readExecutionMode(run);
      return mode === "guarded" || mode === "autopilot";
    })
    .slice(0, maxRuns);

  const results = [];
  for (const run of selectedRuns) {
    const executionMode = readExecutionMode(run);
    const approvedPacket =
      executionMode === "autopilot"
        ? await prisma.destinationReviewPacket.findFirst({
            where: {
              companyId,
              workflowRunId: run.id,
              packetState: "APPROVED",
            },
            include: {
              outcomeMemories: {
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
            orderBy: { updatedAt: "desc" },
          })
        : null;

    const canAutoPublish =
      executionMode === "autopilot" &&
      approvedPacket &&
      !approvedPacket.outcomeMemories.some((item) => item.eventType === "publish_completed") &&
      (run.state === DestinationMissionState.PUBLISHING || run.state === DestinationMissionState.CANDIDATE_IN_REVIEW);

    let result;
    if (canAutoPublish && approvedPacket) {
      result = {
        ok: true,
        autopublish: true,
        publish: await publishDestinationReviewPacket({
          companyId,
          reviewPacketId: approvedPacket.id,
          reviewedBy: "destination-mission-daemon",
        }),
      };
    } else {
      result = await executeClassScoutMissionUntilBlocked({
        companyId,
        missionId: run.id,
        actorId: "destination-mission-daemon",
        maxPasses,
        maxAutoRejections,
      });
    }

    results.push({
      missionId: run.id,
      state: run.state,
      executionMode,
      result,
    });
  }

  return NextResponse.json({
    ok: true,
    companyId,
    processed: results.length,
    skipped: runs.length - results.length,
    results,
  });
}
