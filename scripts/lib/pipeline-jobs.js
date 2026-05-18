const crypto = require("crypto");
const {
  claimNextPipelineJobs,
  finalizeSuccessfulPipelineJob,
  failPipelineJob,
  classifyPipelineJobError,
  PIPELINE_FAILURE_CLASSES,
  PLANNER_BOOTSTRAP_JOB_TYPES,
  PLANNER_QUALITY_JOB_TYPES,
  PLANNER_MAINTENANCE_JOB_TYPES,
  recoverStaleRunningPipelineJobs,
  getPipelineJobLabel,
  spawnLowMemoryDecompositionChildJob,
} = require("../../src/lib/pipeline-queue");
const {
  getFreeMemoryMb,
  getResourceBand,
  RESOURCE_BANDS,
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

const LOW_MEMORY_DECOMPOSABLE_PIPELINE_JOB_TYPES = new Set([
  "ENSURE_FLASHCARD_MINIMUM",
  "RESEARCH_BACKFILL",
  "ENSURE_IDEABANK_MINIMUM",
  "ENSURE_ROADMAP_MINIMUM",
  "ENSURE_BACKLOG_MINIMUM",
  "ENSURE_TODO_MINIMUM",
  "ENSURE_CHECKLIST_MINIMUM",
  "MINE_FLASHCARD_OPPORTUNITIES",
  "MINE_TASK_OPPORTUNITIES",
  "FEEDBACK_PRESSURE_REGENERATION",
]);

const JOB_WEIGHT_CLASSES = Object.freeze({
  LIGHT: "LIGHT",
  MEDIUM: "MEDIUM",
  HEAVY: "HEAVY",
  BURST: "BURST",
});

const PIPELINE_JOB_WEIGHT_CLASS = Object.freeze({
  FEEDBACK_RECONCILIATION: JOB_WEIGHT_CLASSES.LIGHT,
  CARD_RESCORING: JOB_WEIGHT_CLASSES.MEDIUM,
  FRONTIER_RECOMPUTE: JOB_WEIGHT_CLASSES.LIGHT,
  SCORE_ALERT_REPAIR: JOB_WEIGHT_CLASSES.MEDIUM,
  ENSURE_FLASHCARD_MINIMUM: JOB_WEIGHT_CLASSES.HEAVY,
  RESEARCH_BACKFILL: JOB_WEIGHT_CLASSES.BURST,
  ENSURE_IDEABANK_MINIMUM: JOB_WEIGHT_CLASSES.HEAVY,
  ENSURE_ROADMAP_MINIMUM: JOB_WEIGHT_CLASSES.HEAVY,
  ENSURE_BACKLOG_MINIMUM: JOB_WEIGHT_CLASSES.HEAVY,
  ENSURE_TODO_MINIMUM: JOB_WEIGHT_CLASSES.HEAVY,
  ENSURE_CHECKLIST_MINIMUM: JOB_WEIGHT_CLASSES.HEAVY,
  MINE_FLASHCARD_OPPORTUNITIES: JOB_WEIGHT_CLASSES.HEAVY,
  MINE_TASK_OPPORTUNITIES: JOB_WEIGHT_CLASSES.HEAVY,
  FEEDBACK_PRESSURE_REGENERATION: JOB_WEIGHT_CLASSES.HEAVY,
  REFRESH_FLASHCARDS: JOB_WEIGHT_CLASSES.MEDIUM,
  REFRESH_TASKS: JOB_WEIGHT_CLASSES.MEDIUM,
  REFRESH_DATACARDS: JOB_WEIGHT_CLASSES.MEDIUM,
  REFRESH_GOALS: JOB_WEIGHT_CLASSES.MEDIUM,
  COMPANY_SYNTHESIS: JOB_WEIGHT_CLASSES.HEAVY,
  FULL_MAINTENANCE: JOB_WEIGHT_CLASSES.BURST,
  WORKFLOW_BLUEPRINT: JOB_WEIGHT_CLASSES.BURST,
});

function createPipelineDeferredError(message, retryAfterMs) {
  const error = new Error(message);
  error.pipelineClass = "LOW_MEMORY_SKIP";
  error.retryable = true;
  error.retryAfterMs = retryAfterMs;
  return error;
}

function buildExecutionOptionsForJob(job, resourceBand) {
  const attemptCount = Number(job?.attemptCount || 0);
  const weightClass = PIPELINE_JOB_WEIGHT_CLASS[job?.jobType] || JOB_WEIGHT_CLASSES.MEDIUM;
  const executionOptions = {
    profile: "full",
    batchLimitOverride: null,
    disableResearchBackfill: false,
    countOverrides: null,
    selectionOffset: 0,
    weightClass,
  };

  if (resourceBand === RESOURCE_BANDS.HEALTHY) {
    return executionOptions;
  }

  if (resourceBand === RESOURCE_BANDS.CONSTRAINED) {
    if (weightClass === JOB_WEIGHT_CLASSES.HEAVY || weightClass === JOB_WEIGHT_CLASSES.BURST) {
      return {
        ...executionOptions,
        profile: attemptCount >= 2 ? "minimal" : "degraded",
        batchLimitOverride: attemptCount >= 2 ? 1 : 2,
        disableResearchBackfill: attemptCount >= 2,
        countOverrides: {
          flashcards: 1,
          taskcards: 1,
          datacards: 1,
          goalcards: 1,
        },
      };
    }
    return {
      ...executionOptions,
      profile: "degraded",
      batchLimitOverride: 2,
      countOverrides: {
        flashcards: 1,
        taskcards: 1,
        datacards: 1,
        goalcards: 1,
      },
    };
  }

  if (resourceBand === RESOURCE_BANDS.DEGRADED) {
    if (weightClass === JOB_WEIGHT_CLASSES.LIGHT || weightClass === JOB_WEIGHT_CLASSES.MEDIUM) {
      return {
        ...executionOptions,
        profile: "minimal",
        batchLimitOverride: 1,
        countOverrides: {
          flashcards: 1,
          taskcards: 1,
          datacards: 1,
          goalcards: 1,
        },
      };
    }

    if (attemptCount >= 2) {
      return {
        ...executionOptions,
        profile: "minimal",
        batchLimitOverride: 1,
        disableResearchBackfill: true,
        countOverrides: {
          flashcards: 1,
          taskcards: 1,
          datacards: 1,
          goalcards: 1,
        },
      };
    }
  }

  return null;
}

function resolvePipelineJobExecutionPlan(job, freeMemOverride = null) {
  const freeMemMb = Number.isFinite(freeMemOverride) ? Number(freeMemOverride) : getFreeMemoryMb();
  const resourceBand = getResourceBand(freeMemMb);
  const metadataOptions = job?.metadata?.executionOptions;
  if (metadataOptions && typeof metadataOptions === "object" && !Array.isArray(metadataOptions)) {
    return {
      freeMemMb,
      resourceBand,
      executionOptions: {
        profile: typeof metadataOptions.profile === "string" ? metadataOptions.profile : "minimal",
        batchLimitOverride: Number.isFinite(metadataOptions.batchLimitOverride) ? Number(metadataOptions.batchLimitOverride) : 1,
        disableResearchBackfill: metadataOptions.disableResearchBackfill === true,
        countOverrides: metadataOptions.countOverrides && typeof metadataOptions.countOverrides === "object"
          ? metadataOptions.countOverrides
          : null,
        selectionOffset: Number.isFinite(metadataOptions.selectionOffset) ? Number(metadataOptions.selectionOffset) : 0,
        weightClass: PIPELINE_JOB_WEIGHT_CLASS[job?.jobType] || JOB_WEIGHT_CLASSES.MEDIUM,
      },
    };
  }
  const executionOptions = buildExecutionOptionsForJob(job, resourceBand);
  if (!MEMORY_INTENSIVE_PIPELINE_JOB_TYPES.has(job.jobType)) {
    return {
      freeMemMb,
      resourceBand,
      executionOptions,
    };
  }

  if (!executionOptions) {
    throw createPipelineDeferredError(
      `${job.jobType} deferred because memory pressure is ${resourceBand} (${freeMemMb}MB free).`,
      5 * 60 * 1000,
    );
  }

  return {
    freeMemMb,
    resourceBand,
    executionOptions,
  };
}

function shouldDecomposeLowMemoryPipelineJob(job, classification) {
  if (classification.class !== PIPELINE_FAILURE_CLASSES.LOW_MEMORY_SKIP) return false;
  if (!LOW_MEMORY_DECOMPOSABLE_PIPELINE_JOB_TYPES.has(job.jobType)) return false;
  if (String(job.entityType || "") === "PIPELINE_SLICE") return false;
  return Number(job.attemptCount || 0) >= 3;
}

async function runPlannerBootstrapJob(prisma, company, executionOptions = {}) {
  const cycleRunId = crypto.randomUUID();
  const workerContext = {
    cycleRunId,
    workerId: `pipeline-queue:${process.pid}`,
  };
  await processMemoryUpdates(prisma, company);
  const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
  return runCompanyPlannerCycle(prisma, company, memoryPrompt, null, workerContext, executionOptions);
}

async function runPlannerMaintenanceJob(prisma, company, jobType, executionOptions = {}) {
  switch (jobType) {
    case "REFRESH_FLASHCARDS":
      return (await refreshOldestFlashcards(prisma, company, new Date(), executionOptions)).length;
    case "REFRESH_TASKS": {
      const refreshed = await refreshOldestTasks(prisma, company, new Date(), executionOptions);
      await recomputeFrontier(prisma, company);
      return refreshed.length + 1;
    }
    case "REFRESH_DATACARDS":
      return (await refreshOldestDatacards(prisma, company, new Date(), executionOptions)).length;
    case "REFRESH_GOALS":
      return (await refreshOldestGoals(prisma, company, new Date(), executionOptions)).length;
    default:
      return 0;
  }
}

async function runPlannerQualityJob(prisma, company, jobType, executionOptions = {}) {
  const cycleRunId = crypto.randomUUID();
  const workerContext = {
    cycleRunId,
    workerId: `pipeline-quality:${process.pid}`,
  };
  await processMemoryUpdates(prisma, company);
  const memoryPrompt = await getHumanMemoryPrompt(prisma, company);

  switch (jobType) {
    case "MINE_FLASHCARD_OPPORTUNITIES":
      return performCompanyWriting(prisma, company, memoryPrompt, null, workerContext, executionOptions);
    case "MINE_TASK_OPPORTUNITIES":
      return performCompanyActionGeneration(prisma, company, memoryPrompt, null, workerContext, executionOptions);
    case "FEEDBACK_PRESSURE_REGENERATION": {
      const taskOps = await performCompanyActionGeneration(prisma, company, memoryPrompt, null, workerContext, executionOptions);
      const refreshOps = await refreshOldestTasks(prisma, company, new Date(), executionOptions);
      await recomputeFrontier(prisma, company);
      return taskOps + refreshOps.length + 1;
    }
    default:
      return 0;
  }
}

async function executePipelineJob(prisma, job, executionOptions = {}) {
  const company = job.company ?? await prisma.company.findUnique({ where: { id: job.companyId } });
  if (!company) {
    throw new Error(`Pipeline job ${job.id} has no company`);
  }

  if (isPlannerBootstrapJob(job.jobType)) {
    return runPlannerBootstrapJob(prisma, company, executionOptions);
  }
  if (isPlannerMaintenanceJob(job.jobType)) {
    return runPlannerMaintenanceJob(prisma, company, job.jobType, executionOptions);
  }
  if (isPlannerQualityJob(job.jobType)) {
    return runPlannerQualityJob(prisma, company, job.jobType, executionOptions);
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
      return runPlannerBootstrapJob(prisma, company, executionOptions);
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
        ops += await performCompanyWriting(prisma, company, memoryPrompt, null, workerContext, executionOptions);
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
        executionProfile: input.executionProfile || "full",
        resourceBand: input.resourceBand || null,
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
  const targetExecutions = Math.max(1, limit);
  const maxClaims = targetExecutions + 3;
  let claimed = await claimNextPipelineJobs(prisma, 1);
  if (claimed.length === 0) {
    return {
      executed: 0,
      claimedAny: false,
    };
  }
  let executed = 0;
  let claimsAttempted = 0;

  while (claimed.length > 0 && claimsAttempted < maxClaims && executed < targetExecutions) {
    const [job] = claimed;
    claimsAttempted += 1;
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
      const executionPlan = resolvePipelineJobExecutionPlan(job);
      const result = await executePipelineJob(prisma, job, executionPlan.executionOptions);
      if (stopHeartbeat) {
        await stopHeartbeat();
        stopHeartbeat = null;
      }
      const workloadUnits = typeof result === "number" ? Math.max(1, result) : 1;
      await finalizeSuccessfulPipelineJob(
        prisma,
        job,
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
        executionProfile: executionPlan.executionOptions?.profile || "full",
        resourceBand: executionPlan.resourceBand,
      });
      executed += 1;
    } catch (error) {
      if (stopHeartbeat) {
        await stopHeartbeat();
        stopHeartbeat = null;
      }
      console.error(`[PIPELINE QUEUE] ${job.jobType} failed for ${job.company?.name ?? job.companyId}:`, error.message);
      const classification = classifyPipelineJobError(error);
      if (shouldDecomposeLowMemoryPipelineJob(job, classification)) {
        await spawnLowMemoryDecompositionChildJob(prisma, job, {
          profile: "minimal",
          batchLimitOverride: 1,
          disableResearchBackfill: true,
          countOverrides: {
            flashcards: 1,
            taskcards: 1,
            datacards: 1,
            goalcards: 1,
          },
        });
      } else {
        await failPipelineJob(prisma, job, error);
      }
      await recordPipelineJobUsage(prisma, job, {
        status: "FAILED",
        workloadUnits: 1,
        runtimeMs: Date.now() - startedAt,
        retryCount: (job.attemptCount || 0) + 1,
        valueSignal: "RETRY_WASTE_RISK",
        reason: error.message,
      });

      if (classification.class !== PIPELINE_FAILURE_CLASSES.LOW_MEMORY_SKIP) {
        break;
      }
    }

    claimed = executed < targetExecutions ? await claimNextPipelineJobs(prisma, 1) : [];
  }

  return {
    executed,
    claimedAny: true,
  };
}

function shouldDelegateQueueRefresh(queueBatchResult) {
  return Boolean(queueBatchResult) && queueBatchResult.claimedAny === false;
}

module.exports = {
  executePipelineJob,
  runPipelineQueueBatch,
  resolvePipelineJobExecutionPlan,
  JOB_WEIGHT_CLASSES,
  shouldDecomposeLowMemoryPipelineJob,
  shouldDelegateQueueRefresh,
};
