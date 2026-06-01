import { prisma } from "@/lib/db";
import {
  countLocalInteractionEvents,
  countLocalOutcomeEvents,
  findLocalInteractionEvents,
} from "@/lib/local-audit-db";
import { getAllMiniappIntelligenceHealth } from "@/lib/miniapp-intelligence-health";

function buildDefaultOpportunitycardRepairState() {
  return {
    version: 1,
    status: "PENDING",
    processed: 0,
    updated: 0,
    lastBatchProcessed: 0,
    lastBatchUpdated: 0,
    batchesProcessed: 0,
    startedAt: null,
    lastRunAt: null,
    completedAt: null,
    lastError: null,
    cursor: null,
    stateUpdatedAt: null,
  };
}

function buildDefaultObservabilitySummary() {
  return {
    guardianHeartbeat: null,
    workerBuild: null,
    scoreHealth: null,
    queue: {
      totalActiveJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      jobs: [],
    },
    sales: {
      opportunitycards: 0,
      searchQueued: 0,
      searchRunning: 0,
      searchFailed: 0,
      mineQueued: 0,
      mineRunning: 0,
      mineFailed: 0,
    },
    opportunitycardRepair: buildDefaultOpportunitycardRepairState(),
    planner: {
      operatingMode: "UNKNOWN",
      datacardCount: 0,
      flashcardCount: 0,
      unmetFlashcardTarget: 0,
      unmetLaneTargets: [],
      activeManualCooldownCount: 0,
      timeoutEvents: [],
      qualityCeilingEvents: [],
      manualCooldownEvents: [],
      researchRunEvents: [],
      researchSkipEvents: [],
      noveltyBlockedEvents: [],
      feedbackPressureBlockEvents: [],
      feedbackPressureSkipEvents: [],
      editorialDowngradeEvents: [],
      timeoutCount: 0,
      qualityCeilingCount: 0,
      manualCooldownBlockCount: 0,
      researchRunCount: 0,
      researchSkipCount: 0,
      noveltyBlockedCount: 0,
      feedbackPressureBlockCount: 0,
      feedbackPressureSkipCount: 0,
      editorialDowngradeCount: 0,
      recentEvents: [],
    },
    quality: {
      flashcards: {
        sampleSize: 0,
        averages: {
          evidenceQuality: 0,
          linguisticQuality: 0,
          actionabilityQuality: 0,
          strategicValue: 0,
          aggregate: 0,
        },
        weakestDimension: null,
        degradationCounts: {
          evidenceQuality: 0,
          linguisticQuality: 0,
          actionabilityQuality: 0,
          strategicValue: 0,
        },
      },
      goals: {
        sampleSize: 0,
        averages: {
          evidenceQuality: 0,
          linguisticQuality: 0,
          actionabilityQuality: 0,
          strategicValue: 0,
          aggregate: 0,
        },
        weakestDimension: null,
        degradationCounts: {
          evidenceQuality: 0,
          linguisticQuality: 0,
          actionabilityQuality: 0,
          strategicValue: 0,
        },
      },
      tasks: {
        sampleSize: 0,
        averages: {
          evidenceQuality: 0,
          linguisticQuality: 0,
          actionabilityQuality: 0,
          strategicValue: 0,
          aggregate: 0,
        },
        weakestDimension: null,
        degradationCounts: {
          evidenceQuality: 0,
          linguisticQuality: 0,
          actionabilityQuality: 0,
          strategicValue: 0,
        },
      },
    },
    recommendedActions: {
      escalateScoreRepair: false,
      reviewOpportunitycardRepair: true,
      recoverFailedJobs: false,
      reviewEvaluationFailures: false,
      reviewBudgetPressure: false,
      syncQueue: true,
    },
    evaluation: {
      recentFailures: [],
      failedGateCount: 0,
    },
    localLearning: {
      recentEvents: [],
      publishedRunCount: 0,
    },
    budget: {
      pressure: "UNKNOWN",
      totalEstimatedCost: 0,
      totalWorkloadUnits: 0,
      usageCount: 0,
      usageByFeature: [],
      openEvents: [],
      recommendations: [],
      windowHours: 24,
    },
    workerReports: [],
    recentEvents: [],
    capabilityTransactions: {
      appliedLast24h: 0,
      previewsLast24h: 0,
      recentApplies: [],
      latestApplyAt: null,
      conflictLast24h: 0,
      validationFailuresLast24h: 0,
    },
    miniappIntelligenceHealth: {},
  };
}

