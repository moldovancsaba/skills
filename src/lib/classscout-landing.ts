import "server-only";

import { prisma } from "@/lib/db";
import { PROJECT_BOARD_COLUMNS } from "@/lib/board-system";
import { isClassScoutBridgeConfigured, listClassScoutLiveListings } from "@/lib/destination-classscout";
import { getDestinationLearningSummary, getDestinationReplayCandidates } from "@/lib/destination-learning";
import { getDestinationMissionControlSummary } from "@/lib/destination-workflow-runtime";
import { getActiveDestinationInstance } from "@/lib/destination-workflows";

const UNIT_PROJECT_BOARD_KEY = "UNIT_PROJECT";

type LandingSectionFailureKey = "liveQueue" | "learning" | "missionControl" | "projectBoard";

export type ClassScoutLandingSummary = {
  generatedAt: string;
  companyId: string;
  destinationKey: "classscout";
  state: "ready" | "empty" | "partial" | "fatal";
  configured: boolean;
  bridgeConfigured: boolean;
  unavailableSections: Array<{
    key: LandingSectionFailureKey;
    message: string;
  }>;
  summary: {
    liveListings: number;
    reviewRequired: number;
    workflowPackets: number;
    publishedOutcomes: number;
    failedWorkflows: number;
    replayCandidates: number;
    projectCards: number;
    activeRuns: number;
    staleRuns: number;
  };
  actions: Array<{
    key: string;
    title: string;
    description: string;
    href: string;
    tone: "review" | "knowmore" | "tactical" | "strategy";
  }>;
  sections: {
    liveQueue: {
      listingCount: number;
      reviewRequiredCount: number;
    } | null;
    learning: {
      packetCount: number;
      publishedCount: number;
      firstPassApprovalRate: number;
      workflowFailureRate: number;
    } | null;
    missionControl: {
      activeRuns: number;
      staleRuns: number;
      retryBacklog: number;
      callbackFailureCount: number;
    } | null;
    projectBoard: {
      activeCards: number;
      byColumn: Array<{ columnKey: string; count: number }>;
    } | null;
  };
};

export function classifyClassScoutLandingState(input: {
  configured: boolean;
  unavailableSections: Array<{ key: LandingSectionFailureKey; message: string }>;
  summary: ClassScoutLandingSummary["summary"];
}) {
  const totalAttention =
    input.summary.liveListings +
    input.summary.reviewRequired +
    input.summary.workflowPackets +
    input.summary.projectCards +
    input.summary.activeRuns +
    input.summary.replayCandidates;

  if (input.unavailableSections.length >= 4) {
    return "fatal" as const;
  }
  if (input.unavailableSections.length > 0) {
    return "partial" as const;
  }
  if (!input.configured || totalAttention === 0) {
    return "empty" as const;
  }
  return "ready" as const;
}

