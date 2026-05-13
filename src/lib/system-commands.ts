import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type SystemCommandName =
  | "RESTART"
  | "PURGE_CACHE"
  | "SYNC_PIPELINE_JOBS"
  | "ESCALATE_PIPELINE_JOB"
  | "RECOVER_FAILED_PIPELINE_JOBS"
  | "REFRESH_INTELLIGENCE_SNAPSHOTS";

export async function issueSystemCommand(command: SystemCommandName, payload: Record<string, unknown> = {}) {
  return prisma.systemCommand.create({
    data: {
      command,
      payload: payload as Prisma.InputJsonValue,
      status: "PENDING",
    },
  });
}