async function readLiveOpportunitycardRepairState() {
  const setting = await prisma.globalSetting.findUnique({
    where: { key: "opportunitycard_score_contract_repair_v1" },
    select: { value: true, updatedAt: true },
  });
  const value = setting?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return buildDefaultOpportunitycardRepairState();
  }

  return {
    version: Number(value.version || 1),
    status: typeof value.status === "string" ? value.status : "PENDING",
    processed: Number(value.processed || 0),
    updated: Number(value.updated || 0),
    lastBatchProcessed: Number(value.lastBatchProcessed || 0),
    lastBatchUpdated: Number(value.lastBatchUpdated || 0),
    batchesProcessed: Number(value.batchesProcessed || 0),
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
    lastRunAt: typeof value.lastRunAt === "string" ? value.lastRunAt : null,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
    cursor: value.cursor && typeof value.cursor === "object" && !Array.isArray(value.cursor) ? value.cursor : null,
    stateUpdatedAt: setting?.updatedAt ? new Date(setting.updatedAt).toISOString() : null,
  };
}

async function readCapabilityTransactionSummary(companyId: string) {
  const last24h = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const [
    appliedLast24h,
    previewsLast24h,
    conflictLast24h,
    validationFailuresLast24h,
    recentApplyInteractions,
  ] = await Promise.all([
    countLocalOutcomeEvents({
      where: {
        companyId,
        outcomeType: "UNIT_CAPABILITIES_UPDATED",
        createdAt: { gte: last24h },
      },
    }),
    countLocalInteractionEvents({
      where: {
        companyId,
        interactionType: "CAPABILITY_TRANSACTION_PREVIEW",
        createdAt: { gte: last24h },
      },
    }),
    countLocalInteractionEvents({
      where: {
        companyId,
        interactionType: "CAPABILITY_TRANSACTION_CONFLICT",
        createdAt: { gte: last24h },
      },
    }),
    countLocalInteractionEvents({
      where: {
        companyId,
        interactionType: "CAPABILITY_TRANSACTION_VALIDATION_FAILED",
        createdAt: { gte: last24h },
      },
    }),
    findLocalInteractionEvents({
      where: {
        companyId,
        interactionType: "CAPABILITY_TRANSACTION_APPLY",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        payload: true,
        userEmail: true,
      },
    }),
  ]);

  return {
    appliedLast24h,
    previewsLast24h,
    conflictLast24h,
    validationFailuresLast24h,
    latestApplyAt: recentApplyInteractions[0]?.createdAt
      ? new Date(recentApplyInteractions[0].createdAt).toISOString()
      : null,
    recentApplies: recentApplyInteractions.map((event) => {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? event.payload as Record<string, unknown>
        : null;
      const impact = payload?.impact && typeof payload.impact === "object" && !Array.isArray(payload.impact)
        ? payload.impact as Record<string, unknown>
        : null;
      return {
        id: event.id,
        at: new Date(event.createdAt).toISOString(),
        actor: event.userEmail || "unknown",
        expectedVersion: typeof payload?.expectedVersion === "string" ? payload.expectedVersion : null,
        hiddenRoutes: Array.isArray(impact?.hiddenRoutes) ? impact?.hiddenRoutes.length : 0,
        blockedOperations: Array.isArray(impact?.blockedOperations) ? impact?.blockedOperations.length : 0,
      };
    }),
  };
}

export async function getCompanyObservabilitySnapshot(companyId: string) {
  const [snapshot, liveOpportunitycardRepair, capabilityTransactions, miniappIntelligenceHealth] = await Promise.all([
    prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: { observabilitySummary: true },
    }),
    readLiveOpportunitycardRepairState(),
    readCapabilityTransactionSummary(companyId),
    getAllMiniappIntelligenceHealth(companyId),
  ]);

  const summary = snapshot?.observabilitySummary;
  const base: Record<string, unknown> =
    summary && typeof summary === "object" && !Array.isArray(summary)
      ? summary as Record<string, unknown>
      : buildDefaultObservabilitySummary();

  const recommendedActionsValue = base.recommendedActions;
  const recommendedActions =
    recommendedActionsValue && typeof recommendedActionsValue === "object" && !Array.isArray(recommendedActionsValue)
      ? recommendedActionsValue as Record<string, unknown>
      : {};

  return {
    ...base,
    opportunitycardRepair: liveOpportunitycardRepair,
    capabilityTransactions,
    miniappIntelligenceHealth,
    recommendedActions: {
      ...recommendedActions,
      reviewOpportunitycardRepair: liveOpportunitycardRepair.status !== "COMPLETED",
    },
  };
}
