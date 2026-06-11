import "server-only";

import { prisma } from "@/lib/db";
import { PROJECT_BOARD_COLUMNS } from "@/lib/board-system";
import { isTrainersBridgeConfigured, listTrainersLiveListings } from "@/lib/destination-trainers";
import { getDestinationLearningSummary, getDestinationReplayCandidates } from "@/lib/destination-learning";
import { getDestinationMissionControlSummary } from "@/lib/destination-workflow-runtime";
import { getActiveDestinationInstance } from "@/lib/destination-workflows";
import { resolveTrainersEntryPoint, resolveTrainersRoutes, type TrainersRouteContract } from "@/lib/trainers-routes";

const UNIT_PROJECT_BOARD_KEY = "UNIT_PROJECT";

type LandingSectionFailureKey = "liveQueue" | "learning" | "missionControl" | "projectBoard";

export type TrainersLandingSummary = {
  generatedAt: string;
  companyId: string;
  destinationKey: "trainers";
  liveListings: {
    total: number;
    needsReview: number;
    published: number;
  };
  reviewPackets: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  learning: {
    packets: number;
    published: number;
    failed: number;
    replayCandidates: number;
  };
  missionControl: {
    activeRuns: number;
    failedRuns: number;
    retryBacklog: number;
  };
  routeTargets: Pick<TrainersRouteContract, "reviewRoute" | "opsRoute" | "observabilityRoute"> & {
    review: string;
    ops: string;
    observability: string;
  };
  fetchHealth: {
    degraded: boolean;
    sources: Array<{
      key: "liveListings" | "reviewPackets" | "learning" | "missionControl" | "projectBoard";
      status: "ok" | "degraded" | "failed";
      message?: string;
    }>;
  };
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
  entryPoints: Array<{
    sourceSurface: string;
    intent: string;
    targetDestination: string;
    preservesDeepLink: boolean;
    compatibilityRedirectRequired: boolean;
    accessibleLabel: string;
  }>;
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

export function classifyTrainersLandingState(input: {
  configured: boolean;
  unavailableSections: Array<{ key: LandingSectionFailureKey; message: string }>;
  summary: TrainersLandingSummary["summary"];
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

export async function getTrainersLandingSummary(companyId: string): Promise<TrainersLandingSummary> {
  const [destinationInstance, boardCards, boardStates, learningResult, replayResult, missionResult, liveResult] = await Promise.all([
    getActiveDestinationInstance(companyId, "trainers"),
    prisma.boardCard.count({
      where: {
        companyId,
        boardKey: UNIT_PROJECT_BOARD_KEY,
        OR: [
          { archivedAt: null },
          { archivedAt: { isSet: false } },
        ],
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
    getDestinationLearningSummary({ companyId, destinationKey: "trainers" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    getDestinationReplayCandidates({ companyId, destinationKey: "trainers" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    getDestinationMissionControlSummary(companyId).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
    listTrainersLiveListings({ companyId, listingType: "all" }).then((value) => ({ ok: true as const, value })).catch((error) => ({ ok: false as const, error })),
  ]);

  const unavailableSections: TrainersLandingSummary["unavailableSections"] = [];

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

  const summary: TrainersLandingSummary["summary"] = {
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
  const routes = resolveTrainersRoutes(companyId);
  const entryPoints = [
    resolveTrainersEntryPoint({
      companyId,
      sourceSurface: "trainers-home",
      intent: "open-content-ops",
    }),
    resolveTrainersEntryPoint({
      companyId,
      sourceSurface: "trainers-home",
      intent: "open-live-catalog",
    }),
    resolveTrainersEntryPoint({
      companyId,
      sourceSurface: "trainers-home",
      intent: "open-project-board",
    }),
    resolveTrainersEntryPoint({
      companyId,
      sourceSurface: "trainers-home",
      intent: "open-mission-control",
    }),
    resolveTrainersEntryPoint({
      companyId,
      sourceSurface: "trainers-home",
      intent: "open-visitor-ops",
    }),
    resolveTrainersEntryPoint({
      companyId,
      sourceSurface: "destination-trainers-unit-panel",
      intent: "open-app-home",
    }),
  ];
  const reviewPackets = {
    total: summary.workflowPackets,
    pending: summary.reviewRequired,
    approved: summary.publishedOutcomes,
    rejected: 0,
  };
  const fetchHealth: TrainersLandingSummary["fetchHealth"] = {
    degraded: unavailableSections.length > 0,
    sources: [
      {
        key: "liveListings",
        status: unavailableSections.some((item) => item.key === "liveQueue") ? "failed" : "ok",
        message: unavailableSections.find((item) => item.key === "liveQueue")?.message,
      },
      {
        key: "reviewPackets",
        status: unavailableSections.some((item) => item.key === "learning") ? "degraded" : "ok",
        message: unavailableSections.find((item) => item.key === "learning")?.message,
      },
      {
        key: "learning",
        status: unavailableSections.some((item) => item.key === "learning") ? "degraded" : "ok",
        message: unavailableSections.find((item) => item.key === "learning")?.message,
      },
      {
        key: "missionControl",
        status: unavailableSections.some((item) => item.key === "missionControl") ? "failed" : "ok",
        message: unavailableSections.find((item) => item.key === "missionControl")?.message,
      },
      {
        key: "projectBoard",
        status: "ok",
      },
    ],
  };

  return {
    generatedAt: new Date().toISOString(),
    companyId,
    destinationKey: "trainers",
    liveListings: {
      total: summary.liveListings,
      needsReview: summary.reviewRequired,
      published: Math.max(0, summary.liveListings - summary.reviewRequired),
    },
    reviewPackets,
    learning: {
      packets: summary.workflowPackets,
      published: summary.publishedOutcomes,
      failed: summary.failedWorkflows,
      replayCandidates: summary.replayCandidates,
    },
    missionControl: {
      activeRuns: summary.activeRuns,
      failedRuns: summary.staleRuns,
      retryBacklog: summary.failedWorkflows,
    },
    routeTargets: {
      reviewRoute: routes.reviewRoute,
      opsRoute: routes.opsRoute,
      observabilityRoute: routes.observabilityRoute,
      review: routes.reviewRoute,
      ops: routes.opsRoute,
      observability: routes.observabilityRoute,
    },
    fetchHealth,
    state: classifyTrainersLandingState({
      configured: Boolean(destinationInstance),
      unavailableSections,
      summary,
    }),
    configured: Boolean(destinationInstance),
    bridgeConfigured: isTrainersBridgeConfigured(),
    unavailableSections,
    summary,
    entryPoints,
    actions: [
      {
        key: "content-ops",
        title: "Content Ops",
        description: "Review cards, approve outcomes, and work the human decision queue.",
        href: entryPoints[0].targetDestination,
        tone: "review",
      },
      {
        key: "live-queue",
        title: "Live Catalog Queue",
        description: "Inspect live listings and open destination revisions that need attention.",
        href: entryPoints[1].targetDestination,
        tone: "knowmore",
      },
      {
        key: "project-board",
        title: "Project Board",
        description: "Track unit-level delivery work with shared kanban runtime and explicit execution status.",
        href: entryPoints[2].targetDestination,
        tone: "tactical",
      },
      {
        key: "mission-control",
        title: "Mission Control",
        description: "Monitor runtime health, stale runs, and destination workflow recovery actions.",
        href: entryPoints[3].targetDestination,
        tone: "strategy",
      },
      {
        key: "visitor-ops",
        title: "Visitor Ops",
        description: "Drive research planning, evidence, and gating workflows in one operator console.",
        href: entryPoints[4].targetDestination,
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
