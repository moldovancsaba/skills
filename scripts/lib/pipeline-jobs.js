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
      let ops = 0;
      ops += await performCompanyScrubbing(prisma, company, memoryPrompt, null, workerContext);
      ops += await performCompanyWriting(prisma, company, memoryPrompt, null, workerContext);
      ops += await performCompanyJudging(prisma, company, memoryPrompt, null, workerContext);
      ops += await performCompanyActionGeneration(prisma, company, memoryPrompt, null, workerContext);
      return ops;
    }
    default:
      return 0;
  }
}

async function runPipelineQueueBatch(prisma, limit = 3) {
  await syncAllCompanyPipelineJobs(prisma);
  const claimed = await claimNextPipelineJobs(prisma, limit);
  let executed = 0;

  for (const job of claimed) {
    try {
      const result = await executePipelineJob(prisma, job);
      await completePipelineJob(
        prisma,
        job.id,
        typeof result === "number"
          ? `${job.jobType} completed with ${result} operation(s).`
          : `${job.jobType} completed successfully.`,
      );
      executed += 1;
    } catch (error) {
      console.error(`[PIPELINE QUEUE] ${job.jobType} failed for ${job.company?.name ?? job.companyId}:`, error.message);
      await failPipelineJob(prisma, job.id, error);
    }
  }

  return executed;
}

module.exports = {
  executePipelineJob,
  runPipelineQueueBatch,
};