export async function getClassScoutLandingSummary(companyId: string): Promise<ClassScoutLandingSummary> {
  const [destinationInstance, boardCards, boardStates, learningResult, replayResult, missionResult, liveResult] = await Promise.all([
    getActiveDestinationInstance(companyId, "classscout"),
    prisma.boardCard.count({
      where: {
        companyId,
        boardKey: UNIT_PROJECT_BOARD_KEY,
        archivedAt: null,
      },
    }),
    prisma.boardItemState.findMany({
      where: {
        companyId,
        boardKey: UNIT_PROJECT_BOARD_KEY,
        entityType: "BOARD_CARD",
      },
      select: {
        columnKey: true,
      },
    }),
    getDestinationLearningSummary({ companyId, destinationKey: "classscout" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    getDestinationReplayCandidates({ companyId, destinationKey: "classscout" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    getDestinationMissionControlSummary(companyId).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    listClassScoutLiveListings({ companyId, listingType: "all" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
  ]);

  const unavailableSections: ClassScoutLandingSummary["unavailableSections"] = [];

  const learning = learningResult.ok ? learningResult.value : null;
  if (!learningResult.ok) {
    unavailableSections.push({ key: "learning", message: learningResult.error instanceof Error ? learningResult.error.message : "Learning summary unavailable." });
  }

  const replayCandidates = replayResult.ok ? replayResult.value : [];
  if (!replayResult.ok) {
    unavailableSections.push({ key: "learning", message: replayResult.error instanceof Error ? replayResult.error.message : "Replay candidates unavailable." });
  }

  const mission = missionResult.ok ? missionResult.value : null;
  if (!missionResult.ok) {
    unavailableSections.push({ key: "missionControl", message: missionResult.error instanceof Error ? missionResult.error.message : "Mission control summary unavailable." });
  }

  const livePayload = liveResult.ok ? liveResult.value : null;
  if (!liveResult.ok) {
    unavailableSections.push({ key: "liveQueue", message: liveResult.error instanceof Error ? liveResult.error.message : "Live catalog summary unavailable." });
  } else if (!livePayload?.ok) {
    unavailableSections.push({ key: "liveQueue", message: String(livePayload?.error || "Live catalog summary unavailable.") });
  }

  const projectByColumn = PROJECT_BOARD_COLUMNS.map((column) => ({
    columnKey: column.key,
    count: boardStates.filter((state) => state.columnKey === column.key).length,
  }));

  const summary: ClassScoutLandingSummary["summary"] = {
    liveListings: Array.isArray(livePayload?.items) ? livePayload.items.length : 0,
    reviewRequired: Array.isArray(livePayload?.items)
      ? livePayload.items.filter((item) =>
          item.revisionStatus.packetState === "REVIEW_REQUIRED" ||
          item.revisionStatus.packetState === "DRAFTED" ||
          item.revisionStatus.packetState === "VALIDATED",
        ).length
      : 0,
    workflowPackets: Number(learning?.totals?.packets ?? 0),
    publishedOutcomes: Number(learning?.totals?.published ?? 0),
    failedWorkflows: mission?.retryBacklog ?? 0,
    replayCandidates: Array.isArray(replayCandidates) ? replayCandidates.length : 0,
    projectCards: boardCards,
    activeRuns: mission?.activeRuns ?? 0,
    staleRuns: mission?.staleRuns.length ?? 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    companyId,
    destinationKey: "classscout",
    state: classifyClassScoutLandingState({
      configured: Boolean(destinationInstance),
      unavailableSections,
      summary,
    }),
    configured: Boolean(destinationInstance),
    bridgeConfigured: isClassScoutBridgeConfigured(),
    unavailableSections,
    summary,
    actions: [
      {
        key: "content-ops",
        title: "Content Ops",
        description: "Review packets, approve outcomes, and work the human decision queue.",
        href: `/${companyId}/review?tab=review`,
        tone: "review",
      },
      {
        key: "live-queue",
        title: "Live Catalog Queue",
        description: "Inspect live listings and open destination revisions that need attention.",
        href: `/${companyId}/review?tab=ops`,
        tone: "knowmore",
      },
      {
        key: "project-board",
        title: "Project Board",
        description: "Track unit-level delivery work with shared kanban runtime and explicit execution status.",
        href: `/${companyId}/unit-board`,
        tone: "tactical",
      },
      {
        key: "mission-control",
        title: "Mission Control",
        description: "Monitor runtime health, stale runs, and destination workflow recovery actions.",
        href: `/${companyId}/observability`,
        tone: "strategy",
      },
    ],
    sections: {
      liveQueue: livePayload?.ok
        ? {
            listingCount: Array.isArray(livePayload.items) ? livePayload.items.length : 0,
            reviewRequiredCount: summary.reviewRequired,
          }
        : null,
      learning: learning
        ? {
            packetCount: Number(learning.totals?.packets ?? 0),
            publishedCount: Number(learning.totals?.published ?? 0),
            firstPassApprovalRate: Number(learning.quality?.firstPassApprovalRate ?? 0),
            workflowFailureRate: Number(learning.quality?.workflowFailureRate ?? 0),
          }
        : null,
      missionControl: mission
        ? {
            activeRuns: mission.activeRuns,
            staleRuns: mission.staleRuns.length,
            retryBacklog: mission.retryBacklog,
            callbackFailureCount: mission.callbackFailureCount,
          }
        : null,
      projectBoard: {
        activeCards: boardCards,
        byColumn: projectByColumn,
      },
    },
  };
}
