import fs from "node:fs/promises";
import path from "node:path";
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
  const [guardianHeartbeat, scoreHealth, activeJobs, workerReports, recentEvents] = await Promise.all([
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
  ]);

  const failedJobs = activeJobs.filter((job) => job.status === "FAILED").length;
  const runningJobs = activeJobs.filter((job) => job.status === "RUNNING").length;

  return {
    guardianHeartbeat,
    scoreHealth,
    queue: {
      totalActiveJobs: activeJobs.length,
      runningJobs,
      failedJobs,
      jobs: activeJobs,
    },
    workerReports,
    recentEvents,
  };
}
