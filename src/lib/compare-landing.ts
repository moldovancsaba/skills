import "server-only";

import { prisma } from "@/lib/db";
import { getComparePublicVerificationSummary } from "@/lib/compare-public-verification";
import { getDestinationLearningSummary, getDestinationReplayCandidates } from "@/lib/destination-learning";
import { getActiveDestinationInstance } from "@/lib/destination-workflows";
import { DestinationWorkflowState } from "@prisma/client";

type CompareLandingSectionFailureKey = "learning" | "missionControl";

export type CompareLandingSummary = {
  generatedAt: string;
  companyId: string;
  destinationKey: "compare";
  state: "ready" | "empty" | "partial" | "fatal";
  configured: boolean;
  bridgeConfigured: boolean;
  unavailableSections: Array<{
    key: CompareLandingSectionFailureKey;
    message: string;
  }>;
  summary: {
    workflowPackets: number;
    reviewRequired: number;
    approvedPackets: number;
    publishedOutcomes: number;
    replayCandidates: number;
    activeRuns: number;
    failedRuns: number;
    projectionBlockedCandidates: number;
  };
  publicVerification: {
    checkedAt: string;
    totalCandidatesChecked: number;
    blockedCount: number;
    blockedByReason: Record<string, number>;
    status: "ok" | "blocked";
  };
  sections: {
    learning: {
      packetCount: number;
      publishedCount: number;
      firstPassApprovalRate: number;
      workflowFailureRate: number;
    } | null;
    missionControl: {
      activeRuns: number;
      failedRuns: number;
      staleRuns: number;
    } | null;
  };
};

function isCompareBridgeConfigured() {
  const baseUrl = process.env.COMPARE_BASE_URL?.trim();
  const ingestKey = process.env.COMPARE_INGEST_API_KEY?.trim();
  return Boolean(baseUrl && ingestKey);
}

function isStale(updatedAt: Date) {
  return Date.now() - updatedAt.getTime() > 12 * 60 * 60 * 1000;
}

function classifyCompareLandingState(input: {
  configured: boolean;
  unavailableSections: Array<{ key: CompareLandingSectionFailureKey; message: string }>;
  summary: CompareLandingSummary["summary"];
  publicVerificationBlockedCount: number;
}) {
  const totalAttention =
    input.summary.workflowPackets +
    input.summary.reviewRequired +
    input.summary.approvedPackets +
    input.summary.replayCandidates +
    input.summary.activeRuns;

  if (input.unavailableSections.length >= 2) return "fatal" as const;
  if (input.unavailableSections.length > 0) return "partial" as const;
  if (input.publicVerificationBlockedCount > 0) return "partial" as const;
  if (!input.configured || totalAttention === 0) return "empty" as const;
  return "ready" as const;
}

