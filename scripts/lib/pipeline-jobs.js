const crypto = require("crypto");
const {
  claimNextPipelineJobs,
  completePipelineJob,
  failPipelineJob,
  PLANNER_BOOTSTRAP_JOB_TYPES,
  PLANNER_QUALITY_JOB_TYPES,
  PLANNER_MAINTENANCE_JOB_TYPES,
  recoverStaleRunningPipelineJobs,
  syncPipelineJobsForCompanyShard,
  syncAllCompanyPipelineJobsIfDue,
  getPipelineJobLabel,
} = require("../../src/lib/pipeline-queue");
const {
  getFreeMemoryMb,
  getResourceBand,
} = require("./runtime/resource-bands");
const { processFeedbackEvents } = require("./feedback");
const { runMaintenance, rescorePeriodicCards } = require("./maintenance");
const { recomputeFrontier } = require("./frontier");
const {
  refreshOldestFlashcards,
  refreshOldestTasks,
  refreshOldestDatacards,
  refreshOldestGoals,
} = require("./planner/maintenance-cycle");
const {
  performCompanyScrubbing,
  performCompanyWriting,
  performCompanyJudging,
  performCompanyActionGeneration,
  runCompanyPlannerCycle,
  updateProgress,
} = require("./synthesis");
const { getHumanMemoryPrompt, processMemoryUpdates } = require("./memory");

function isPlannerBootstrapJob(jobType) {
  return PLANNER_BOOTSTRAP_JOB_TYPES.includes(jobType);
}

function isPlannerMaintenanceJob(jobType) {
  return PLANNER_MAINTENANCE_JOB_TYPES.includes(jobType);
}

function isPlannerQualityJob(jobType) {
  return PLANNER_QUALITY_JOB_TYPES.includes(jobType);
}

function buildSourceLabel(source) {
  const provenance = typeof source?.provenance === "string" ? source.provenance.trim() : "";
  if (provenance) return provenance;
  const content = typeof source?.content === "string" ? source.content.replace(/\s+/g, " ").trim() : "";
  if (!content) return source?.publicId ? `Datacard #${source.publicId}` : "Datacard";
  return content.length > 96 ? `${content.slice(0, 96).trimEnd()}...` : content;
}

async function resolvePipelineEntityLabel(prisma, job) {
  if (!job?.entityId) return null;
  const entityType = String(job.entityType || "").toUpperCase();

  if (entityType === "FLASHCARD") {
    const flashcard = await prisma.flashcard.findUnique({
      where: { id: job.entityId },
      select: { title: true, publicId: true },
    });
    return flashcard?.title || (flashcard?.publicId ? `Flashcard #${flashcard.publicId}` : "Flashcard");
  }

  if (entityType === "CHECKLIST_TASK" || entityType === "TASK" || entityType === "CHECKLIST") {
    const task = await prisma.checklistTask.findUnique({
      where: { id: job.entityId },
      select: { title: true, publicId: true },
    });
    return task?.title || (task?.publicId ? `Task #${task.publicId}` : "Task");
  }

  if (entityType === "GOALCARD" || entityType === "GOAL") {
    const goal = await prisma.goalcard.findUnique({
      where: { id: job.entityId },
      select: { title: true, publicId: true },
    });
    return goal?.title || (goal?.publicId ? `Goal #${goal.publicId}` : "Goal");
  }

  if (entityType === "SOURCE" || entityType === "DATACARD") {
    const source = await prisma.source.findUnique({
      where: { id: job.entityId },
      select: { publicId: true, provenance: true, content: true },
    });
    return buildSourceLabel(source);
  }

  if (entityType === "FILE" || entityType === "UPLOADED_SOURCE_FILE") {
    const file = await prisma.uploadedSourceFile.findUnique({
      where: { id: job.entityId },
      select: { name: true, publicId: true },
    });
    return file?.name || (file?.publicId ? `File #${file.publicId}` : "File");
  }

  return null;
}

function buildActiveTaskString(job, companyName, entityLabel) {
  const jobLabel = getPipelineJobLabel(job.jobType);
  const entityType = String(job.entityType || "COMPANY").toUpperCase();
  if (entityType === "COMPANY" || !entityLabel || entityLabel === job.companyId) {
    return companyName ? `${jobLabel} for ${companyName}` : jobLabel;
  }
  return companyName ? `${jobLabel} for ${companyName}: ${entityLabel}` : `${jobLabel}: ${entityLabel}`;
}

const MEMORY_INTENSIVE_PIPELINE_JOB_TYPES = new Set([
  "ENSURE_FLASHCARD_MINIMUM",
  "RESEARCH_BACKFILL",
  "MINE_FLASHCARD_OPPORTUNITIES",
  "MINE_TASK_OPPORTUNITIES",
  "FEEDBACK_PRESSURE_REGENERATION",
  "REFRESH_FLASHCARDS",
  "REFRESH_TASKS",
  "REFRESH_DATACARDS",
  "REFRESH_GOALS",
  "COMPANY_SYNTHESIS",
  "FULL_MAINTENANCE",
  "WORKFLOW_BLUEPRINT",
]);

function createPipelineDeferredError(message, retryAfterMs) {
  const error = new Error(message);
  error.pipelineClass = "LOW_MEMORY_SKIP";
  error.retryable = true;
  error.retryAfterMs = retryAfterMs;
  return error;
}

