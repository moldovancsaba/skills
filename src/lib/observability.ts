import { prisma } from "@/lib/db";

export async function getCompanyObservabilitySnapshot(companyId: string) {
  const snapshot = await prisma.intelligenceSnapshot.findUnique({
    where: { companyId },
    select: { observabilitySummary: true },
  });

  const summary = snapshot?.observabilitySummary;
  if (summary && typeof summary === "object") {
    return summary;
  }

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
  };
}
