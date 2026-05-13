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
    scoreHealth: null,
    queue: {
      totalActiveJobs: 0,
      runningJobs: 0,
      failedJobs: 0,
      jobs: [],
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