function assertPipelineJobCanRun(job) {
  const freeMemMb = getFreeMemoryMb();
  const resourceBand = getResourceBand(freeMemMb);
  if (!MEMORY_INTENSIVE_PIPELINE_JOB_TYPES.has(job.jobType)) {
    return;
  }

  if (resourceBand === "DEGRADED") {
    throw createPipelineDeferredError(
      `${job.jobType} deferred because memory pressure is ${resourceBand} (${freeMemMb}MB free).`,
      5 * 60 * 1000,
    );
  }
  if (resourceBand === "CONSTRAINED" && isPlannerQualityJob(job.jobType)) {
    throw createPipelineDeferredError(
      `${job.jobType} deferred because memory pressure is ${resourceBand} (${freeMemMb}MB free).`,
      3 * 60 * 1000,
    );
  }
}

async function runPlannerBootstrapJob(prisma, company) {
  const cycleRunId = crypto.randomUUID();
  const workerContext = {
    cycleRunId,
    workerId: `pipeline-queue:${process.pid}`,
  };
  await processMemoryUpdates(prisma, company);
  const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
  return runCompanyPlannerCycle(prisma, company, memoryPrompt, null, workerContext);
}

async function runPlannerMaintenanceJob(prisma, company, jobType) {
  switch (jobType) {
    case "REFRESH_FLASHCARDS":
      return (await refreshOldestFlashcards(prisma, company)).length;
    case "REFRESH_TASKS": {
      const refreshed = await refreshOldestTasks(prisma, company);
      await recomputeFrontier(prisma, company);
      return refreshed.length + 1;
    }
    case "REFRESH_DATACARDS":
      return (await refreshOldestDatacards(prisma, company)).length;
    case "REFRESH_GOALS":
      return (await refreshOldestGoals(prisma, company)).length;
    default:
      return 0;
  }
}

async function runPlannerQualityJob(prisma, company, jobType) {
  const cycleRunId = crypto.randomUUID();
  const workerContext = {
    cycleRunId,
    workerId: `pipeline-quality:${process.pid}`,
  };
  await processMemoryUpdates(prisma, company);
  const memoryPrompt = await getHumanMemoryPrompt(prisma, company);

  switch (jobType) {
    case "MINE_FLASHCARD_OPPORTUNITIES":
      return performCompanyWriting(prisma, company, memoryPrompt, null, workerContext);
    case "MINE_TASK_OPPORTUNITIES":
      return performCompanyActionGeneration(prisma, company, memoryPrompt, null, workerContext);
    case "FEEDBACK_PRESSURE_REGENERATION": {
      const taskOps = await performCompanyActionGeneration(prisma, company, memoryPrompt, null, workerContext);
      const refreshOps = await refreshOldestTasks(prisma, company);
      await recomputeFrontier(prisma, company);
      return taskOps + refreshOps.length + 1;
    }
    default:
      return 0;
  }
}

async function executePipelineJob(prisma, job) {
  const company = job.company ?? await prisma.company.findUnique({ where: { id: job.companyId } });
  if (!company) {
    throw new Error(`Pipeline job ${job.id} has no company`);
  }

  if (isPlannerBootstrapJob(job.jobType)) {
    return runPlannerBootstrapJob(prisma, company);
  }
  if (isPlannerMaintenanceJob(job.jobType)) {
    return runPlannerMaintenanceJob(prisma, company, job.jobType);
  }
  if (isPlannerQualityJob(job.jobType)) {
    return runPlannerQualityJob(prisma, company, job.jobType);
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
      return runPlannerBootstrapJob(prisma, company);
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

function startRunningJobHeartbeat(prisma, job, companyName, entityLabel) {
  let stopped = false;
  let inFlight = false;
  const heartbeatMs = 30000;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const now = new Date();
      await Promise.all([
        updateProgress(prisma, {
          state: "running",
          stage: "PIPELINE_QUEUE",
          currentCompany: companyName,
          activeTask: buildActiveTaskString(job, companyName, entityLabel),
        }),
        prisma.pipelineJob.updateMany({
          where: {
            id: job.id,
            status: "RUNNING",
          },
          data: {
            updatedAt: now,
          },
        }),
      ]);
    } catch (error) {
      console.warn(`[PIPELINE QUEUE] Heartbeat failed for ${job.jobType} ${job.id}: ${error?.message || error}`);
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, heartbeatMs);

  return async () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function runPipelineQueueBatch(prisma, limit = 1) {
  await recoverStaleRunningPipelineJobs(prisma);
  let claimed = await claimNextPipelineJobs(prisma, limit);
  if (claimed.length === 0) {
    await syncPipelineJobsForCompanyShard(prisma, limit + 1);
    await syncAllCompanyPipelineJobsIfDue(prisma);
    claimed = await claimNextPipelineJobs(prisma, limit);
  }
  let executed = 0;

  for (const job of claimed) {
    const startedAt = Date.now();
    let stopHeartbeat = null;
    try {
      const companyName = job.company?.name
        || (job.companyId
          ? (await prisma.company.findUnique({
              where: { id: job.companyId },
              select: { name: true },
            }))?.name || job.companyId
          : null);
      const entityLabel = await resolvePipelineEntityLabel(prisma, job);
      await updateProgress(prisma, {
        state: "running",
        stage: "PIPELINE_QUEUE",
        currentCompany: companyName,
        activeTask: buildActiveTaskString(job, companyName, entityLabel),
      });
      stopHeartbeat = startRunningJobHeartbeat(prisma, job, companyName, entityLabel);
      assertPipelineJobCanRun(job);
      const result = await executePipelineJob(prisma, job);
      if (stopHeartbeat) {
        await stopHeartbeat();
        stopHeartbeat = null;
      }
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
      if (stopHeartbeat) {
        await stopHeartbeat();
        stopHeartbeat = null;
      }
      console.error(`[PIPELINE QUEUE] ${job.jobType} failed for ${job.company?.name ?? job.companyId}:`, error.message);
      await failPipelineJob(prisma, job, error);
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
