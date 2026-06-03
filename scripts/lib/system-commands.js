"use strict";

const {
  syncCompanyPipelineJobs,
  escalateCompanyPipelineJob,
  recoverFailedCompanyPipelineJobs,
} = require("../../src/lib/pipeline-queue");
const { safeRecordLocalLaneEvent } = require("./runtime/lane-events");

const SYSTEM_HEALTH_COMMANDS = new Map([
  ["SYNC_PIPELINE_JOBS", "QUEUE_TOPOLOGY_REPAIR"],
  ["RECOVER_FAILED_PIPELINE_JOBS", "STALE_JOB_RECOVERY"],
  ["REFRESH_INTELLIGENCE_SNAPSHOTS", "PROJECTION_TRUTH_REPAIR"],
]);

function resolveSystemCommandContext(command, payload = {}) {
  const healthAction = SYSTEM_HEALTH_COMMANDS.get(command);
  return {
    lane: healthAction ? "SYSTEM_HEALTH" : "PLAYLIST",
    healthAction: healthAction || null,
    companyId: typeof payload.companyId === "string" && payload.companyId ? payload.companyId : null,
  };
}

function safeSummary(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 180);
}

async function recordCommandLaneEvent(prisma, context, command, eventType, details = {}) {
  const { lane, companyId, healthAction } = context;
  return safeRecordLocalLaneEvent(prisma, {
    lane,
    eventType,
    actor: "local-worker",
    companyId,
    summary: safeSummary(`${command} ${eventType.toLowerCase()} in local execution lane (${lane}).`),
    metadata: {
      command,
      healthAction,
      ...details,
    },
  });
}

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
    const payload = cmd.payload && typeof cmd.payload === "object" ? cmd.payload : {};
    const context = resolveSystemCommandContext(cmd.command, payload);
    const startedAt = Date.now();
    const reason = typeof payload.reason === "string" && payload.reason.trim()
      ? payload.reason.trim()
      : null;
    await prisma.systemCommand.update({
      where: { id: cmd.id },
      data: { status: "PROCESSING", updatedAt: new Date(), error: null },
    });
    await recordCommandLaneEvent(prisma, context, cmd.command, "STARTED", {
      reason,
      commandId: cmd.id,
    });

    try {
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

      await recordCommandLaneEvent(prisma, context, cmd.command, "COMPLETED", {
        commandId: cmd.id,
        runtimeMs: Date.now() - startedAt,
      });

      await prisma.systemCommand.update({
        where: { id: cmd.id },
        data: { status: "DONE", updatedAt: new Date(), error: null },
      });
    } catch (error) {
      await recordCommandLaneEvent(prisma, context, cmd.command, "FAILED", {
        commandId: cmd.id,
        runtimeMs: Date.now() - startedAt,
        error: String(error?.message ?? error ?? "unknown worker command failure"),
      });
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
