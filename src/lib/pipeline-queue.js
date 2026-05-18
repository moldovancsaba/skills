const { computeCompanyScoreHealth } = require("./score-health");
const {
  PLANNER_LANE_ORDER,
  PLANNER_LANE_TARGETS,
  PLANNER_MIN_FLASHCARDS,
  PLANNER_MIN_DATACARDS_FOR_ACTIVE,
  getCompanyOperatingMode,
} = require("./planner-contract");
const { readFeedbackPressureIndex, countCompanyBlockedFamilies } = require("../../scripts/lib/planner/feedback-pressure");

const CORE_PIPELINE_JOB_TYPES = Object.freeze([
  "FEEDBACK_RECONCILIATION",
  "CARD_RESCORING",
  "FRONTIER_RECOMPUTE",
  "SCORE_ALERT_REPAIR",
]);

const PLANNER_BOOTSTRAP_JOB_TYPES = Object.freeze([
  "ENSURE_FLASHCARD_MINIMUM",
  "RESEARCH_BACKFILL",
  "ENSURE_IDEABANK_MINIMUM",
  "ENSURE_ROADMAP_MINIMUM",
  "ENSURE_BACKLOG_MINIMUM",
  "ENSURE_TODO_MINIMUM",
  "ENSURE_CHECKLIST_MINIMUM",
]);

const PLANNER_QUALITY_JOB_TYPES = Object.freeze([
  "MINE_FLASHCARD_OPPORTUNITIES",
  "MINE_TASK_OPPORTUNITIES",
  "FEEDBACK_PRESSURE_REGENERATION",
]);

const PLANNER_MAINTENANCE_JOB_TYPES = Object.freeze([
  "REFRESH_FLASHCARDS",
  "REFRESH_TASKS",
  "REFRESH_DATACARDS",
  "REFRESH_GOALS",
]);

const LEGACY_COMPAT_PIPELINE_JOB_TYPES = Object.freeze([
  "FULL_MAINTENANCE",
  "COMPANY_SYNTHESIS",
]);

const PIPELINE_JOB_TYPES = Object.freeze([
  ...CORE_PIPELINE_JOB_TYPES,
  ...PLANNER_BOOTSTRAP_JOB_TYPES,
  ...PLANNER_QUALITY_JOB_TYPES,
  ...PLANNER_MAINTENANCE_JOB_TYPES,
]);

const MANAGED_PIPELINE_JOB_TYPES = Object.freeze([
  ...PIPELINE_JOB_TYPES,
  ...LEGACY_COMPAT_PIPELINE_JOB_TYPES,
  "WORKFLOW_BLUEPRINT",
]);

const PIPELINE_QUEUE_COLUMNS = Object.freeze(["NOW", "SOON", "LATER", "PARKED"]);
const PIPELINE_CONTROL_MODES = Object.freeze(["AI_ONLY", "HUMAN_GUIDED"]);
const PIPELINE_JOB_STATUSES = Object.freeze(["ACTIVE", "RUNNING", "PAUSED", "FAILED"]);
const PIPELINE_JOB_NO_PROGRESS_TIMEOUT_MS = 10 * 60 * 1000;
const GLOBAL_PIPELINE_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const PIPELINE_TOPOLOGY_STATE_KEY = "local_ai_pipeline_topology_state";
const PIPELINE_TOPOLOGY_RECENT_SYNC_LIMIT = 24;
const PIPELINE_JOB_RETRY_LIMITS = Object.freeze({
  SCORE_ALERT_REPAIR: 6,
  CARD_RESCORING: 6,
  FRONTIER_RECOMPUTE: 4,
  FEEDBACK_RECONCILIATION: 5,
  ENSURE_FLASHCARD_MINIMUM: 4,
  RESEARCH_BACKFILL: 4,
  ENSURE_IDEABANK_MINIMUM: 4,
  ENSURE_ROADMAP_MINIMUM: 4,
  ENSURE_BACKLOG_MINIMUM: 4,
  ENSURE_TODO_MINIMUM: 4,
  ENSURE_CHECKLIST_MINIMUM: 4,
  MINE_FLASHCARD_OPPORTUNITIES: 4,
  MINE_TASK_OPPORTUNITIES: 4,
  FEEDBACK_PRESSURE_REGENERATION: 4,
  REFRESH_FLASHCARDS: 4,
  REFRESH_TASKS: 4,
  REFRESH_DATACARDS: 4,
  REFRESH_GOALS: 4,
  COMPANY_SYNTHESIS: 4,
  FULL_MAINTENANCE: 4,
  WORKFLOW_BLUEPRINT: 3,
});
const PIPELINE_FAILURE_CLASSES = Object.freeze({
  MODEL_TIMEOUT: "MODEL_TIMEOUT",
  LOW_MEMORY_SKIP: "LOW_MEMORY_SKIP",
  PRISMA_VALIDATION: "PRISMA_VALIDATION",
  PRISMA_WRITE_CONFLICT: "PRISMA_WRITE_CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  INPUT_CONTRACT: "INPUT_CONTRACT",
  UNKNOWN: "UNKNOWN",
});
let lastGlobalPipelineSyncAt = 0;
const DECOMPOSED_PIPELINE_ENTITY_TYPE = "PIPELINE_SLICE";
const DECOMPOSED_PIPELINE_SOURCE_PREFIX = "decomp:";
const DECOMPOSITION_CHILD_LIMIT = 3;

const QUEUE_COLUMN_RANK = Object.freeze({
  NOW: 0,
  SOON: 1,
  LATER: 2,
  PARKED: 3,
});

const JOB_LABELS = Object.freeze({
  FEEDBACK_RECONCILIATION: "Feedback Reconciliation",
  CARD_RESCORING: "Card Rescoring",
  FRONTIER_RECOMPUTE: "Frontier Recompute",
  ENSURE_FLASHCARD_MINIMUM: "Ensure Flashcard Minimum",
  RESEARCH_BACKFILL: "Research Backfill",
  ENSURE_IDEABANK_MINIMUM: "Ensure Ideabank Minimum",
  ENSURE_ROADMAP_MINIMUM: "Ensure Roadmap Minimum",
  ENSURE_BACKLOG_MINIMUM: "Ensure Backlog Minimum",
  ENSURE_TODO_MINIMUM: "Ensure Next Minimum",
  ENSURE_CHECKLIST_MINIMUM: "Ensure Checklist Minimum",
  MINE_FLASHCARD_OPPORTUNITIES: "Mine Flashcard Opportunities",
  MINE_TASK_OPPORTUNITIES: "Mine Task Opportunities",
  FEEDBACK_PRESSURE_REGENERATION: "Feedback Pressure Regeneration",
  REFRESH_FLASHCARDS: "Refresh Flashcards",
  REFRESH_TASKS: "Refresh Tasks",
  REFRESH_DATACARDS: "Refresh Datacards",
  REFRESH_GOALS: "Refresh Goals",
  FULL_MAINTENANCE: "Full Maintenance",
  SCORE_ALERT_REPAIR: "Score Alert Repair",
  COMPANY_SYNTHESIS: "Company Synthesis",
  WORKFLOW_BLUEPRINT: "Workflow Blueprint",
});

function isRetryableWriteConflict(error) {
  return Boolean(error && typeof error === "object" && error.code === "P2034");
}

async function withPipelineRetry(operation, attempt = 0) {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableWriteConflict(error) || attempt >= 3) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    return withPipelineRetry(operation, attempt + 1);
  }
}

function getPipelineJobLabel(jobType) {
  return JOB_LABELS[jobType] ?? jobType;
}

