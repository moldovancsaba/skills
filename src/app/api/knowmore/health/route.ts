import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { computeCompanyScoreHealth } from "@/lib/score-health";
import {
  escalateCompanyPipelineJob,
  recoverFailedCompanyPipelineJobs,
  syncCompanyPipelineJobs,
} from "@/lib/pipeline-queue";

function resolveHealthState(input: {
  failedJobs: number;
  reviewCount: number;
  staleCount: number;
  scoreBand: string;
}) {
  if (input.failedJobs > 0 || input.scoreBand === "CRITICAL") return "FAILED";
  if (input.reviewCount > 0 || input.staleCount > 0 || input.scoreBand === "SUSPICIOUS") return "DELAYED";
  if (input.scoreBand === "WARNING") return "STALE";
  return "HEALTHY";
}

async function getKnowmoreHealthSnapshot(companyId: string) {
  const [reviewCount, staleCount, correctionBacklog, scoreHealth, failedJobs, jobs] = await Promise.all([
    prisma.flashcard.count({
      where: {
        companyId,
        processingStatus: "REVIEW",
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
    }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["STALE", "EXPIRED"] },
      },
    }),
    prisma.flashcardCorrection.count({
      where: {
        companyId,
        correctionType: { in: ["REQUEST_REFRESH", "SUPPRESS_SOURCE", "MARK_WRONG", "HIDE"] },
      },
    }),
    computeCompanyScoreHealth(companyId, prisma),
    prisma.pipelineJob.count({
      where: {
        companyId,
        status: "FAILED",
        jobType: { in: ["COMPANY_SYNTHESIS", "FEEDBACK_RECONCILIATION", "CARD_RESCORING"] },
      },
    }),
    prisma.pipelineJob.findMany({
      where: {
        companyId,
        jobType: { in: ["COMPANY_SYNTHESIS", "FEEDBACK_RECONCILIATION", "CARD_RESCORING"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 6,
    }),
  ]);

  const healthState = resolveHealthState({
    failedJobs,
    reviewCount,
    staleCount,
    scoreBand: scoreHealth?.overallBand ?? "UNKNOWN",
  });

  return {
    healthState,
    reviewCount,
    staleCount,
    correctionBacklog,
    failedJobs,
    scoreBand: scoreHealth?.overallBand ?? "UNKNOWN",
    alerts: scoreHealth?.alerts?.slice(0, 3) ?? [],
    jobs,
    recommendedActions: {
      sync: true,
      repair: healthState !== "HEALTHY" || correctionBacklog > 0,
      recover: failedJobs > 0,
    },
  };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(await getKnowmoreHealthSnapshot(companyId));
  } catch (error) {
    console.error("[API:KNOWMORE:HEALTH] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    const action = String(data.action || "");

    if (!companyId || !action) {
      return NextResponse.json({ error: "companyId and action required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    if (action === "SYNC_KNOWMORE") {
      await syncCompanyPipelineJobs(prisma as any, companyId);
    } else if (action === "REQUEST_KNOWMORE_REPAIR") {
      await escalateCompanyPipelineJob(prisma as any, companyId, "COMPANY_SYNTHESIS");
      await escalateCompanyPipelineJob(prisma as any, companyId, "FEEDBACK_RECONCILIATION");
      await escalateCompanyPipelineJob(prisma as any, companyId, "CARD_RESCORING");
    } else if (action === "RECOVER_KNOWMORE_JOBS") {
      await recoverFailedCompanyPipelineJobs(prisma as any, companyId);
    } else {
      return NextResponse.json({ error: "Unsupported knowmore action" }, { status: 400 });
    }

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "knowmore-health",
      interactionType: `KNOWMORE_${action}`,
      entityType: "KNOWLEDGE",
      entityId: companyId,
      payload: { action },
      teachingWeight: 75,
    });
    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      entityType: "KNOWLEDGE",
      entityId: companyId,
      outcomeType: `KNOWMORE_${action}`,
      outcomeValue: action,
      payload: { action },
      teachingWeight: 75,
    });

    return NextResponse.json(await getKnowmoreHealthSnapshot(companyId));
  } catch (error) {
    console.error("[API:KNOWMORE:HEALTH] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
