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

const MIN_KNOWLEDGE_SAMPLE_FOR_SCORE_HEALTH = 8;
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isCorrectionUnresolved(correction: {
  correctionType: string;
  createdAt: Date;
  flashcard: {
    updatedAt: Date;
    lastCorrectionReconciledAt: Date | null;
    processingStatus: string;
    activityState: string;
  } | null;
}) {
  const flashcard = correction.flashcard;
  if (!flashcard) return false;

  if (correction.correctionType === "REQUEST_REFRESH" || correction.correctionType === "MARK_WRONG") {
    return (
      flashcard.processingStatus === "REVIEW" ||
      !flashcard.lastCorrectionReconciledAt ||
      flashcard.lastCorrectionReconciledAt <= correction.createdAt
    );
  }

  if (correction.correctionType === "SUPPRESS_SOURCE" || correction.correctionType === "HIDE") {
    return flashcard.activityState !== "ARCHIVED" && flashcard.updatedAt <= correction.createdAt;
  }

  return false;
}

function resolveHealthState(input: {
  failedJobs: number;
  reviewCount: number;
  staleCount: number;
  scoreBand: string;
}) {
  if (input.failedJobs > 0) return "FAILED";
  if (input.reviewCount > 0 || input.staleCount > 0 || input.scoreBand === "CRITICAL" || input.scoreBand === "SUSPICIOUS") return "DELAYED";
  if (input.scoreBand === "WARNING") return "STALE";
  return "HEALTHY";
}

function describeHealthState(input: {
  healthState: "HEALTHY" | "STALE" | "DELAYED" | "FAILED";
  reviewCount: number;
  staleCount: number;
  correctionBacklog: number;
  failedJobs: number;
  scoreBand: string;
}) {
  if (input.healthState === "FAILED") {
    return {
      tone: "destructive" as const,
      title: "Knowmore Health: Worker Failure",
      summary: `The queue has ${input.failedJobs} failed knowledge job(s). Recovery is needed before normal knowledge maintenance can continue.`,
    };
  }

  if (input.healthState === "DELAYED") {
    return {
      tone: "warning" as const,
      title: "Knowmore Health: Needs Attention",
      summary:
        input.reviewCount > 0 || input.staleCount > 0
          ? `Review ${input.reviewCount} card(s), stale ${input.staleCount}, correction backlog ${input.correctionBacklog}. The worker is running, but some knowledge needs another pass.`
          : `The worker is running and there are no failed jobs, but the knowledge set looks clustered or low-diversity (${input.scoreBand}).`,
    };
  }

  if (input.healthState === "STALE") {
    return {
      tone: "warning" as const,
      title: "Knowmore Health: Monitoring",
      summary: `No worker failure is active, but the current knowledge quality signals are worth watching (${input.scoreBand}).`,
    };
  }

  return {
    tone: "default" as const,
    title: "Knowmore Health: Healthy",
    summary: `Review ${input.reviewCount} card(s), stale ${input.staleCount}, correction backlog ${input.correctionBacklog}, failed jobs ${input.failedJobs}.`,
  };
}

async function getKnowmoreHealthSnapshot(companyId: string) {
  const [reviewCount, staleCount, corrections, scoreHealth, failedJobs, jobs, knowledgeCount] = await Promise.all([
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
    prisma.flashcardCorrection.findMany({
      where: {
        companyId,
        correctionType: { in: ["REQUEST_REFRESH", "SUPPRESS_SOURCE", "MARK_WRONG", "HIDE"] },
      },
      include: {
        flashcard: {
          select: {
            updatedAt: true,
            lastCorrectionReconciledAt: true,
            processingStatus: true,
            activityState: true,
          },
        },
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
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
    }),
  ]);

  const correctionBacklog = corrections.filter(isCorrectionUnresolved).length;
  const scoreHealthEnabled = knowledgeCount >= MIN_KNOWLEDGE_SAMPLE_FOR_SCORE_HEALTH;
  const effectiveScoreBand = scoreHealthEnabled ? (scoreHealth?.knowledge?.overallSeverity ?? "UNKNOWN") : "HEALTHY";
  const effectiveAlerts = scoreHealthEnabled ? (scoreHealth?.knowledge?.alerts?.slice(0, 3) ?? []) : [];

  const healthState = resolveHealthState({
    failedJobs,
    reviewCount,
    staleCount,
    scoreBand: effectiveScoreBand,
  });
  const presentation = describeHealthState({
    healthState,
    reviewCount,
    staleCount,
    correctionBacklog,
    failedJobs,
    scoreBand: effectiveScoreBand,
  });

  return {
    healthState,
    healthTone: presentation.tone,
    healthTitle: presentation.title,
    healthSummary: presentation.summary,
    reviewCount,
    staleCount,
    correctionBacklog,
    failedJobs,
    scoreBand: effectiveScoreBand,
    alerts: effectiveAlerts,
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
    return NextResponse.json(await getKnowmoreHealthSnapshot(companyId), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
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

    return NextResponse.json(await getKnowmoreHealthSnapshot(companyId), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[API:KNOWMORE:HEALTH] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
