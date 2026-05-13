"use strict";

const {
  syncCompanyPipelineJobs,
  escalateCompanyPipelineJob,
  recoverFailedCompanyPipelineJobs,
} = require("../../src/lib/pipeline-queue");

async function processPendingWorkerCommands(prisma, refreshAllIntelligenceSnapshots) {
  const commands = await prisma.systemCommand.findMany({
    where: {
      status: "PENDING",
      command: {
        in: [
          "SYNC_PIPELINE_JOBS",
          "ESCALATE_PIPELINE_JOB",
          "RECOVER_FAILED_PIPELINE_JOBS",
          "REFRESH_INTELLIGENCE_SNAPSHOTS",
        ],
      },
    },
    orderBy: { issuedAt: "asc" },
  });

  for (const cmd of commands) {
    await prisma.systemCommand.update({
      where: { id: cmd.id },
      data: { status: "PROCESSING", updatedAt: new Date(), error: null },
    });

    try {
      const payload = cmd.payload && typeof cmd.payload === "object" ? cmd.payload : {};

      switch (cmd.command) {
        case "SYNC_PIPELINE_JOBS":
          if (typeof payload.companyId !== "string" || !payload.companyId) {
            throw new Error("SYNC_PIPELINE_JOBS requires payload.companyId");
          }
          await syncCompanyPipelineJobs(prisma, payload.companyId);
          break;
        case "ESCALATE_PIPELINE_JOB":
          if (typeof payload.companyId !== "string" || !payload.companyId) {
            throw new Error("ESCALATE_PIPELINE_JOB requires payload.companyId");
          }
          if (typeof payload.jobType !== "string" || !payload.jobType) {
            throw new Error("ESCALATE_PIPELINE_JOB requires payload.jobType");
          }
          await escalateCompanyPipelineJob(
            prisma,
            payload.companyId,
            payload.jobType,
            typeof payload.entityType === "string" && payload.entityType ? payload.entityType : "COMPANY",
            typeof payload.entityId === "string" && payload.entityId ? payload.entityId : payload.companyId,
          );
          break;
        case "RECOVER_FAILED_PIPELINE_JOBS":
          if (typeof payload.companyId !== "string" || !payload.companyId) {
            throw new Error("RECOVER_FAILED_PIPELINE_JOBS requires payload.companyId");
          }
          await recoverFailedCompanyPipelineJobs(prisma, payload.companyId);
          break;
        case "REFRESH_INTELLIGENCE_SNAPSHOTS":
          await refreshAllIntelligenceSnapshots(prisma);
          break;
        default:
          throw new Error(`Unsupported worker command: ${cmd.command}`);
      }

      await prisma.systemCommand.update({
        where: { id: cmd.id },
        data: { status: "DONE", updatedAt: new Date(), error: null },
      });
    } catch (error) {
      await prisma.systemCommand.update({
        where: { id: cmd.id },
        data: {
          status: "FAILED",
          updatedAt: new Date(),
          error: String(error?.message ?? error ?? "unknown worker command failure"),
        },
      });
    }
  }

  return commands.length;
}

module.exports = {
  processPendingWorkerCommands,
};
