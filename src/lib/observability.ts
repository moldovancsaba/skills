import fs from "node:fs/promises";
import path from "node:path";
import { getCompanyBudgetSnapshot } from "@/lib/budget-governor";
import { prisma } from "@/lib/db";
import { computeCompanyScoreHealth } from "@/lib/score-health";

const GUARDIAN_HEARTBEAT_PATH = path.join(process.cwd(), "logs/guardian-heartbeat.json");

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getCompanyObservabilitySnapshot(companyId: string) {
  const [guardianHeartbeat, scoreHealth, activeJobs, workerReports, recentEvents, budget] = await Promise.all([
    readJsonFile<Record<string, unknown>>(GUARDIAN_HEARTBEAT_PATH),
    computeCompanyScoreHealth(companyId, prisma),
    prisma.pipelineJob.findMany({
      where: { companyId, status: { in: ["ACTIVE", "RUNNING", "FAILED"] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 10,
    }),
    prisma.workerReport.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 10,
    }),
    prisma.outcomeEvent.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
    }),
    getCompanyBudgetSnapshot(companyId),
  ]);

  const failedJobs = activeJobs.filter((job) => job.status === "FAILED").length;
  const runningJobs = activeJobs.filter((job) => job.status === "RUNNING").length;
  const criticalAlert = scoreHealth?.alerts?.find((alert: any) => alert.severity === "CRITICAL") ?? null;
  const evaluationFailures = recentEvents.filter((event) => event.outcomeType === "EVAL_GATE_FAILED");
  const localLearningEvents = recentEvents.filter((event) => event.outcomeType.startsWith("LOCAL_LEARNING_"));

  return {
    guardianHeartbeat,
    scoreHealth,
    queue: {
      totalActiveJobs: activeJobs.length,
      runningJobs,
      failedJobs,
      jobs: activeJobs,
    },
    recommendedActions: {
      escalateScoreRepair: Boolean(criticalAlert || scoreHealth?.overallBand === "SUSPICIOUS"),
      recoverFailedJobs: failedJobs > 0,
      reviewEvaluationFailures: evaluationFailures.length > 0,
      reviewBudgetPressure: budget.pressure !== "NORMAL" || budget.openEvents.length > 0,
      syncQueue: true,
    },
    evaluation: {
      recentFailures: evaluationFailures,
      failedGateCount: evaluationFailures.length,
    },
    localLearning: {
      recentEvents: localLearningEvents,
      publishedRunCount: localLearningEvents.length,
    },
    budget,
    workerReports,
    recentEvents,
  };
}