function buildNoProgressTimeoutMessage(timeoutMs = PIPELINE_JOB_NO_PROGRESS_TIMEOUT_MS) {
  const minutes = Math.max(1, Math.round(timeoutMs / 60000));
  return `Automatically failed after ${minutes}-minute no-progress timeout. Released for later retry.`;
}

function getPipelineJobRetryLimit(jobType) {
  return PIPELINE_JOB_RETRY_LIMITS[jobType] ?? 3;
}

function classifyPipelineJobError(error) {
  const code = typeof error?.code === "string" ? error.code : null;
  const message = String(error?.message || error || "unknown pipeline failure");
  const retryAfterMs = Number.isFinite(error?.retryAfterMs) ? Number(error.retryAfterMs) : null;
  const explicitRetryable = typeof error?.retryable === "boolean" ? error.retryable : null;
  const explicitClass = typeof error?.pipelineClass === "string" ? error.pipelineClass : null;

  if (explicitClass) {
    return {
      class: explicitClass,
      retryable: explicitRetryable !== null ? explicitRetryable : explicitClass !== PIPELINE_FAILURE_CLASSES.PRISMA_VALIDATION,
      retryAfterMs,
      message,
    };
  }

  if (code === "P2034") {
    return {
      class: PIPELINE_FAILURE_CLASSES.PRISMA_WRITE_CONFLICT,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 60_000,
      message,
    };
  }

  if (/PLANNER_TIMEOUT|timeout|timed out/i.test(message)) {
    return {
      class: PIPELINE_FAILURE_CLASSES.MODEL_TIMEOUT,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 5 * 60 * 1000,
      message,
    };
  }

  if (/low memory|memory pressure|PAUSED_LOW_MEMORY/i.test(message)) {
    return {
      class: PIPELINE_FAILURE_CLASSES.LOW_MEMORY_SKIP,
      retryable: true,
      retryAfterMs: retryAfterMs ?? 5 * 60 * 1000,
      message,
    };
  }

  if (/Unknown argument|Invalid `?prisma\.|PrismaClientValidationError|Argument .* is missing/i.test(message)) {
    return {
      class: PIPELINE_FAILURE_CLASSES.PRISMA_VALIDATION,
      retryable: false,
      retryAfterMs: null,
      message,
    };
  }

  if (/not found|has no company/i.test(message)) {
    return {
      class: PIPELINE_FAILURE_CLASSES.NOT_FOUND,
      retryable: false,
      retryAfterMs: null,
      message,
    };
  }

  if (/contract|invalid input|unsupported/i.test(message)) {
    return {
      class: PIPELINE_FAILURE_CLASSES.INPUT_CONTRACT,
      retryable: false,
      retryAfterMs: null,
      message,
    };
  }

  return {
    class: PIPELINE_FAILURE_CLASSES.UNKNOWN,
    retryable: explicitRetryable !== null ? explicitRetryable : true,
    retryAfterMs: retryAfterMs ?? 2 * 60 * 1000,
    message,
  };
}

function buildPipelineFailureMessage(classification) {
  return `[${classification.class}] ${classification.message}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPipelineJobMetadata(job) {
  return isPlainObject(job?.metadata) ? job.metadata : {};
}

function normalizePipelineTopologyState(value) {
  const dirtyCompanies = Array.isArray(value?.dirtyCompanies)
    ? value.dirtyCompanies.filter((entry) => isPlainObject(entry) && typeof entry.companyId === "string" && entry.companyId)
    : [];
  const recentSyncs = Array.isArray(value?.recentSyncs)
    ? value.recentSyncs.filter((entry) => isPlainObject(entry) && typeof entry.companyId === "string" && entry.companyId)
    : [];
  return {
    dirtyCompanies,
    recentSyncs: recentSyncs.slice(-PIPELINE_TOPOLOGY_RECENT_SYNC_LIMIT),
  };
}

function enqueueDirtyPipelineTopologyCompany(state, companyId, reason = "topology-change", now = new Date()) {
  const normalized = normalizePipelineTopologyState(state);
  const requestedAt = now.toISOString();
  const nextDirty = normalized.dirtyCompanies.filter((entry) => entry.companyId !== companyId);
  nextDirty.push({
    companyId,
    reason,
    requestedAt,
  });
  return {
    dirtyCompanies: nextDirty.sort((left, right) => new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime()),
    recentSyncs: normalized.recentSyncs,
  };
}

function drainDirtyPipelineTopologyCompanies(state, limit = 3) {
  const normalized = normalizePipelineTopologyState(state);
  const boundedLimit = Math.max(1, Math.min(20, Number(limit || 3)));
  return {
    drained: normalized.dirtyCompanies.slice(0, boundedLimit),
    remaining: normalized.dirtyCompanies.slice(boundedLimit),
    recentSyncs: normalized.recentSyncs,
  };
}

function recordPipelineTopologySyncResult(state, result, now = new Date()) {
  const normalized = normalizePipelineTopologyState(state);
  const event = {
    companyId: result.companyId,
    companyName: result.companyName || null,
    reason: result.reason || "topology-sync",
    status: result.status || "SYNCED",
    trigger: result.trigger || "background-dirty-drain",
    syncedAt: now.toISOString(),
    error: result.error || null,
  };
  return {
    dirtyCompanies: normalized.dirtyCompanies,
    recentSyncs: [...normalized.recentSyncs, event].slice(-PIPELINE_TOPOLOGY_RECENT_SYNC_LIMIT),
  };
}

async function readPipelineTopologyState(prisma) {
  const setting = await prisma.globalSetting.findUnique({
    where: { key: PIPELINE_TOPOLOGY_STATE_KEY },
    select: { value: true },
  });
  return normalizePipelineTopologyState(setting?.value);
}

async function writePipelineTopologyState(prisma, state) {
  const normalized = normalizePipelineTopologyState(state);
  await prisma.globalSetting.upsert({
    where: { key: PIPELINE_TOPOLOGY_STATE_KEY },
    create: { key: PIPELINE_TOPOLOGY_STATE_KEY, value: normalized },
    update: { value: normalized, updatedAt: new Date() },
  });
  return normalized;
}

async function appendPipelineTopologySyncResult(prisma, result, now = new Date()) {
  const state = await readPipelineTopologyState(prisma);
  return writePipelineTopologyState(prisma, recordPipelineTopologySyncResult(state, result, now));
}

function isDecomposedPipelineJob(job) {
  return String(job?.entityType || "") === DECOMPOSED_PIPELINE_ENTITY_TYPE;
}

function getDecompositionParentJobId(job) {
  const metadata = getPipelineJobMetadata(job);
  return typeof metadata.parentJobId === "string" && metadata.parentJobId ? metadata.parentJobId : null;
}

function buildDecompositionSourceSignal(parentJobId) {
  return `${DECOMPOSED_PIPELINE_SOURCE_PREFIX}${parentJobId}`;
}

function buildLowMemoryDecompositionChildPlans(job, executionOptions = {}) {
  const selectionOffsets = [0, 1, 2];
  const baseOptions = {
    profile: "minimal",
    batchLimitOverride: 1,
    disableResearchBackfill: true,
    countOverrides: {
      flashcards: 1,
      taskcards: 1,
      datacards: 1,
      goalcards: 1,
    },
    ...executionOptions,
  };

  const childPlans = selectionOffsets.map((selectionOffset, index) => ({
    childIndex: index,
    childCount: selectionOffsets.length,
    executionOptions: {
      ...baseOptions,
      selectionOffset,
    },
  }));

  return childPlans.slice(0, DECOMPOSITION_CHILD_LIMIT);
}

function buildRunnablePipelineJobWhere(now = new Date()) {
  return {
    status: "ACTIVE",
    queueColumn: { not: "PARKED" },
    OR: [
      { scheduledAt: { isSet: false } },
      { scheduledAt: { lte: now } },
    ],
  };
}

function roundPriority(value) {
  return Number(Math.max(0, value).toFixed(2));
}

function getQueueColumnRank(column) {
  return QUEUE_COLUMN_RANK[column] ?? QUEUE_COLUMN_RANK.LATER;
}

function lanePriorityBoost(lane) {
  switch (lane) {
    case "CHECKLIST":
      return 64;
    case "TODO":
      return 52;
    case "BACKLOG":
      return 40;
    case "ROADMAP":
      return 28;
    case "IDEABANK":
      return 16;
    default:
      return 0;
  }
}

function buildPlannerLaneProfile(lane, signals) {
  const currentCount = Number(signals.laneCounts?.[lane] || 0);
  const targetCount = Number(PLANNER_LANE_TARGETS[lane] || 0);
  const deficit = Math.max(0, targetCount - currentCount);
  if (signals.mode === "INACTIVE") {
    return {
      queueColumn: "PARKED",
      priorityScore: 0,
      reason: "Company is inactive because it has no datacards yet.",
      sourceSignal: "inactive-no-datacards",
    };
  }
  if (deficit > 0) {
    return {
      queueColumn: lane === "CHECKLIST" || lane === "TODO" ? "NOW" : "SOON",
      priorityScore: roundPriority(120 + lanePriorityBoost(lane) + deficit * 8 + Math.min(signals.flashcardCount, 20)),
      reason: `${lane} is below its planner minimum (${currentCount}/${targetCount}). Refill and promotion work is required.`,
      sourceSignal: `lane-deficit-${lane.toLowerCase()}`,
    };
  }
  return {
    queueColumn: "PARKED",
    priorityScore: 0,
    reason: `${lane} already meets its planner minimum (${currentCount}/${targetCount}).`,
    sourceSignal: `lane-healthy-${lane.toLowerCase()}`,
  };
}

function buildAutoJobProfile(jobType, signals) {
  const {
    pendingFeedbackCount,
    pendingStrategicFeedbackCount,
    staleAuditCount,
    staleFlashcardCount,
    staleTaskCount,
    staleDatacardCount,
    staleGoalCount,
    scoreHealth,
    activeTaskCount,
    activeKnowledgeCount,
    flashcardCount,
    datacardCount,
    sourceCount,
    fileCount,
    activeTopicCount,
    laneCounts,
    deficits,
    mode,
  } = signals;
  const overallBand = scoreHealth?.overallBand ?? "HEALTHY";
  const totalPendingFeedback = pendingFeedbackCount + pendingStrategicFeedbackCount;
  const bootstrapEvidenceCount = sourceCount + fileCount;
  const needsKnowledgeBootstrap = activeKnowledgeCount === 0 && (bootstrapEvidenceCount > 0 || activeTopicCount > 0);
  const needsTaskBootstrap = activeKnowledgeCount > 0 && activeTaskCount === 0;
  const hasLaneDeficits = deficits.length > 0;

  switch (jobType) {
    case "FEEDBACK_RECONCILIATION":
      return totalPendingFeedback > 0
        ? {
            queueColumn: "NOW",
            priorityScore: roundPriority(100 + totalPendingFeedback * 8),
            reason: `${totalPendingFeedback} pending feedback event(s) are waiting for worker reconciliation.`,
            sourceSignal: "feedback-backlog",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 24,
            reason: "No pending feedback backlog. Keep reconciliation available under AI control.",
            sourceSignal: "steady-state",
          };
    case "CARD_RESCORING":
      return staleAuditCount > 0 || overallBand === "CRITICAL"
        ? {
            queueColumn: overallBand === "CRITICAL" ? "NOW" : "SOON",
            priorityScore: roundPriority(92 + staleAuditCount * 3 + (overallBand === "CRITICAL" ? 20 : 0)),
            reason:
              overallBand === "CRITICAL"
                ? "Critical score-health state escalated rescoring to immediate worker focus."
                : `${staleAuditCount} card(s) are waiting on audit/rescore attention.`,
            sourceSignal: overallBand === "CRITICAL" ? "score-health-critical" : "oldest-first-rescore",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 42,
            reason: "Periodic rescoring remains scheduled under oldest-first fairness.",
            sourceSignal: "periodic-rescore",
          };
    case "FRONTIER_RECOMPUTE":
      return {
        queueColumn: totalPendingFeedback > 0 || activeTaskCount > 0 ? "SOON" : "LATER",
        priorityScore: roundPriority(56 + totalPendingFeedback * 2 + Math.min(activeTaskCount, 20)),
        reason: "Checklist and planning placement should stay synchronized with the latest scoring and feedback.",
        sourceSignal: totalPendingFeedback > 0 ? "feedback-driven-frontier" : "periodic-frontier",
      };
    case "SCORE_ALERT_REPAIR":
      if (overallBand === "CRITICAL") {
        return {
          queueColumn: "NOW",
          priorityScore: 120,
          reason: "Critical score-health clustering requires immediate repair work.",
          sourceSignal: "score-health-critical",
        };
      }
      if (overallBand === "SUSPICIOUS" || overallBand === "WARNING") {
        return {
          queueColumn: "SOON",
          priorityScore: overallBand === "SUSPICIOUS" ? 96 : 72,
          reason: `${overallBand} score-health state should trigger repair-oriented queue work.`,
          sourceSignal: `score-health-${overallBand.toLowerCase()}`,
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "No active score-health repair signal. Parked under AI control until alerts rise.",
        sourceSignal: "score-health-healthy",
      };
    case "ENSURE_FLASHCARD_MINIMUM":
      if (mode === "INACTIVE") {
        return {
          queueColumn: "PARKED",
          priorityScore: 0,
          reason: "Company is inactive because it has no datacards yet.",
          sourceSignal: "inactive-no-datacards",
        };
      }
      if (flashcardCount < PLANNER_MIN_FLASHCARDS) {
        return {
          queueColumn: "NOW",
          priorityScore: roundPriority(150 + (PLANNER_MIN_FLASHCARDS - flashcardCount) * 6 + Math.min(datacardCount, 20)),
          reason: `Flashcard inventory is below planner minimum (${flashcardCount}/${PLANNER_MIN_FLASHCARDS}). Bootstrap knowledge generation now.`,
          sourceSignal: "flashcard-deficit",
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: `Flashcard inventory already meets planner minimum (${flashcardCount}/${PLANNER_MIN_FLASHCARDS}).`,
        sourceSignal: "flashcard-target-met",
      };
    case "RESEARCH_BACKFILL":
      if (mode === "INACTIVE") {
        return {
          queueColumn: "PARKED",
          priorityScore: 0,
          reason: "Company is inactive because it has no datacards yet.",
          sourceSignal: "inactive-no-datacards",
        };
      }
      if (flashcardCount < PLANNER_MIN_FLASHCARDS && datacardCount > 0 && datacardCount <= 3) {
        return {
          queueColumn: "SOON",
          priorityScore: roundPriority(138 + (PLANNER_MIN_FLASHCARDS - flashcardCount) * 4 + Math.max(0, 4 - datacardCount) * 10),
          reason: `Datacard inventory is sparse (${datacardCount}) while flashcards remain below minimum (${flashcardCount}/${PLANNER_MIN_FLASHCARDS}). Research backfill is required.`,
          sourceSignal: "research-backfill",
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "Research backfill is not currently required for this company.",
        sourceSignal: "research-backfill-idle",
      };
    case "ENSURE_IDEABANK_MINIMUM":
      return buildPlannerLaneProfile("IDEABANK", signals);
    case "ENSURE_ROADMAP_MINIMUM":
      return buildPlannerLaneProfile("ROADMAP", signals);
    case "ENSURE_BACKLOG_MINIMUM":
      return buildPlannerLaneProfile("BACKLOG", signals);
    case "ENSURE_TODO_MINIMUM":
      return buildPlannerLaneProfile("TODO", signals);
    case "ENSURE_CHECKLIST_MINIMUM":
      return buildPlannerLaneProfile("CHECKLIST", signals);
    case "MINE_FLASHCARD_OPPORTUNITIES":
      if (mode === "INACTIVE") {
        return {
          queueColumn: "PARKED",
          priorityScore: 0,
          reason: "Company is inactive because it has no datacards yet.",
          sourceSignal: "inactive-no-datacards",
        };
      }
      if (datacardCount > 0 && flashcardCount >= PLANNER_MIN_FLASHCARDS) {
        return {
          queueColumn: "LATER",
          priorityScore: roundPriority(58 + Math.min(datacardCount, 20) + staleDatacardCount * 2),
          reason: "Flashcard opportunity mining runs as recurring quality work after knowledge minimums are met.",
          sourceSignal: "quality-opportunity-flashcards",
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "Flashcard opportunity mining waits until the company has enough datacards and baseline flashcards.",
        sourceSignal: "quality-opportunity-flashcards-idle",
      };
    case "MINE_TASK_OPPORTUNITIES":
      if (mode === "INACTIVE") {
        return {
          queueColumn: "PARKED",
          priorityScore: 0,
          reason: "Company is inactive because it has no datacards yet.",
          sourceSignal: "inactive-no-datacards",
        };
      }
      if (activeKnowledgeCount > 0) {
        return {
          queueColumn: deficits.length > 0 ? "SOON" : "LATER",
          priorityScore: roundPriority(62 + Math.min(activeKnowledgeCount, 20) + deficits.length * 4),
          reason: deficits.length > 0
            ? "Task opportunity mining stays warm while planning lanes still need refill support."
            : "Task opportunity mining runs as recurring quality work from active flashcards.",
          sourceSignal: deficits.length > 0 ? "quality-opportunity-tasks-with-deficits" : "quality-opportunity-tasks",
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "Task opportunity mining waits until the company has active flashcard knowledge.",
        sourceSignal: "quality-opportunity-tasks-idle",
      };
    case "FEEDBACK_PRESSURE_REGENERATION":
      if (signals.blockedFeedbackFamiliesCount > 0) {
        return {
          queueColumn: "SOON",
          priorityScore: roundPriority(88 + signals.blockedFeedbackFamiliesCount * 8),
          reason: `${signals.blockedFeedbackFamiliesCount} feedback-blocked family signal(s) need regeneration-aware queue attention.`,
          sourceSignal: "feedback-pressure-regeneration",
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "No blocked feedback pressure families currently require regeneration work.",
        sourceSignal: "feedback-pressure-idle",
      };
    case "REFRESH_FLASHCARDS":
      return staleFlashcardCount > 0
        ? {
            queueColumn: "SOON",
            priorityScore: roundPriority(74 + staleFlashcardCount * 4 + (mode === "BOOTSTRAP" ? 12 : 0)),
            reason: `${staleFlashcardCount} flashcard(s) are due for oldest-first maintenance refresh.`,
            sourceSignal: "refresh-flashcards",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 28,
            reason: "Flashcard refresh remains available under oldest-first global maintenance.",
            sourceSignal: "refresh-flashcards-idle",
          };
    case "REFRESH_TASKS":
      return staleTaskCount > 0 || hasLaneDeficits
        ? {
            queueColumn: hasLaneDeficits ? "SOON" : "LATER",
            priorityScore: roundPriority(70 + staleTaskCount * 4 + deficits.length * 6),
            reason: hasLaneDeficits
              ? "Task refresh stays warm because tactical lanes are still under target."
              : `${staleTaskCount} taskcard(s) are due for oldest-first maintenance refresh.`,
            sourceSignal: hasLaneDeficits ? "refresh-tasks-with-deficits" : "refresh-tasks",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 26,
            reason: "Task refresh remains available under oldest-first global maintenance.",
            sourceSignal: "refresh-tasks-idle",
          };
    case "REFRESH_DATACARDS":
      return staleDatacardCount > 0 || datacardCount < PLANNER_MIN_DATACARDS_FOR_ACTIVE
        ? {
            queueColumn: datacardCount < PLANNER_MIN_DATACARDS_FOR_ACTIVE ? "NOW" : "SOON",
            priorityScore: roundPriority(82 + staleDatacardCount * 4 + Math.max(0, PLANNER_MIN_DATACARDS_FOR_ACTIVE - datacardCount) * 30),
            reason: datacardCount < PLANNER_MIN_DATACARDS_FOR_ACTIVE
              ? "Company needs datacard refresh or creation before it can stay active."
              : `${staleDatacardCount} datacard(s) are due for oldest-first maintenance refresh.`,
            sourceSignal: datacardCount < PLANNER_MIN_DATACARDS_FOR_ACTIVE ? "inactive-datacard-gap" : "refresh-datacards",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 24,
            reason: "Datacard refresh remains available under oldest-first global maintenance.",
            sourceSignal: "refresh-datacards-idle",
          };
    case "REFRESH_GOALS":
      return staleGoalCount > 0
        ? {
            queueColumn: "LATER",
            priorityScore: roundPriority(60 + staleGoalCount * 3),
            reason: `${staleGoalCount} goalcard(s) are due for oldest-first maintenance refresh.`,
            sourceSignal: "refresh-goals",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 18,
            reason: "Goal refresh remains available under oldest-first global maintenance.",
            sourceSignal: "refresh-goals-idle",
          };
    case "FULL_MAINTENANCE":
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "Legacy umbrella maintenance job is parked in favor of explicit refresh jobs.",
        sourceSignal: "legacy-maintenance-parked",
      };
    case "COMPANY_SYNTHESIS":
      if (needsKnowledgeBootstrap || needsTaskBootstrap || hasLaneDeficits) {
        return {
          queueColumn: "PARKED",
          priorityScore: 0,
          reason: "Legacy synthesis job is superseded by explicit planner bootstrap jobs.",
          sourceSignal: "legacy-synthesis-superseded",
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "Legacy synthesis job remains parked for compatibility only.",
        sourceSignal: "legacy-synthesis-parked",
      };
    default:
      return {
        queueColumn: "LATER",
        priorityScore: 20,
        reason: "Background pipeline work is waiting in the AI queue.",
        sourceSignal: "default",
      };
  }
}

async function gatherCompanyPipelineSignals(prisma, companyId) {
  const [
    pendingFeedbackCount,
    pendingStrategicFeedbackCount,
    activeTaskCount,
    activeKnowledgeCount,
    sourceCount,
    fileCount,
    activeTopicCount,
    staleFlashcards,
    staleGoals,
    staleTasks,
    staleSources,
    staleTopics,
    staleFiles,
    activeManualCooldownCount,
    taskLaneCounts,
    scoreHealth,
    feedbackPressureIndex,
  ] = await Promise.all([
    prisma.feedback.count({
      where: {
        checklistTask: { companyId },
        processedByWorkerAt: null,
      },
    }),
    prisma.strategicFeedback.count({
      where: {
        companyId,
        processedByAI: false,
      },
    }),
    prisma.checklistTask.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
    }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
    }),
    prisma.source.count({ where: { companyId } }),
    prisma.uploadedSourceFile.count({ where: { companyId } }),
    prisma.topic.count({ where: { companyId, active: true } }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [
          { lastRescoredAt: null },
          { lastRescoredAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }),
    prisma.goalcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [
          { lastRescoredAt: null },
          { lastRescoredAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }),
    prisma.checklistTask.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [
          { lastRescoredAt: null },
          { lastRescoredAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }),
    prisma.source.count({
      where: {
        companyId,
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.topic.count({
      where: {
        companyId,
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.uploadedSourceFile.count({
      where: {
        companyId,
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.checklistTask.count({
      where: {
        companyId,
        manualLaneCooldownUntil: { gt: new Date() },
      },
    }),
    prisma.checklistTask.groupBy({
      by: ["kanbanColumn"],
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
      _count: { _all: true },
    }),
    computeCompanyScoreHealth(companyId, prisma),
    readFeedbackPressureIndex(prisma),
  ]);

  const laneCounts = Object.fromEntries(
    PLANNER_LANE_ORDER.map((lane) => [lane, 0]),
  );
  for (const row of taskLaneCounts) {
    laneCounts[row.kanbanColumn] = row._count._all;
  }
  const deficits = PLANNER_LANE_ORDER.filter((lane) => Number(laneCounts[lane] || 0) < Number(PLANNER_LANE_TARGETS[lane] || 0));
  const datacardCount = sourceCount;
  const flashcardCount = activeKnowledgeCount;

  return {
    pendingFeedbackCount,
    pendingStrategicFeedbackCount,
    activeTaskCount,
    activeKnowledgeCount,
    flashcardCount,
    datacardCount,
    sourceCount,
    fileCount,
    activeTopicCount,
    staleFlashcardCount: staleFlashcards,
    staleGoalCount: staleGoals,
    staleTaskCount: staleTasks,
    staleDatacardCount: staleSources,
    activeManualCooldownCount,
    laneCounts,
    deficits,
    mode: getCompanyOperatingMode({
      datacardCount,
      flashcardCount,
      laneCounts,
    }),
    blockedFeedbackFamiliesCount: countCompanyBlockedFamilies(feedbackPressureIndex, companyId),
    staleAuditCount: staleFlashcards + staleGoals + staleTasks + staleSources + staleTopics + staleFiles,
    scoreHealth,
  };
}

async function syncCompanyPipelineJobs(prisma, companyId) {
  return withPipelineRetry(async () => {
    const signals = await gatherCompanyPipelineSignals(prisma, companyId);
    const jobs = [];

    for (const jobType of PIPELINE_JOB_TYPES) {
      const autoProfile = buildAutoJobProfile(jobType, signals);
      const existing = await prisma.pipelineJob.findUnique({
        where: {
          companyId_jobType_entityType_entityId: {
            companyId,
            jobType,
            entityType: "COMPANY",
            entityId: companyId,
          },
        },
      });

      if (!existing) {
        jobs.push(await prisma.pipelineJob.create({
          data: {
            companyId,
            jobType,
            entityId: companyId,
            entityType: "COMPANY",
            status: "ACTIVE",
            controlMode: "AI_ONLY",
            queueColumn: autoProfile.queueColumn,
            manualSortOrder: 0,
            priorityScore: autoProfile.priorityScore,
            reason: autoProfile.reason,
            sourceSignal: autoProfile.sourceSignal,
            metadata: {},
          },
        }));
        continue;
      }

      jobs.push(await prisma.pipelineJob.update({
        where: { id: existing.id },
        data: {
          priorityScore: autoProfile.priorityScore,
          reason: autoProfile.reason,
          sourceSignal: autoProfile.sourceSignal,
          queueColumn: existing.controlMode === "AI_ONLY" ? autoProfile.queueColumn : existing.queueColumn,
          status:
            existing.status === "RUNNING"
              ? existing.status
              : existing.status === "PAUSED"
                ? existing.status
                : "ACTIVE",
        },
      }));
    }

    const staleLegacyCompanyJobs = await prisma.pipelineJob.findMany({
      where: {
        companyId,
        entityType: "COMPANY",
        entityId: companyId,
        jobType: { in: LEGACY_COMPAT_PIPELINE_JOB_TYPES },
        status: { not: "RUNNING" },
      },
      select: { id: true },
    });
    if (staleLegacyCompanyJobs.length > 0) {
      await prisma.pipelineJob.deleteMany({
        where: { id: { in: staleLegacyCompanyJobs.map((job) => job.id) } },
      });
    }

    const workflowBlueprints = await prisma.workflowBlueprint.findMany({
      where: {
        companyId,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
      orderBy: [{ updatedAt: "asc" }],
    });
    const liveWorkflowIds = new Set(workflowBlueprints.map((item) => item.id));

    for (const blueprint of workflowBlueprints) {
      const queueColumn = blueprint.queueColumn ?? "LATER";
      const basePriority =
        queueColumn === "NOW"
          ? 110
          : queueColumn === "SOON"
            ? 84
            : queueColumn === "LATER"
              ? 52
              : 0;
      const alertBoost =
        blueprint.triggerType === "SCORE_ALERT"
          ? signals.scoreHealth?.overallBand === "CRITICAL"
            ? 18
            : signals.scoreHealth?.overallBand === "SUSPICIOUS"
              ? 10
              : 0
          : 0;
      const workflowReason = `${blueprint.name} is active as a bounded workflow blueprint under ${blueprint.controlMode.toLowerCase().replace("_", "-")} control.`;
      const existing = await prisma.pipelineJob.findUnique({
        where: {
          companyId_jobType_entityType_entityId: {
            companyId,
            jobType: "WORKFLOW_BLUEPRINT",
            entityType: "WORKFLOW_BLUEPRINT",
            entityId: blueprint.id,
          },
        },
      });

      if (!existing) {
        jobs.push(await prisma.pipelineJob.create({
          data: {
            companyId,
            jobType: "WORKFLOW_BLUEPRINT",
            entityType: "WORKFLOW_BLUEPRINT",
            entityId: blueprint.id,
            status: blueprint.status === "PAUSED" ? "PAUSED" : "ACTIVE",
            controlMode: blueprint.controlMode,
            queueColumn,
            manualSortOrder: 0,
            priorityScore: roundPriority(basePriority + alertBoost),
            reason: workflowReason,
            sourceSignal: `workflow:${blueprint.templateKey ?? blueprint.id}`,
          },
        }));
        continue;
      }

      jobs.push(await prisma.pipelineJob.update({
        where: { id: existing.id },
        data: {
          controlMode: blueprint.controlMode,
          queueColumn: blueprint.controlMode === "AI_ONLY" ? queueColumn : existing.queueColumn,
          status:
            existing.status === "RUNNING"
              ? existing.status
              : blueprint.status === "PAUSED"
                ? "PAUSED"
                : "ACTIVE",
          priorityScore: roundPriority(basePriority + alertBoost),
          reason: workflowReason,
          sourceSignal: `workflow:${blueprint.templateKey ?? blueprint.id}`,
          metadata: {},
        },
      }));
    }

    const staleWorkflowJobs = await prisma.pipelineJob.findMany({
      where: {
        companyId,
        jobType: "WORKFLOW_BLUEPRINT",
        entityType: "WORKFLOW_BLUEPRINT",
      },
      select: { id: true, entityId: true },
    });
    const removableIds = staleWorkflowJobs
      .filter((job) => !job.entityId || !liveWorkflowIds.has(job.entityId))
      .map((job) => job.id);
    if (removableIds.length > 0) {
      await prisma.pipelineJob.deleteMany({ where: { id: { in: removableIds } } });
    }

    return jobs;
  });
}

async function syncAllCompanyPipelineJobs(prisma) {
  await recoverStaleRunningPipelineJobs(prisma);
  const companies = await prisma.company.findMany({
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });

  for (const company of companies) {
    try {
      await syncCompanyPipelineJobs(prisma, company.id);
    } catch (error) {
      console.error(
        `[PIPELINE QUEUE] Failed to sync jobs for ${company.id}: ${error?.code || error?.name || "UNKNOWN"} ${error?.message || ""}`.trim(),
      );
    }
  }
}

async function syncPipelineJobsForCompanyShard(prisma, limit = 3) {
  const companies = await prisma.company.findMany({
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(10, Number(limit || 3))),
  });

  let syncedCompanies = 0;
  for (const company of companies) {
    try {
      await syncCompanyPipelineJobs(prisma, company.id);
      syncedCompanies += 1;
    } catch (error) {
      console.error(
        `[PIPELINE QUEUE] Failed to sync shard jobs for ${company.id}: ${error?.code || error?.name || "UNKNOWN"} ${error?.message || ""}`.trim(),
      );
    }
  }

  return syncedCompanies;
}

async function markCompanyPipelineTopologyDirty(prisma, companyId, reason = "topology-change") {
  if (!companyId) return null;
  const nextState = enqueueDirtyPipelineTopologyCompany(
    await readPipelineTopologyState(prisma),
    companyId,
    reason,
    new Date(),
  );
  return writePipelineTopologyState(prisma, nextState);
}

async function syncDirtyCompanyPipelineJobs(prisma, options = {}) {
  const trigger = typeof options.trigger === "string" ? options.trigger : "background-dirty-drain";
  const limit = Math.max(1, Math.min(20, Number(options.limit || 3)));
  const state = await readPipelineTopologyState(prisma);
  const plan = drainDirtyPipelineTopologyCompanies(state, limit);
  if (plan.drained.length === 0) {
    return {
      syncedCompanies: 0,
      dirtyCompaniesRemaining: plan.remaining.length,
      recentSyncs: plan.recentSyncs,
    };
  }

  let nextState = {
    dirtyCompanies: plan.remaining,
    recentSyncs: plan.recentSyncs,
  };
  let syncedCompanies = 0;

  for (const entry of plan.drained) {
    try {
      await syncCompanyPipelineJobs(prisma, entry.companyId);
      syncedCompanies += 1;
      const company = await prisma.company.findUnique({
        where: { id: entry.companyId },
        select: { name: true },
      });
      nextState = recordPipelineTopologySyncResult(nextState, {
        companyId: entry.companyId,
        companyName: company?.name || null,
        reason: entry.reason,
        status: "SYNCED",
        trigger,
      });
    } catch (error) {
      console.error(
        `[PIPELINE QUEUE] Failed targeted topology sync for ${entry.companyId}: ${error?.code || error?.name || "UNKNOWN"} ${error?.message || ""}`.trim(),
      );
      nextState = recordPipelineTopologySyncResult(nextState, {
        companyId: entry.companyId,
        reason: entry.reason,
        status: "FAILED",
        trigger,
        error: error?.message || String(error),
      });
      nextState = enqueueDirtyPipelineTopologyCompany(nextState, entry.companyId, entry.reason, new Date());
    }
  }

  const persisted = await writePipelineTopologyState(prisma, nextState);
  return {
    syncedCompanies,
    dirtyCompaniesRemaining: persisted.dirtyCompanies.length,
    recentSyncs: persisted.recentSyncs,
  };
}

function shouldRunGlobalPipelineSync(lastSyncAt, now = Date.now(), intervalMs = GLOBAL_PIPELINE_SYNC_INTERVAL_MS) {
  if (!Number.isFinite(lastSyncAt) || lastSyncAt <= 0) return true;
  return now - lastSyncAt >= intervalMs;
}

async function syncAllCompanyPipelineJobsIfDue(prisma, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const force = options.force === true;
  if (!force && !shouldRunGlobalPipelineSync(lastGlobalPipelineSyncAt, now, GLOBAL_PIPELINE_SYNC_INTERVAL_MS)) {
    return false;
  }

  await syncAllCompanyPipelineJobs(prisma);
  lastGlobalPipelineSyncAt = now;
  return true;
}

async function recoverStaleRunningPipelineJobs(prisma) {
  const cutoff = new Date(Date.now() - PIPELINE_JOB_NO_PROGRESS_TIMEOUT_MS);
  return prisma.pipelineJob.updateMany({
    where: {
      status: "RUNNING",
      OR: [
        { lastTriedAt: { lt: cutoff } },
        { lastTriedAt: null },
      ],
    },
    data: {
      status: "FAILED",
      updatedAt: new Date(),
      lastError: buildNoProgressTimeoutMessage(),
    },
  });
}

async function recoverOrphanedRunningPipelineJobs(prisma) {
  return prisma.pipelineJob.updateMany({
    where: {
      status: "RUNNING",
    },
    data: {
      status: "ACTIVE",
      updatedAt: new Date(),
      lastError: "Recovered automatically after worker restart.",
    },
  });
}

function sortPipelineJobs(jobs) {
  return [...jobs].sort((left, right) => {
    const leftManual = left.controlMode === "HUMAN_GUIDED";
    const rightManual = right.controlMode === "HUMAN_GUIDED";
    if (leftManual !== rightManual) return leftManual ? -1 : 1;

    const leftRank = getQueueColumnRank(left.queueColumn);
    const rightRank = getQueueColumnRank(right.queueColumn);
    if (leftRank !== rightRank) return leftRank - rightRank;

    if (leftManual && rightManual) {
      if ((left.manualSortOrder ?? 0) !== (right.manualSortOrder ?? 0)) {
        return (left.manualSortOrder ?? 0) - (right.manualSortOrder ?? 0);
      }
    } else if ((left.priorityScore ?? 0) !== (right.priorityScore ?? 0)) {
      return (right.priorityScore ?? 0) - (left.priorityScore ?? 0);
    }

    return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
  });
}

async function listCompanyPipelineJobs(prisma, companyId) {
  await syncCompanyPipelineJobs(prisma, companyId);
  return listPersistedCompanyPipelineJobs(prisma, companyId);
}

async function listPersistedCompanyPipelineJobs(prisma, companyId) {
  const jobs = await prisma.pipelineJob.findMany({
    where: { companyId },
    orderBy: [{ updatedAt: "asc" }],
  });
  return sortPipelineJobs(jobs);
}

async function resetCompanyPipelineJobsToAiOnly(prisma, companyId) {
  await prisma.pipelineJob.updateMany({
    where: { companyId },
    data: {
      controlMode: "AI_ONLY",
      manualSortOrder: 0,
      status: "ACTIVE",
      lastError: null,
      updatedAt: new Date(),
    },
  });
  return listPersistedCompanyPipelineJobs(prisma, companyId);
}

async function applyManualPipelineQueueMove(prisma, companyId, movedJobId, sourceColumn, destinationColumn, destinationColumnOrderIds, sourceColumnOrderIds = []) {
  const manualSortForIndex = (index, total) => index - total;
  await prisma.$transaction(async (tx) => {
    for (const [index, jobId] of destinationColumnOrderIds.entries()) {
      await tx.pipelineJob.update({
        where: { id: jobId },
        data: {
          companyId,
          queueColumn: destinationColumn,
          controlMode: "HUMAN_GUIDED",
          manualSortOrder: manualSortForIndex(index, destinationColumnOrderIds.length),
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      });
    }

    for (const [index, jobId] of sourceColumnOrderIds.entries()) {
      await tx.pipelineJob.update({
        where: { id: jobId },
        data: {
          companyId,
          queueColumn: sourceColumn,
          controlMode: "HUMAN_GUIDED",
          manualSortOrder: manualSortForIndex(index, sourceColumnOrderIds.length),
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      });
    }
  });

  const moved = await prisma.pipelineJob.findUnique({ where: { id: movedJobId } });
  return {
    moved,
    jobs: await listPersistedCompanyPipelineJobs(prisma, companyId),
  };
}

async function claimNextPipelineJobs(prisma, limit = 3) {
  const candidates = await prisma.pipelineJob.findMany({
    where: buildRunnablePipelineJobWhere(new Date()),
    orderBy: [{ updatedAt: "asc" }],
    include: {
      company: true,
    },
  });

  const baseOrder = sortPipelineJobs(candidates);
  const baseRankById = new Map(baseOrder.map((job, index) => [job.id, index]));
  const oldestTime = 0;
  const fairOrder = [...baseOrder].sort((left, right) => {
    const leftNeverTried = !left.lastTriedAt || (left.attemptCount ?? 0) === 0;
    const rightNeverTried = !right.lastTriedAt || (right.attemptCount ?? 0) === 0;
    if (leftNeverTried !== rightNeverTried) {
      return leftNeverTried ? -1 : 1;
    }

    const leftTriedAt = left.lastTriedAt ? new Date(left.lastTriedAt).getTime() : oldestTime;
    const rightTriedAt = right.lastTriedAt ? new Date(right.lastTriedAt).getTime() : oldestTime;
    if (leftTriedAt !== rightTriedAt) {
      return leftTriedAt - rightTriedAt;
    }

    if ((left.attemptCount ?? 0) !== (right.attemptCount ?? 0)) {
      return (left.attemptCount ?? 0) - (right.attemptCount ?? 0);
    }

    return (baseRankById.get(left.id) ?? 0) - (baseRankById.get(right.id) ?? 0);
  });

  const claimed = [];
  const selectedJobIds = new Set();
  const selectedCompanyIds = new Set();
  const queue = [];

  for (const job of fairOrder) {
    if (selectedCompanyIds.has(job.companyId)) continue;
    queue.push(job);
    selectedJobIds.add(job.id);
    selectedCompanyIds.add(job.companyId);
    if (queue.length >= limit) break;
  }

  if (queue.length < limit) {
    for (const job of fairOrder) {
      if (selectedJobIds.has(job.id)) continue;
      queue.push(job);
      selectedJobIds.add(job.id);
      if (queue.length >= limit) break;
    }
  }

  for (const job of queue) {
    const updated = await prisma.pipelineJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        lastTriedAt: new Date(),
        attemptCount: (job.attemptCount ?? 0) + 1,
        lastError: null,
      },
      include: { company: true },
    });
    claimed.push(updated);
  }
  return claimed;
}

async function completePipelineJob(prisma, jobId, reason = null) {
  return prisma.pipelineJob.update({
    where: { id: jobId },
    data: {
      status: "ACTIVE",
      scheduledAt: { unset: true },
      lastCompletedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
      reason: reason ?? undefined,
    },
  });
}

async function completeDecompositionParentIfReady(prisma, childJob) {
  const parentJobId = getDecompositionParentJobId(childJob);
  if (!parentJobId) return null;

  const remainingChildren = await prisma.pipelineJob.count({
    where: {
      companyId: childJob.companyId,
      jobType: childJob.jobType,
      entityType: DECOMPOSED_PIPELINE_ENTITY_TYPE,
      sourceSignal: buildDecompositionSourceSignal(parentJobId),
      status: { in: ["ACTIVE", "RUNNING", "PAUSED"] },
    },
  });

  if (remainingChildren > 0) return null;

  const parentJob = await prisma.pipelineJob.findUnique({ where: { id: parentJobId } });
  if (!parentJob) return null;

  const metadata = getPipelineJobMetadata(parentJob);
  return prisma.pipelineJob.update({
    where: { id: parentJobId },
    data: {
      status: "ACTIVE",
      queueColumn: metadata.parentQueueColumn || parentJob.queueColumn || "SOON",
      scheduledAt: { unset: true },
      lastCompletedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
      reason: `Decomposed child work completed for ${parentJob.jobType}.`,
      metadata: {
        ...metadata,
        decomposition: {
          ...(isPlainObject(metadata.decomposition) ? metadata.decomposition : {}),
          state: "COMPLETED",
          completedAt: new Date().toISOString(),
          completedChildCount: Array.isArray(metadata.decomposition?.children)
            ? metadata.decomposition.children.length
            : Number(metadata.decomposition?.childCount || 0) || null,
        },
      },
    },
  });
}

async function finalizeSuccessfulPipelineJob(prisma, job, reason = null) {
  const topologyReason = isDecomposedPipelineJob(job)
    ? `child-success:${job.jobType}`
    : `job-success:${job.jobType}`;

  if (!isDecomposedPipelineJob(job)) {
    const completed = await completePipelineJob(prisma, job.id, reason);
    try {
      await syncCompanyPipelineJobs(prisma, job.companyId);
      await appendPipelineTopologySyncResult(prisma, {
        companyId: job.companyId,
        reason: topologyReason,
        status: "SYNCED",
        trigger: "foreground-job-success",
      });
    } catch (error) {
      await markCompanyPipelineTopologyDirty(prisma, job.companyId, topologyReason);
      await appendPipelineTopologySyncResult(prisma, {
        companyId: job.companyId,
        reason: topologyReason,
        status: "FAILED",
        trigger: "foreground-job-success",
        error: error?.message || String(error),
      });
    }
    return completed;
  }

  await prisma.pipelineJob.delete({
    where: { id: job.id },
  });
  await completeDecompositionParentIfReady(prisma, job);
  try {
    await syncCompanyPipelineJobs(prisma, job.companyId);
    await appendPipelineTopologySyncResult(prisma, {
      companyId: job.companyId,
      reason: topologyReason,
      status: "SYNCED",
      trigger: "foreground-child-success",
    });
  } catch (error) {
    await markCompanyPipelineTopologyDirty(prisma, job.companyId, topologyReason);
    await appendPipelineTopologySyncResult(prisma, {
      companyId: job.companyId,
      reason: topologyReason,
      status: "FAILED",
      trigger: "foreground-child-success",
      error: error?.message || String(error),
    });
  }
  return null;
}

async function escalateCompanyPipelineJob(prisma, companyId, jobType, entityType = "COMPANY", entityId = companyId) {
  await syncCompanyPipelineJobs(prisma, companyId);
  const job = await prisma.pipelineJob.findUnique({
    where: {
      companyId_jobType_entityType_entityId: {
        companyId,
        jobType,
        entityType,
        entityId,
      },
    },
  });
  if (!job) {
    return null;
  }

  return prisma.pipelineJob.update({
    where: { id: job.id },
    data: {
      controlMode: "AI_ONLY",
      queueColumn: "NOW",
      status: "ACTIVE",
      scheduledAt: { unset: true },
      priorityScore: Math.max(job.priorityScore ?? 0, 150),
      lastError: null,
      reason: `Escalated for immediate operator-guided repair. ${job.reason ?? ""}`.trim(),
      updatedAt: new Date(),
    },
  });
}

async function recoverFailedCompanyPipelineJobs(prisma, companyId) {
  await prisma.pipelineJob.updateMany({
    where: {
      companyId,
      status: "FAILED",
    },
    data: {
      status: "ACTIVE",
      lastError: null,
      queueColumn: "NOW",
      controlMode: "AI_ONLY",
      scheduledAt: { unset: true },
      updatedAt: new Date(),
    },
  });
  return listCompanyPipelineJobs(prisma, companyId);
}

async function failPipelineJob(prisma, job, error) {
  const classification = classifyPipelineJobError(error);
  const retryLimit = getPipelineJobRetryLimit(job.jobType);
  const attempts = Number(job.attemptCount || 0);
  const shouldDeadLetter = !classification.retryable || attempts >= retryLimit;
  const now = new Date();
  const retryDelayMs = shouldDeadLetter
    ? null
    : Math.max(
        30_000,
        classification.retryAfterMs ?? Math.min(10 * 60 * 1000, 60_000 * Math.max(1, attempts)),
      );

  const updatedJob = await prisma.pipelineJob.update({
    where: { id: job.id },
    data: {
      status: shouldDeadLetter ? "FAILED" : "ACTIVE",
      queueColumn: shouldDeadLetter ? "PARKED" : (job.queueColumn === "NOW" ? "SOON" : job.queueColumn),
      lastError: buildPipelineFailureMessage(classification),
      reason: shouldDeadLetter
        ? `${job.jobType} dead-lettered after ${attempts}/${retryLimit} attempts (${classification.class}).`
        : `${job.jobType} cooled down for ${Math.round(retryDelayMs / 1000)}s after ${classification.class}.`,
      scheduledAt: shouldDeadLetter ? { unset: true } : new Date(now.getTime() + retryDelayMs),
      updatedAt: now,
    },
  });

  if (isDecomposedPipelineJob(job) && shouldDeadLetter) {
    const parentJobId = getDecompositionParentJobId(job);
    if (parentJobId) {
      await prisma.pipelineJob.updateMany({
        where: { id: parentJobId },
        data: {
          status: "FAILED",
          queueColumn: "PARKED",
          scheduledAt: { unset: true },
          lastError: buildPipelineFailureMessage(classification),
          reason: `${job.jobType} parent parked after decomposed child failed terminally (${classification.class}).`,
          updatedAt: now,
        },
      });
    }
  }

  return updatedJob;
}

async function spawnLowMemoryDecompositionChildJob(prisma, job, executionOptions = {}) {
  if (isDecomposedPipelineJob(job)) return null;

  const parentMetadata = getPipelineJobMetadata(job);
  const decompositionSignal = buildDecompositionSourceSignal(job.id);
  const existingChildren = await prisma.pipelineJob.findMany({
    where: {
      companyId: job.companyId,
      jobType: job.jobType,
      entityType: DECOMPOSED_PIPELINE_ENTITY_TYPE,
      sourceSignal: decompositionSignal,
      status: { in: ["ACTIVE", "RUNNING", "PAUSED"] },
    },
  });

  if (existingChildren.length > 0) {
    return existingChildren;
  }

  const childPlans = buildLowMemoryDecompositionChildPlans(job, executionOptions);

  const decomposedAt = new Date().toISOString();

  await prisma.pipelineJob.update({
    where: { id: job.id },
    data: {
      status: "PAUSED",
      queueColumn: job.queueColumn === "NOW" ? "SOON" : job.queueColumn,
      scheduledAt: { unset: true },
      lastError: null,
      reason: `${job.jobType} decomposed into a bounded child slice after repeated low-memory deferrals.`,
      updatedAt: new Date(),
      metadata: {
        ...parentMetadata,
        decomposition: {
          state: "DECOMPOSED",
          childSignal: decompositionSignal,
          childCount: childPlans.length,
          children: childPlans.map((plan) => ({
            childIndex: plan.childIndex,
            selectionOffset: plan.executionOptions.selectionOffset,
            profile: plan.executionOptions.profile,
          })),
          executionOptions,
          decomposedAt,
        },
        parentQueueColumn: job.queueColumn,
      },
    },
  });

  const createdChildren = [];
  for (const plan of childPlans) {
    const childMetadata = {
      parentJobId: job.id,
      parentQueueColumn: job.queueColumn,
      spawnedFromAttemptCount: Number(job.attemptCount || 0),
      executionOptions: plan.executionOptions,
      decomposition: {
        state: "ACTIVE_CHILD",
        spawnedAt: decomposedAt,
        childIndex: plan.childIndex,
        childCount: plan.childCount,
      },
    };

    createdChildren.push(await prisma.pipelineJob.create({
      data: {
        companyId: job.companyId,
        jobType: job.jobType,
        entityType: DECOMPOSED_PIPELINE_ENTITY_TYPE,
        entityId: `${job.id}:slice:${plan.childIndex}:${Date.now()}`,
        status: "ACTIVE",
        controlMode: "AI_ONLY",
        queueColumn: "NOW",
        manualSortOrder: 0,
        priorityScore: Math.max(Number(job.priorityScore || 0), 140 - plan.childIndex),
        reason: `Bounded child slice ${plan.childIndex + 1}/${plan.childCount} for ${job.jobType} under low-memory decomposition.`,
        sourceSignal: decompositionSignal,
        metadata: childMetadata,
      },
    }));
  }

  return createdChildren;
}

module.exports = {
  CORE_PIPELINE_JOB_TYPES,
  PLANNER_BOOTSTRAP_JOB_TYPES,
  PLANNER_QUALITY_JOB_TYPES,
  PLANNER_MAINTENANCE_JOB_TYPES,
  LEGACY_COMPAT_PIPELINE_JOB_TYPES,
  PIPELINE_JOB_TYPES,
  MANAGED_PIPELINE_JOB_TYPES,
  PIPELINE_QUEUE_COLUMNS,
  PIPELINE_CONTROL_MODES,
  PIPELINE_JOB_STATUSES,
  PIPELINE_JOB_NO_PROGRESS_TIMEOUT_MS,
  GLOBAL_PIPELINE_SYNC_INTERVAL_MS,
  PIPELINE_JOB_RETRY_LIMITS,
  PIPELINE_FAILURE_CLASSES,
  getPipelineJobLabel,
  getQueueColumnRank,
  buildNoProgressTimeoutMessage,
  getPipelineJobRetryLimit,
  classifyPipelineJobError,
  buildRunnablePipelineJobWhere,
  buildAutoJobProfile,
  shouldRunGlobalPipelineSync,
  gatherCompanyPipelineSignals,
  syncCompanyPipelineJobs,
  syncAllCompanyPipelineJobs,
  syncPipelineJobsForCompanyShard,
  syncAllCompanyPipelineJobsIfDue,
  readPipelineTopologyState,
  markCompanyPipelineTopologyDirty,
  syncDirtyCompanyPipelineJobs,
  normalizePipelineTopologyState,
  enqueueDirtyPipelineTopologyCompany,
  drainDirtyPipelineTopologyCompanies,
  recordPipelineTopologySyncResult,
  recoverStaleRunningPipelineJobs,
  recoverOrphanedRunningPipelineJobs,
  listCompanyPipelineJobs,
  listPersistedCompanyPipelineJobs,
  resetCompanyPipelineJobsToAiOnly,
  applyManualPipelineQueueMove,
  claimNextPipelineJobs,
  completePipelineJob,
  finalizeSuccessfulPipelineJob,
  escalateCompanyPipelineJob,
  recoverFailedCompanyPipelineJobs,
  failPipelineJob,
  buildLowMemoryDecompositionChildPlans,
  spawnLowMemoryDecompositionChildJob,
  sortPipelineJobs,
};