export async function getCompareLandingSummary(companyId: string): Promise<CompareLandingSummary> {
  const [destinationInstance, learningResult, replayResult, runsResult, packetsResult, publishedOutcomesResult, publicVerificationResult] = await Promise.all([
    getActiveDestinationInstance(companyId, "compare"),
    getDestinationLearningSummary({ companyId, destinationKey: "compare" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    getDestinationReplayCandidates({ companyId, destinationKey: "compare" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    prisma.destinationWorkflowRun.findMany({
      where: {
        companyId,
        destinationInstance: {
          destinationKey: "compare",
        },
      },
      select: {
        state: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    prisma.destinationReviewPacket.findMany({
      where: {
        companyId,
        destinationInstance: {
          destinationKey: "compare",
        },
      },
      select: {
        packetState: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 300,
    }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    prisma.destinationOutcomeMemory.count({
      where: {
        companyId,
        destinationInstance: {
          destinationKey: "compare",
        },
        eventType: {
          in: ["publish_completed", "completed", "complete"],
        },
      },
    }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    getComparePublicVerificationSummary(companyId).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
  ]);

  const unavailableSections: CompareLandingSummary["unavailableSections"] = [];

  const learning = learningResult.ok ? learningResult.value : null;
  if (!learningResult.ok) {
    unavailableSections.push({ key: "learning", message: learningResult.error instanceof Error ? learningResult.error.message : "Learning summary unavailable." });
  }

  const replayCandidates = replayResult.ok ? replayResult.value : [];
  if (!replayResult.ok) {
    unavailableSections.push({ key: "learning", message: replayResult.error instanceof Error ? replayResult.error.message : "Replay candidates unavailable." });
  }

  const runs = runsResult.ok ? runsResult.value : [];
  if (!runsResult.ok) {
    unavailableSections.push({ key: "missionControl", message: runsResult.error instanceof Error ? runsResult.error.message : "Mission control summary unavailable." });
  }

  const packets = packetsResult.ok ? packetsResult.value : [];
  if (!packetsResult.ok) {
    unavailableSections.push({ key: "missionControl", message: packetsResult.error instanceof Error ? packetsResult.error.message : "Review card summary unavailable." });
  }

  const publishedOutcomes = publishedOutcomesResult.ok ? Number(publishedOutcomesResult.value || 0) : 0;
  if (!publishedOutcomesResult.ok) {
    unavailableSections.push({ key: "missionControl", message: publishedOutcomesResult.error instanceof Error ? publishedOutcomesResult.error.message : "Published outcome summary unavailable." });
  }
  const publicVerification = publicVerificationResult.ok ? publicVerificationResult.value : null;
  if (!publicVerificationResult.ok) {
    unavailableSections.push({
      key: "missionControl",
      message: publicVerificationResult.error instanceof Error ? publicVerificationResult.error.message : "Candidate projection verification unavailable.",
    });
  }
  const blockedCount = publicVerification?.blockedCount ?? 0;

  const reviewRequired = packets.reduce((acc, packet) => {
    const state = String(packet.packetState || "");
    if (state === "AWAITING_REVIEW" || state === "REVIEW_REQUIRED") {
      return acc + 1;
    }
    return acc;
  }, 0);

  const approvedPackets = packets.reduce((acc, packet) => {
    return String(packet.packetState || "") === "APPROVED" ? acc + 1 : acc;
  }, 0);

  const activeRuns = runs.reduce((acc, run) => {
    return run.state !== DestinationWorkflowState.PUBLISHED && run.state !== DestinationWorkflowState.REJECTED ? acc + 1 : acc;
  }, 0);

  const failedRuns = runs.reduce((acc, run) => {
    return run.state === DestinationWorkflowState.FAILED ? acc + 1 : acc;
  }, 0);

  const staleRuns = runs.reduce((acc, run) => {
    return isStale(run.updatedAt) ? acc + 1 : acc;
  }, 0);

  const summary: CompareLandingSummary["summary"] = {
    workflowPackets: packets.length,
    reviewRequired,
    approvedPackets,
    publishedOutcomes,
    replayCandidates: Array.isArray(replayCandidates) ? replayCandidates.length : 0,
    activeRuns,
    failedRuns,
    projectionBlockedCandidates: blockedCount,
  };

  return {
    generatedAt: new Date().toISOString(),
    companyId,
    destinationKey: "compare",
    state: classifyCompareLandingState({
      configured: Boolean(destinationInstance),
      unavailableSections,
      summary,
      publicVerificationBlockedCount: blockedCount,
    }),
    configured: Boolean(destinationInstance),
    bridgeConfigured: isCompareBridgeConfigured(),
    unavailableSections,
    summary,
    publicVerification: publicVerification ?? {
      checkedAt: new Date().toISOString(),
      totalCandidatesChecked: 0,
      blockedCount: 0,
      blockedByReason: {},
      status: "ok",
    },
    sections: {
      learning: learning
        ? {
            packetCount: Number(learning.totals?.packets ?? 0),
            publishedCount: Number(learning.totals?.published ?? 0),
            firstPassApprovalRate: Number(learning.quality?.firstPassApprovalRate ?? 0),
            workflowFailureRate: Number(learning.quality?.workflowFailureRate ?? 0),
          }
        : null,
      missionControl: {
        activeRuns,
        failedRuns,
        staleRuns,
      },
    },
  };
}
