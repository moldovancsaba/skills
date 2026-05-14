const crypto = require("crypto");
const {
  claimNextPipelineJobs,
  completePipelineJob,
  failPipelineJob,
  syncAllCompanyPipelineJobs,
} = require("../../src/lib/pipeline-queue");
const { processFeedbackEvents } = require("./feedback");
const { runMaintenance, rescorePeriodicCards } = require("./maintenance");
const { recomputeFrontier } = require("./frontier");
const {
  performCompanyScrubbing,
  performCompanyWriting,
  performCompanyJudging,
  performCompanyActionGeneration,
  runCompanyPlannerCycle,
} = require("./synthesis");
const { getHumanMemoryPrompt, processMemoryUpdates } = require("./memory");

async function executePipelineJob(prisma, job) {
  const company = job.company ?? await prisma.company.findUnique({ where: { id: job.companyId } });
  if (!company) {
    throw new Error(`Pipeline job ${job.id} has no company`);
  }

  switch (job.jobType) {
    case "FEEDBACK_RECONCILIATION":
      return processFeedbackEvents(prisma, company);
    case "CARD_RESCORING":
      return rescorePeriodicCards(prisma, company);
    case "FRONTIER_RECOMPUTE":
      await recomputeFrontier(prisma, company);
      return 1;
    case "FULL_MAINTENANCE":
      await runMaintenance(prisma, company);
      return 1;
    case "SCORE_ALERT_REPAIR":
      await rescorePeriodicCards(prisma, company);
      await recomputeFrontier(prisma, company);
      return 1;
    case "COMPANY_SYNTHESIS": {
      const cycleRunId = crypto.randomUUID();
      const workerContext = {
        cycleRunId,
        workerId: `pipeline-queue:${process.pid}`,
      };
      await processMemoryUpdates(prisma, company);
      const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
      return runCompanyPlannerCycle(prisma, company, memoryPrompt, null, workerContext);
    }
    case "WORKFLOW_BLUEPRINT": {
      const blueprint = job.entityId
        ? await prisma.workflowBlueprint.findUnique({ where: { id: job.entityId } })
        : null;
      if (!blueprint || blueprint.status !== "ACTIVE") {
        return 0;
      }

      const cycleRunId = crypto.randomUUID();
      const workerContext = {
        cycleRunId,
        workerId: `workflow-blueprint:${process.pid}`,
      };
      await processMemoryUpdates(prisma, company);
      const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
      const steps = Array.isArray(blueprint.steps) ? blueprint.steps : [];
      const kinds = new Set(
        steps
          .map((step) => (step && typeof step === "object" ? step.kind : null))
          .filter((value) => typeof value === "string"),
      );
      let ops = 0;

      if (kinds.has("QUEUE")) {
        ops += await processFeedbackEvents(prisma, company);
      }
      if (kinds.has("ENRICH")) {
        ops += await performCompanyScrubbing(prisma, company, memoryPrompt, null, workerContext);
      }
      if (kinds.has("SEARCH")) {
        ops += 1;
      }
      if (kinds.has("ANSWER")) {
        ops += await performCompanyWriting(prisma, company, memoryPrompt, null, workerContext);
      }
      if (kinds.has("REVIEW")) {
        ops += await performCompanyJudging(prisma, company, memoryPrompt, null, workerContext);
      }
      if (kinds.has("RESCORE")) {
        ops += await rescorePeriodicCards(prisma, company);
      }
      if (kinds.has("QUEUE") || kinds.has("REVIEW") || kinds.has("RESCORE")) {
        await recomputeFrontier(prisma, company);
        ops += 1;
      }

      return ops;
    }
    default:
      return 0;
  }
}

function estimatePipelineJobCostMicros({ workloadUnits, runtimeMs, retryCount }) {
  return Math.max(0, Math.round((workloadUnits || 1) * 2500 + (runtimeMs || 0) * 2 + (retryCount || 0) * 1000));
}

async function recordPipelineJobUsage(prisma, job, input) {
  if (!prisma.aiWorkloadUsage) return null;
  const workloadUnits = Math.max(0.1, Number(input.workloadUnits || 1));
  const runtimeMs = Math.max(0, Math.round(Number(input.runtimeMs || 0)));
  const retryCount = Math.max(0, Math.round(Number(input.retryCount || 0)));
  return prisma.aiWorkloadUsage.create({
    data: {
      companyId: job.companyId,
      feature: "pipeline-queue",
      jobType: job.jobType,
      provider: "local-worker",
      entityType: job.entityType || "COMPANY",
      entityId: job.entityId || job.companyId,
      usageKind: "ESTIMATED",
      workloadUnits,
      runtimeMs,
      localComputeMs: runtimeMs,
      retryCount,
      estimatedCostMicros: estimatePipelineJobCostMicros({ workloadUnits, runtimeMs, retryCount }),
      valueSignal: input.valueSignal || "QUEUE_WORK",
      metadata: {
        status: input.status,
        queueColumn: job.queueColumn,
        controlMode: job.controlMode,
        reason: input.reason || null,
      },
    },
  });
}

async function runPipelineQueueBatch(prisma, limit = 3) {
  await syncAllCompanyPipelineJobs(prisma);
  const claimed = await claimNextPipelineJobs(prisma, limit);
  let executed = 0;

  for (const job of claimed) {
    const startedAt = Date.now();
    try {
      const result = await executePipelineJob(prisma, job);
      const workloadUnits = typeof result === "number" ? Math.max(1, result) : 1;
      await completePipelineJob(
        prisma,
        job.id,
        typeof result === "number"
          ? `${job.jobType} completed with ${result} operation(s).`
          : `${job.jobType} completed successfully.`,
      );
      await recordPipelineJobUsage(prisma, job, {
        status: "COMPLETED",
        workloadUnits,
        runtimeMs: Date.now() - startedAt,
        retryCount: job.attemptCount || 0,
        valueSignal: workloadUnits > 0 ? "QUEUE_WORK_COMPLETED" : "NO_OP",
        reason: typeof result === "number" ? `${result} operation(s)` : "completed",
      });
      executed += 1;
    } catch (error) {
      console.error(`[PIPELINE QUEUE] ${job.jobType} failed for ${job.company?.name ?? job.companyId}:`, error.message);
      await failPipelineJob(prisma, job.id, error);
      await recordPipelineJobUsage(prisma, job, {
        status: "FAILED",
        workloadUnits: 1,
        runtimeMs: Date.now() - startedAt,
        retryCount: (job.attemptCount || 0) + 1,
        valueSignal: "RETRY_WASTE_RISK",
        reason: error.message,
      });
    }
  }

  return executed;
}

module.exports = {
  executePipelineJob,
  runPipelineQueueBatch,
};
