const { processMemoryUpdates, getStagedMemoryPrompt, getHumanMemoryPrompt } = require("./memory");
const { draftFlashcardFromDataCard, draftFlashcardsFromEvidenceBatch, draftTaskcardFromFlashCard } = require("./drafter");
const { refineDraftFlashCard, refineDraftTaskCard, refineFlashcardBatch, refineNBAItemBatch } = require("./refiner");
const { auditCheckedFlashCard, auditCheckedTaskCard } = require("./judge");
const { evaluateNBAItemBatch } = require("./evaluator");
const { getWorkerConfig, validateTenant, getServerTime, logTelemetry } = require("./shared");
const { runMaintenance, processUserFeedback, scrubDatabaseElemental } = require("./maintenance");
const { updateCompanyMemory } = require("./memory");
const { enforceLanguagePolicy } = require("./language-validator");
const { OLLAMA_MODEL, STAGE_MODELS } = require("./core");
const { generateStrategicKeywords, performResearchHarvest } = require("./research");
const { ingestEvidenceUnit, selectEvidenceForGeneration, buildEvidenceBatches } = require("./evidence");
const { recomputeFrontier } = require("./frontier");
const { CandidateState } = require("./lifecycle");
const { recordDecisionEvent, recordGenerationEvent, recordOutcomeEvent } = require("./audit-ledger");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  normalizeKnowledgeScores,
  normalizeTaskScores,
} = require("../../src/lib/scoring-contract");
const {
  PLANNER_LANE_ORDER,
  PLANNER_LANE_TARGETS,
  PLANNER_MIN_FLASHCARDS,
  PLANNER_MIN_DATACARDS_FOR_ACTIVE,
  getCompanyOperatingMode,
} = require("../../src/lib/planner-contract");
const {
  getWeakestProcessingStatus,
  deriveSourceProcessingStatus,
} = require("../../src/lib/source-contract");
const { withPlannerTimeout } = require("./planner/timeout");
const { getWorkerBuildIdentity, recordPlannerTelemetry } = require("./planner/telemetry");
const { decideResearchPolicy, buildResearchContextFromDecision } = require("./planner/research-policy");
const { evaluateCandidateNovelty } = require("./planner/novelty");
const {
  readFeedbackPressureIndex,
  getPressureForFamilyKeys,
  isAnyFamilyBlocked,
} = require("./planner/feedback-pressure");
const { applyEditorialQualityGate } = require("./planner/editorial-gate");

/**
 * checklist LOCAL AI ENGINE
 * v2.0.0 — Ground Truth
 */

var synthesisState = {
  state: "idle",
  stage: "IDLE",
  pass: 0,
  lastProgressAt: new Date().toISOString(),
  currentCompany: null,
  activeTask: null,
  activeModel: null,
  cycleCount: 0,
  metrics: {
    totalOpsThisCycle: 0,
    zeroOutputStreak: 0,
    lastNonZeroCycleAt: null,
    companiesCoveredThisCycle: 0,
    failedCardsThisCycle: 0,
    totalResearchYield: 0,
    lastLatency: 0,
    cycleHistory: []
  },
  errorStats: {
    attempts: 0,
    failures: 0,
    criticalFailureStreak: 0
  }
};

function getSynthesisProgress() {
  return synthesisState;
}

async function withPlannerStageTimeout(prisma, company, label, operation, metadata = {}) {
  const stage = String(metadata?.stage || label || "");
  let timeoutMs;
  if (stage.includes("flashcard_generation") || stage.includes("task_generation")) {
    // Per-model inference is still capped separately at 120s. The outer planner
    // stage needs enough budget to finish a valid multi-step generation pass.
    timeoutMs = 5 * 60 * 1000;
  } else if (stage.includes("judging")) {
    timeoutMs = 3 * 60 * 1000;
  }
  return withPlannerTimeout(prisma, {
    companyId: company?.id || null,
    label,
    timeoutMs,
    metadata,
  }, operation);
}

const PROCESSING_STATUS_ORDER = Object.freeze({
  DRAFT: 0,
  CHECKED: 1,
  VERIFIED: 2,
  ACCEPTED: 2,
});
const FLASHCARD_OPPORTUNITY_REVISIT_DAYS = 7;
const TASK_OPPORTUNITY_REVISIT_DAYS = 7;

function isOlderThanDays(value, days) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return (Date.now() - date.getTime()) > days * 24 * 60 * 60 * 1000;
}

function findPlannerLaneDeficits(laneCounts) {
  return PLANNER_LANE_ORDER.filter((lane) => Number(laneCounts?.[lane] || 0) < Number(PLANNER_LANE_TARGETS[lane] || 0));
}

function getStatusCeilingFromValues(statuses = []) {
  return getWeakestProcessingStatus(statuses);
}

function buildTaskLifecycleCeiling(ceilingStatus) {
  if (ceilingStatus === "VERIFIED") {
    return {
      processingStatus: "VERIFIED",
      candidateState: CandidateState.EVALUATED,
      activityState: "ACTIVE",
    };
  }
  if (ceilingStatus === "CHECKED") {
    return {
      processingStatus: "CHECKED",
      candidateState: CandidateState.REFINED,
      activityState: "ACTIVE",
    };
  }
  return {
    processingStatus: "DRAFT",
    candidateState: CandidateState.GENERATED,
    activityState: "ACTIVE",
  };
}

async function computeTaskProcessingCeiling(prisma, taskOrFlashcardIds) {
  const sourceFlashcardIds = Array.isArray(taskOrFlashcardIds?.sourceFlashcardIds)
    ? taskOrFlashcardIds.sourceFlashcardIds
    : Array.isArray(taskOrFlashcardIds)
      ? taskOrFlashcardIds
      : [];
  if (sourceFlashcardIds.length === 0) return null;

  const flashcards = await prisma.flashcard.findMany({
    where: { id: { in: sourceFlashcardIds } },
    select: { id: true, processingStatus: true },
  });
  if (flashcards.length === 0) return null;
  return getStatusCeilingFromValues(flashcards.map((flashcard) => flashcard.processingStatus));
}

async function enforceTaskProcessingCeiling(prisma, taskId) {
  const task = await prisma.checklistTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      companyId: true,
      processingStatus: true,
      candidateState: true,
      activityState: true,
      sourceFlashcardIds: true,
    },
  });
  if (!task) return false;

  const ceilingStatus = await computeTaskProcessingCeiling(prisma, task);
  if (!ceilingStatus) return false;

  const currentRank = PROCESSING_STATUS_ORDER[String(task.processingStatus || "DRAFT").toUpperCase()] ?? 0;
  const ceilingRank = PROCESSING_STATUS_ORDER[ceilingStatus] ?? 0;
  if (currentRank <= ceilingRank) return false;

  const lifecycleCeiling = buildTaskLifecycleCeiling(ceilingStatus);
  await prisma.checklistTask.update({
    where: { id: task.id },
    data: lifecycleCeiling,
  });
  await recordPlannerTelemetry(prisma, {
    companyId: task.companyId,
    entityType: "TASK",
    entityId: task.id,
    eventType: "QUALITY_CEILING_APPLIED",
    reason: `Task lifecycle was capped to ${ceilingStatus} by weakest upstream flashcard status.`,
    details: {
      fromStatus: task.processingStatus,
      toStatus: lifecycleCeiling.processingStatus,
      sourceFlashcardIds: task.sourceFlashcardIds,
    },
  });
  return true;
}

async function computeFlashcardProcessingCeiling(prisma, flashcardId) {
  const sourceLinks = await prisma.flashcardSource.findMany({
    where: {
      flashcardId,
      sourceType: "SOURCE",
    },
    select: { sourceId: true },
  });
  if (sourceLinks.length === 0) return null;

  const sources = await prisma.source.findMany({
    where: { id: { in: sourceLinks.map((link) => link.sourceId) } },
    select: {
      id: true,
      processingStatus: true,
      content: true,
      canonicalContent: true,
      canonicalContentHash: true,
      confidence: true,
      confidenceScore: true,
      provenance: true,
      sourceType: true,
      metadata: true,
    },
  });
  if (sources.length === 0) return null;

  return getWeakestProcessingStatus(sources.map((source) => deriveSourceProcessingStatus(source)));
}

async function enforceFlashcardProcessingCeiling(prisma, flashcardId) {
  const flashcard = await prisma.flashcard.findUnique({
    where: { id: flashcardId },
    select: { id: true, companyId: true, processingStatus: true },
  });
  if (!flashcard) return false;

  const ceilingStatus = await computeFlashcardProcessingCeiling(prisma, flashcardId);
  if (!ceilingStatus) return false;

  const currentRank = PROCESSING_STATUS_ORDER[String(flashcard.processingStatus || "DRAFT").toUpperCase()] ?? 0;
  const ceilingRank = PROCESSING_STATUS_ORDER[ceilingStatus] ?? 0;
  if (currentRank <= ceilingRank) return false;

  await prisma.flashcard.update({
    where: { id: flashcardId },
    data: {
      processingStatus: ceilingStatus,
    },
  });
  await recordPlannerTelemetry(prisma, {
    companyId: flashcard.companyId,
    entityType: "FLASHCARD",
    entityId: flashcardId,
    eventType: "QUALITY_CEILING_APPLIED",
    reason: `Flashcard lifecycle was capped to ${ceilingStatus} by weakest linked datacard status.`,
    details: {
      fromStatus: flashcard.processingStatus,
      toStatus: ceilingStatus,
    },
  });
  return true;
}

async function loadCompanyPlannerInventory(prisma, companyId) {
  const [datacardCount, flashcardCount, taskLaneCounts] = await Promise.all([
    prisma.source.count({ where: { companyId } }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
    }),
    prisma.checklistTask.groupBy({
      by: ["kanbanColumn"],
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        status: { notIn: ["ARCHIVED", "COMPLETED"] },
      },
      _count: { _all: true },
    }),
  ]);

  const laneCounts = Object.fromEntries(
    PLANNER_LANE_ORDER.map((lane) => [lane, 0]),
  );
  for (const row of taskLaneCounts) {
    laneCounts[row.kanbanColumn] = row._count._all;
  }

  return {
    datacardCount,
    flashcardCount,
    laneCounts,
    deficits: findPlannerLaneDeficits(laneCounts),
    mode: getCompanyOperatingMode({
      datacardCount,
      flashcardCount,
      laneCounts,
    }),
  };
}

async function loadBatchLinkedSources(prisma, flashcardIds) {
  if (!Array.isArray(flashcardIds) || flashcardIds.length === 0) return [];
  const links = await prisma.flashcardSource.findMany({
    where: {
      flashcardId: { in: flashcardIds },
      sourceType: "SOURCE",
    },
    select: { sourceId: true },
  });
  if (links.length === 0) return [];
  return prisma.source.findMany({
    where: { id: { in: Array.from(new Set(links.map((link) => link.sourceId))) } },
  });
}

async function loadFlashcardOpportunitySources(prisma, companyId, {
  excludeSourceIds = [],
  take = 5,
} = {}) {
  if (!take || take <= 0) return [];

  const sources = await prisma.source.findMany({
    where: {
      companyId,
      ...(excludeSourceIds.length > 0 ? { id: { notIn: excludeSourceIds } } : {}),
    },
    orderBy: [
      { updatedAt: "asc" },
      { createdAt: "asc" },
    ],
    take: take * 6,
  });
  if (sources.length === 0) return [];

  const links = await prisma.flashcardSource.findMany({
    where: {
      sourceType: "SOURCE",
      sourceId: { in: sources.map((source) => source.id) },
      flashcard: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
      },
    },
    select: { sourceId: true },
  });
  const linkCounts = new Map();
  for (const link of links) {
    linkCounts.set(link.sourceId, (linkCounts.get(link.sourceId) || 0) + 1);
  }

  return sources
    .filter((source) => (linkCounts.get(source.id) || 0) > 0)
    .filter((source) => isOlderThanDays(
      source.metadata?.lastOpportunityMinedAt || source.updatedAt || source.createdAt,
      FLASHCARD_OPPORTUNITY_REVISIT_DAYS,
    ))
    .sort((left, right) => {
      const linkDelta = (linkCounts.get(left.id) || 0) - (linkCounts.get(right.id) || 0);
      if (linkDelta !== 0) return linkDelta;
      const ageDelta = new Date(left.updatedAt || left.createdAt || 0) - new Date(right.updatedAt || right.createdAt || 0);
      if (ageDelta !== 0) return ageDelta;
      return Number(right.iceScore || 0) - Number(left.iceScore || 0);
    })
    .slice(0, take);
}

async function markOpportunityBatchMined(prisma, sources, workerContext, outcome = {}) {
  const minedAt = new Date().toISOString();
  await Promise.all(
    sources.map((source) => prisma.source.update({
      where: { id: source.id },
      data: {
        metadata: {
          ...(source.metadata || {}),
          lastOpportunityMinedAt: minedAt,
          lastOpportunityMiningRunId: workerContext?.cycleRunId || null,
          lastOpportunityMiningCreatedCount: Number(outcome.createdCount || 0),
        },
      },
    })),
  );
}

async function loadTaskOpportunityTaskCounts(prisma, companyId, flashcards) {
  const counts = new Map();
  await Promise.all(
    flashcards.map(async (flashcard) => {
      const count = await prisma.checklistTask.count({
        where: {
          companyId,
          activityState: { in: ["ACTIVE", "STALE"] },
          status: { notIn: ["ARCHIVED", "COMPLETED"] },
          sourceFlashcardIds: { has: flashcard.id },
        },
      });
      counts.set(flashcard.id, count);
    }),
  );
  return counts;
}

async function buildGenerationResearchContext(prisma, company, {
  operation,
  entityType,
  entityId = null,
  inventory = null,
  entity = null,
  sources = [],
  flashcards = [],
}) {
  const decision = decideResearchPolicy({
    operation,
    company,
    inventory,
    entity,
    sources,
    flashcards,
  });
  await recordPlannerTelemetry(prisma, {
    companyId: company.id,
    entityType,
    entityId,
    eventType: decision.shouldResearch ? "RESEARCH_POLICY_RUN" : "RESEARCH_POLICY_SKIP",
    reason: decision.reason,
    details: decision,
  });
  const context = await buildResearchContextFromDecision(decision);
  return { decision, context };
}

async function applyNoveltyGate(prisma, company, {
  entityType,
  entityId = null,
  candidate,
  inventory = null,
}) {
  const novelty = await evaluateCandidateNovelty(prisma, {
    companyId: company.id,
    entityType,
    candidate,
    inventory,
  });
  if (!novelty.shouldPublish) {
    await recordPlannerTelemetry(prisma, {
      companyId: company.id,
      entityType,
      entityId,
      eventType: "NOVELTY_BLOCKED",
      reason: novelty.reason,
      details: novelty,
    });
  }
  return novelty;
}

async function applyEditorialGate(prisma, company, {
  entityType,
  entityId = null,
  candidate,
  bodyLimit,
}) {
  const gated = applyEditorialQualityGate(entityType, candidate, { bodyLimit });
  if (gated?.editorialGate?.shouldDowngrade) {
    await recordPlannerTelemetry(prisma, {
      companyId: company.id,
      entityType,
      entityId,
      eventType: "EDITORIAL_GATE_DOWNGRADE",
      reason: `Editorial gate downgraded ${entityType.toLowerCase()} copy because ${gated.editorialGate.weakestDimension} quality was too low.`,
      details: gated.editorialGate,
    });
  }
  return gated;
}

async function runCompanyPlannerCycle(prisma, company, memoryPrompt, topic, workerContext) {
  let ops = 0;
  let inventory = await loadCompanyPlannerInventory(prisma, company.id);

  if (inventory.datacardCount < PLANNER_MIN_DATACARDS_FOR_ACTIVE) {
    console.log(`[PLANNER] ${company.name}: inactive (no datacards).`);
    return 0;
  }

  console.log(
    `[PLANNER] ${company.name}: mode=${inventory.mode} datacards=${inventory.datacardCount} flashcards=${inventory.flashcardCount} deficits=${inventory.deficits.join(",") || "none"}`,
  );

  if (inventory.flashcardCount < PLANNER_MIN_FLASHCARDS) {
    ops += await withPlannerStageTimeout(
      prisma,
      company,
      `${company.name}:bootstrap_flashcard_generation`,
      () => performCompanyWriting(prisma, company, memoryPrompt, topic, workerContext),
      { stage: "bootstrap_flashcard_generation", mode: inventory.mode },
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    ops += await withPlannerStageTimeout(
      prisma,
      company,
      `${company.name}:bootstrap_flashcard_judging`,
      () => performCompanyJudging(prisma, company, memoryPrompt, topic, workerContext),
      { stage: "bootstrap_flashcard_judging", mode: inventory.mode },
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    inventory = await loadCompanyPlannerInventory(prisma, company.id);
  }

  if (inventory.flashcardCount < PLANNER_MIN_FLASHCARDS && inventory.datacardCount <= 3) {
    const researchOps = await performCompanyScrubbing(prisma, company, memoryPrompt, topic, workerContext);
    ops += researchOps;
    if (researchOps > 0) {
      ops += await withPlannerStageTimeout(
        prisma,
        company,
        `${company.name}:research_backfill_flashcard_generation`,
        () => performCompanyWriting(prisma, company, memoryPrompt, topic, workerContext),
        { stage: "research_backfill_flashcard_generation", mode: inventory.mode },
      ).catch((error) => {
        console.warn(error.message);
        return 0;
      });
      ops += await withPlannerStageTimeout(
        prisma,
        company,
        `${company.name}:research_backfill_flashcard_judging`,
        () => performCompanyJudging(prisma, company, memoryPrompt, topic, workerContext),
        { stage: "research_backfill_flashcard_judging", mode: inventory.mode },
      ).catch((error) => {
        console.warn(error.message);
        return 0;
      });
      inventory = await loadCompanyPlannerInventory(prisma, company.id);
    }
  }

  if (inventory.deficits.length > 0) {
    ops += await withPlannerStageTimeout(
      prisma,
      company,
      `${company.name}:lane_deficit_task_generation`,
      () => performCompanyActionGeneration(prisma, company, memoryPrompt, topic, workerContext),
      { stage: "lane_deficit_task_generation", deficits: inventory.deficits },
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    inventory = await loadCompanyPlannerInventory(prisma, company.id);
  }

  if (inventory.deficits.length > 0 && inventory.flashcardCount < PLANNER_MIN_FLASHCARDS) {
    ops += await withPlannerStageTimeout(
      prisma,
      company,
      `${company.name}:lane_deficit_flashcard_generation`,
      () => performCompanyWriting(prisma, company, memoryPrompt, topic, workerContext),
      { stage: "lane_deficit_flashcard_generation", deficits: inventory.deficits },
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    ops += await withPlannerStageTimeout(
      prisma,
      company,
      `${company.name}:lane_deficit_flashcard_judging`,
      () => performCompanyJudging(prisma, company, memoryPrompt, topic, workerContext),
      { stage: "lane_deficit_flashcard_judging", deficits: inventory.deficits },
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    ops += await withPlannerStageTimeout(
      prisma,
      company,
      `${company.name}:lane_deficit_retry_task_generation`,
      () => performCompanyActionGeneration(prisma, company, memoryPrompt, topic, workerContext),
      { stage: "lane_deficit_retry_task_generation", deficits: inventory.deficits },
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    inventory = await loadCompanyPlannerInventory(prisma, company.id);
  }

  if (inventory.mode === "MAINTENANCE" && ops === 0) {
    ops += await withPlannerStageTimeout(
      prisma,
      company,
      `${company.name}:maintenance_task_generation`,
      () => performCompanyActionGeneration(prisma, company, memoryPrompt, topic, workerContext),
      { stage: "maintenance_task_generation", mode: inventory.mode },
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
  }

  await recomputeFrontier(prisma, company, workerContext?.cycleRunId);
  return ops;
}

function isRetryableWriteConflict(error) {
  return Boolean(error && typeof error === "object" && error.code === "P2034");
}

async function withProgressRetry(operation, attempt = 0) {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableWriteConflict(error) || attempt >= 3) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    return withProgressRetry(operation, attempt + 1);
  }
}

async function collectGlobalWorkerSettings(prisma) {
  return {
    supervisorContractVersion: 2,
    schedulingMode: "pipeline-queue-aware",
    buildIdentity: getWorkerBuildIdentity(),
  };
}

async function updateProgress(prisma, updates = {}) {
  Object.assign(synthesisState, updates, { lastProgressAt: new Date().toISOString() });
  try {
    const settings = await collectGlobalWorkerSettings(prisma);
    await withProgressRetry(() =>
      prisma.globalSetting.upsert({
        where: { key: "core_synthesis_progress" },
        create: { key: "core_synthesis_progress", value: { ...synthesisState, settings } },
        update: { value: { ...synthesisState, settings }, updatedAt: new Date() }
      })
    );
  } catch (e) {
    console.error("[PROGRESS] Sync failed:", e.message);
  }
}

async function acquireLock(prisma, companyId, attempt = 1) {
  const { isUniqueConstraintError, getServerTime } = require("./shared");
  const key = `lock:company:${companyId}`;
  const now = await getServerTime(prisma);
  const ownerId = `local-ai-worker:${process.pid}`;
  
  // v2.0.0: Safe Cleanup of Expired Locks
  const existing = await prisma.globalSetting.findUnique({ where: { key } });
  if (existing && existing.value) {
    const expiresAt = new Date(existing.value.expiresAt);
    if (expiresAt < now) {
      console.log(`[LOCK] Cleaning up expired lock for ${companyId}`);
      await prisma.globalSetting.delete({ where: { id: existing.id } }).catch(() => {});
    } else if (existing.value.ownerId !== ownerId) {
      console.log(`[LOCK] ${companyId} is active (Owner: ${existing.value.ownerId}). Skipping.`);
      return null; // Locked by someone else
    }
  }

  const data = { 
    ownerId, 
    acquiredAt: now.toISOString(), 
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(), 
    cycleRunId: crypto.randomUUID(), 
    renewalCount: 0 
  };

  try {
    await prisma.globalSetting.create({ data: { key, value: data } });
    return data;
  } catch (e) {
    if (isUniqueConstraintError(e) && attempt < 2) {
      await new Promise(r => setTimeout(r, 50 + Math.random() * 150));
      return acquireLock(prisma, companyId, attempt + 1);
    }
    return null;
  }
}

async function renewLock(prisma, companyId, lockCtx) {
  const key = `lock:company:${companyId}`;
  const now = await getServerTime(prisma);
  
  const existing = await prisma.globalSetting.findUnique({ where: { key } });
  if (!existing || existing.value.ownerId !== lockCtx.ownerId || existing.value.cycleRunId !== lockCtx.cycleRunId) {
    throw new Error("CRITICAL: Lock renewal failed.");
  }

  await prisma.globalSetting.update({
    where: { id: existing.id },
    data: {
      value: {
        ...lockCtx,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        renewalCount: (existing.value.renewalCount || 0) + 1
      },
      updatedAt: now
    }
  });
}

async function releaseLock(prisma, companyId, lockCtx) {
  const key = `lock:company:${companyId}`;
  const existing = await prisma.globalSetting.findUnique({ where: { key } });
  if (existing && existing.value.cycleRunId === lockCtx.cycleRunId) {
    await prisma.globalSetting.delete({ where: { id: existing.id } }).catch(() => {});
  }
}

async function runSynthesisCycle(prisma) {
  let totalOperations = 0;
  const companies = await prisma.company.findMany({ orderBy: { lastAIVisited: "asc" } });
  const currentBatch = companies.slice(0, 5);
  const batchContext = [];

  for (const company of currentBatch) {
    validateTenant(company.id);
    const lockCtx = await acquireLock(prisma, company.id);
    if (!lockCtx) continue;

    // M4.1: Distill fresh feedback into structured memory entries before generation
    try {
      await processMemoryUpdates(prisma, company);
    } catch (err) {
      console.warn(`[SYNTHESIS] Memory distillation failed for ${company.name}:`, err.message);
    }

    const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
    batchContext.push({ company, memoryPrompt, lockCtx, lockId: lockCtx.cycleRunId, ops: 0 });
    await prisma.company.update({ where: { id: company.id }, data: { lastAIVisited: new Date() } });
    await recordDecisionEvent(prisma, {
      companyId: company.id,
      decisionMaker: `local-ai-worker:${process.pid}`,
      decisionType: "COMPANY_SELECTED_FOR_CYCLE",
      entityType: "COMPANY",
      entityId: company.id,
      payload: {
        stageOrder: ["SCRUBBING", "WRITING", "JUDGING", "ACTION"],
        schedulingMode: "company-serial-cycle",
      },
      rationale: "Company selected by the legacy company-cycle scheduler for current synthesis batch",
      teachingWeight: 30,
      cycleRunId: lockCtx.cycleRunId,
    });
  }

  const STAGES = [
    { name: "SCRUBBING", handler: performCompanyScrubbing },
    { name: "WRITING",   handler: performCompanyWriting },
    { name: "JUDGING",   handler: performCompanyJudging },
    { name: "ACTION",    handler: performCompanyActionGeneration } // M4.3
  ];

  for (const stage of STAGES) {
    for (const ctx of batchContext) await renewLock(prisma, ctx.company.id, ctx.lockCtx);
    await updateProgress(prisma, { stage: stage.name });

    for (const ctx of batchContext) {
      await recordDecisionEvent(prisma, {
        companyId: ctx.company.id,
        decisionMaker: `local-ai-worker:${process.pid}`,
        decisionType: "WORKER_STAGE_ENTER",
        entityType: "COMPANY",
        entityId: ctx.company.id,
        payload: {
          stage: stage.name,
          workerId: ctx.lockCtx.ownerId,
        },
        rationale: `Entering ${stage.name} stage for company cycle`,
        teachingWeight: 30,
        cycleRunId: ctx.lockId,
      });
      // M4.1: Refresh memory prompt with stage-specific lessons
      const stagePrompt = await getStagedMemoryPrompt(prisma, ctx.company, stage.name);
      
      const ops = await stage.handler(prisma, ctx.company, stagePrompt, null, { 
        cycleRunId: ctx.lockId, 
        workerId: `local-ai-worker:${process.pid}` 
      });
      ctx.ops += ops;
      totalOperations += ops;
    }
  }

  for (const ctx of batchContext) await releaseLock(prisma, ctx.company.id, ctx.lockCtx);
  await updateProgress(prisma, { state: "idle", stage: "IDLE" });
  return { operations: totalOperations };
}

async function performCompanyScrubbing(prisma, company, memoryPrompt, topic, workerContext) {
  const inventory = await loadCompanyPlannerInventory(prisma, company.id);
  const decision = decideResearchPolicy({
    operation: "RESEARCH_BACKFILL",
    company,
    inventory,
  });
  await recordPlannerTelemetry(prisma, {
    companyId: company.id,
    entityType: "COMPANY",
    entityId: company.id,
    eventType: decision.shouldResearch ? "RESEARCH_POLICY_RUN" : "RESEARCH_POLICY_SKIP",
    reason: decision.reason,
    details: decision,
  });
  if (!decision.shouldResearch) {
    return 0;
  }
  const results = await performResearchHarvest(prisma, company, topic);
  let ops = 0;

  for (const r of results) {
    try {
      // M1.1: Use canonical evidence ingestion with hash dedup
      const { isDuplicate } = await ingestEvidenceUnit(prisma, {
        companyId: company.id,
        content: r.content,
        provenance: r.provenance || r.url || null,
        sourceType: r.sourceType || "WEB",
        topicHints: r.topicHints || (topic ? [topic.label] : []),
        freshnessWindowDays: r.freshnessWindowDays || 30,
        metadata: r.metadata || {},
        entityTag: r.entityTag || null,
      });
      if (!isDuplicate) ops++;
    } catch (err) {
      console.error(`[SCRUBBER] Failed to ingest result:`, err.message);
    }
  }
  return ops;
}

async function performCompanyWriting(prisma, company, memoryPrompt, topic, workerContext) {
  const { validateTenant, getServerTime, generateFingerprint } = require("./shared");
  validateTenant(company.id);

  let dbFlashcards = [];
  const cid = company.id;
  const orbitLimit = await getWorkerConfig(prisma, company, "batch_limit", 5);
  const inventory = await loadCompanyPlannerInventory(prisma, cid);
  const [flashcardNoveltyInventory, taskNoveltyInventory, goalNoveltyInventory] = await Promise.all([
    prisma.flashcard.findMany({
      where: { companyId: cid, activityState: { in: ["ACTIVE", "STALE"] } },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: { id: true, publicId: true, title: true, body: true, hashtags: true },
    }),
    prisma.checklistTask.findMany({
      where: {
        companyId: cid,
        activityState: { in: ["ACTIVE", "STALE"] },
        status: { notIn: ["ARCHIVED", "COMPLETED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: { id: true, publicId: true, title: true, description: true, hashtags: true },
    }),
    prisma.goalcard.findMany({
      where: { companyId: cid, activityState: { in: ["ACTIVE", "STALE"] } },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: { id: true, publicId: true, title: true, body: true, hashtags: true },
    }),
  ]);

  // M2.1: Use evidence.js for source selection with topic-hint filtering
  const topicFilter = topic ? [topic.label] : [];
  const sources = await selectEvidenceForGeneration(prisma, company, topicFilter, orbitLimit * 3);

  // Filter to unprocessed sources only (no active flashcard linked)
  const synthesizedSourceLinks = await prisma.flashcardSource.findMany({
    where: {
      sourceType: "SOURCE",
      flashcard: { companyId: cid, activityState: { in: ["ACTIVE", "STALE"] } }
    },
    select: { sourceId: true }
  });
  const synthesizedIds = new Set(synthesizedSourceLinks.map(l => l.sourceId));
  const unprocessed = sources.filter(s => !synthesizedIds.has(s.id));
  const opportunitySlots = Math.max(0, orbitLimit - Math.min(orbitLimit, unprocessed.length));
  const opportunitySources = await loadFlashcardOpportunitySources(prisma, cid, {
    excludeSourceIds: Array.from(new Set(unprocessed.map((source) => source.id))),
    take: opportunitySlots,
  });
  const bootstrapRevisitSources = (
    inventory.flashcardCount < PLANNER_MIN_FLASHCARDS && unprocessed.length === 0
  )
    ? sources.filter((source) => synthesizedIds.has(source.id)).slice(0, orbitLimit)
    : [];

  // M2.1: Build evidence batches for multi-cardinality synthesis
  const batches = buildEvidenceBatches(unprocessed, 3);
  const opportunityBatches = opportunitySources.map((source) => [source]);
  const bootstrapBatches = bootstrapRevisitSources.map((source) => [source]);
  const plannedBatches = [...batches, ...opportunityBatches, ...bootstrapBatches].slice(0, orbitLimit);
  console.log(
    `[GENERATOR] ${company.name}: ${unprocessed.length} unprocessed sources → ${batches.length} evidence batches; ${opportunitySources.length} opportunity sources selected; ${bootstrapRevisitSources.length} bootstrap revisit sources.`,
  );

  if (opportunitySources.length > 0) {
    await recordPlannerTelemetry(prisma, {
      companyId: cid,
      entityType: "SOURCE",
      entityId: opportunitySources[0].id,
      eventType: "OPPORTUNITY_MINING_RUN",
      reason: "Previously mined datacards were revisited to search for additional flashcard opportunities.",
      details: {
        sourceIds: opportunitySources.map((source) => source.id),
        revisitDays: FLASHCARD_OPPORTUNITY_REVISIT_DAYS,
      },
    });
  }

  if (bootstrapRevisitSources.length > 0) {
    await recordPlannerTelemetry(prisma, {
      companyId: cid,
      entityType: "SOURCE",
      entityId: bootstrapRevisitSources[0].id,
      eventType: "OPPORTUNITY_MINING_RUN",
      reason: "Company is below flashcard minimum, so previously processed datacards were revisited for bootstrap generation.",
      details: {
        sourceIds: bootstrapRevisitSources.map((source) => source.id),
        flashcardCount: inventory.flashcardCount,
        flashcardTarget: PLANNER_MIN_FLASHCARDS,
        bootstrapRevisit: true,
      },
    });
  }

  for (const batch of plannedBatches) {
    try {
      const isOpportunityBatch = batch.every((source) => synthesizedIds.has(source.id));
      const { context: researchContext } = await buildGenerationResearchContext(prisma, company, {
        operation: "FLASHCARD_CREATE",
        entityType: "SOURCE",
        entityId: batch[0]?.id || null,
        inventory,
        entity: {
          iceScore: Math.max(...batch.map((source) => Number(source?.iceScore ?? 0)), 0),
        },
        sources: batch,
      });
      const drafts = await draftFlashcardsFromEvidenceBatch(
        prisma,
        company,
        batch,
        memoryPrompt,
        topic,
        {
          researchContext,
          allowedCategories: ["FLASHCARD"],
        },
      );
      if (drafts && drafts.length > 0) {
        for (const draft of drafts) {
          const { category, ...cleanDraft } = draft;
          const normalizedCategory = String(category || "FLASHCARD").toUpperCase();
          let createdItem;

          if (normalizedCategory !== "FLASHCARD") {
            await recordPlannerTelemetry(prisma, {
              companyId: cid,
              entityType: "SOURCE",
              entityId: batch[0]?.id || null,
              eventType: "CATEGORY_BLOCKED",
              reason: `Datacard generation only publishes flashcards. ${normalizedCategory} output was skipped.`,
              details: {
                category: normalizedCategory,
                title: cleanDraft.title || null,
                sourceIds: batch.map((src) => src.id),
              },
            });
            continue;
          }

          if (normalizedCategory === "GOALCARD") {
            const editorialDraft = await applyEditorialGate(prisma, company, {
              entityType: "GOAL",
              entityId: cleanDraft.id,
              candidate: cleanDraft,
              bodyLimit: 1200,
            });
            const novelty = await applyNoveltyGate(prisma, company, {
              entityType: "GOAL",
              entityId: editorialDraft.id,
              candidate: {
                title: editorialDraft.title,
                body: editorialDraft.body,
                hashtags: editorialDraft.hashtags,
              },
              inventory: goalNoveltyInventory,
            });
            if (!novelty.shouldPublish) continue;
            const normalizedScores = normalizeKnowledgeScores(editorialDraft);
            if (editorialDraft.scoreProfile && typeof editorialDraft.scoreProfile === "object") {
              editorialDraft.scoreProfile = {
                ...editorialDraft.scoreProfile,
                rationale: {
                  ...(editorialDraft.scoreProfile.rationale || {}),
                  noveltyScore: novelty.noveltyScore,
                  maxSimilarity: novelty.maxSimilarity,
                  noveltyClusterId: novelty.noveltyClusterId,
                  noveltyClosestMatch: novelty.closestMatch,
                  editorialGate: editorialDraft.editorialGate,
                },
              };
            }
            createdItem = await prisma.goalcard.create({
              data: {
                id: editorialDraft.id,
                publicId: editorialDraft.publicId,
                companyId: cid,
                title: editorialDraft.title,
                body: editorialDraft.body,
                confidence: normalizedScores.confidence,
                confidenceScore: normalizedScores.confidenceScore,
                impact: normalizedScores.impact,
                weight: normalizedScores.weight,
                iceScore: normalizedScores.iceScore,
                scoreProfile: editorialDraft.scoreProfile ?? undefined,
                processingStatus: editorialDraft.processingStatus === "REVIEW" ? "REVIEW" : "DRAFT",
                activityState: editorialDraft.activityState ?? "ACTIVE",
                createdBy: editorialDraft.createdBy ?? "generator-agent",
                refreshedAt: editorialDraft.refreshedAt ?? await getServerTime(prisma),
                hashtags: editorialDraft.hashtags ?? [],
                evidence: editorialDraft.evidence ?? undefined,
                fingerprint: editorialDraft.fingerprint ?? undefined,
                kind: editorialDraft.kind ?? "GOAL",
                intelligenceType: editorialDraft.intelligenceType ?? "INTERNAL",
                createdAt: await getServerTime(prisma)
              }
            });
            goalNoveltyInventory.unshift({
              id: createdItem.id,
              publicId: createdItem.publicId,
              title: createdItem.title,
              body: createdItem.body,
              hashtags: createdItem.hashtags,
            });
            await recordGenerationEvent(prisma, {
              companyId: cid,
              entityType: "GOAL",
              entityId: createdItem.id,
              sourceEntityIds: batch.map((src) => src.id),
              promptName: "goalcard-generation",
              promptVersion: cleanDraft.promptVersion || "worker-runtime",
              modelName: cleanDraft.modelName || "local-worker",
              generatedTitle: cleanDraft.title,
              generatedBody: cleanDraft.body,
              selected: true,
              payload: {
                category: normalizedCategory,
                hashtags: cleanDraft.hashtags || [],
              },
              teachingWeight: 45,
              cycleRunId: workerContext.cycleRunId,
            });
            // Link sources to Goalcard
            for (const src of batch) {
              await prisma.goalcardSource.create({
                data: {
                  goalcardId: createdItem.id,
                  sourceId: src.id,
                  sourceType: "SOURCE",
                  sourceName: src.entityTag || "Agent Research",
                  createdAt: await getServerTime(prisma)
                }
              }).catch(() => {});
            }
          } else if (normalizedCategory === "TASKCARD") {
            const sourceIds = batch.map(src => src.id);
            const editorialDraft = await applyEditorialGate(prisma, company, {
              entityType: "TASK",
              entityId: cleanDraft.id,
              candidate: {
                ...cleanDraft,
                description: cleanDraft.body,
              },
              bodyLimit: 1200,
            });
            const novelty = await applyNoveltyGate(prisma, company, {
              entityType: "TASK",
              entityId: editorialDraft.id,
              candidate: {
                title: editorialDraft.title,
                description: editorialDraft.description,
                hashtags: editorialDraft.hashtags,
              },
              inventory: taskNoveltyInventory,
            });
            if (!novelty.shouldPublish) continue;
            const normalizedScores = normalizeTaskScores({
              impact: editorialDraft.impact,
              confidence: editorialDraft.confidenceScore ?? editorialDraft.confidence,
              ease: editorialDraft.weight ?? editorialDraft.ease,
            });
            createdItem = await prisma.checklistTask.create({
              data: {
                companyId: cid,
                title: editorialDraft.title,
                description: editorialDraft.description,
                status: "PENDING",
                confidence: normalizedScores.confidence,
                confidenceScore: normalizedScores.confidenceScore,
                impact: normalizedScores.impact,
                ease: normalizedScores.ease,
                iceScore: normalizedScores.iceScore,
                hashtags: editorialDraft.hashtags,
                cycleRunId: workerContext.cycleRunId,
                generatedFromIds: sourceIds,
                candidateState: "GENERATED",
                processingStatus: editorialDraft.processingStatus === "REVIEW" ? "REVIEW" : undefined,
                scoreProfile: editorialDraft.scoreProfile
                  ? {
                      ...editorialDraft.scoreProfile,
                      rationale: {
                        ...(editorialDraft.scoreProfile.rationale || {}),
                        noveltyScore: novelty.noveltyScore,
                        maxSimilarity: novelty.maxSimilarity,
                        noveltyClusterId: novelty.noveltyClusterId,
                        noveltyClosestMatch: novelty.closestMatch,
                        editorialGate: editorialDraft.editorialGate,
                      },
                    }
                  : undefined,
              }
            });
            taskNoveltyInventory.unshift({
              id: createdItem.id,
              publicId: createdItem.publicId,
              title: createdItem.title,
              description: createdItem.description,
              hashtags: createdItem.hashtags,
            });
            await recordGenerationEvent(prisma, {
              companyId: cid,
              entityType: "TASK",
              entityId: createdItem.id,
              sourceEntityIds: sourceIds,
              promptName: "taskcard-generation",
              promptVersion: cleanDraft.promptVersion || "worker-runtime",
              modelName: cleanDraft.modelName || "local-worker",
              generatedTitle: cleanDraft.title,
              generatedBody: cleanDraft.body,
              selected: true,
              payload: {
                category: normalizedCategory,
                hashtags: cleanDraft.hashtags || [],
                iceScore: normalizedScores.iceScore,
                impact: normalizedScores.impact,
                confidence: normalizedScores.confidence,
                ease: normalizedScores.ease,
              },
              teachingWeight: 45,
              cycleRunId: workerContext.cycleRunId,
            });
          } else {
            // Default: FLASHCARD
            const editorialDraft = await applyEditorialGate(prisma, company, {
              entityType: "FLASHCARD",
              entityId: cleanDraft.id,
              candidate: cleanDraft,
              bodyLimit: 1200,
            });
            const novelty = await applyNoveltyGate(prisma, company, {
              entityType: "FLASHCARD",
              entityId: editorialDraft.id,
              candidate: {
                title: editorialDraft.title,
                body: editorialDraft.body,
                hashtags: editorialDraft.hashtags,
              },
              inventory: flashcardNoveltyInventory,
            });
            if (!novelty.shouldPublish) continue;
            const normalizedScores = normalizeKnowledgeScores(editorialDraft);
            const noveltyAwareScoreProfile = editorialDraft.scoreProfile && typeof editorialDraft.scoreProfile === "object"
              ? {
                  ...editorialDraft.scoreProfile,
                  rationale: {
                    ...(editorialDraft.scoreProfile.rationale || {}),
                    noveltyScore: novelty.noveltyScore,
                    maxSimilarity: novelty.maxSimilarity,
                    noveltyClusterId: novelty.noveltyClusterId,
                    noveltyClosestMatch: novelty.closestMatch,
                    editorialGate: editorialDraft.editorialGate,
                  },
                }
              : editorialDraft.scoreProfile ?? undefined;
            createdItem = await prisma.flashcard.create({
              data: {
                id: editorialDraft.id,
                publicId: editorialDraft.publicId,
                companyId: cid,
                title: editorialDraft.title,
                body: editorialDraft.body,
                confidence: normalizedScores.confidence,
                confidenceScore: normalizedScores.confidenceScore,
                impact: normalizedScores.impact,
                weight: normalizedScores.weight,
                iceScore: normalizedScores.iceScore,
                scoreProfile: noveltyAwareScoreProfile,
                processingStatus: editorialDraft.processingStatus === "REVIEW" ? "REVIEW" : "DRAFT",
                activityState: editorialDraft.activityState ?? "ACTIVE",
                status: editorialDraft.status ?? "ACTIVE",
                reviewStatus: editorialDraft.reviewStatus ?? "PENDING",
                createdBy: editorialDraft.createdBy ?? "generator-agent",
                refreshedAt: editorialDraft.refreshedAt ?? await getServerTime(prisma),
                hashtags: editorialDraft.hashtags ?? [],
                evidence: editorialDraft.evidence ?? undefined,
                citationSnapshotIds: editorialDraft.citationSnapshotIds ?? [],
                conflictDetected: editorialDraft.conflictDetected ?? false,
                conflictSummary: editorialDraft.conflictSummary ?? undefined,
                fingerprint: editorialDraft.fingerprint ?? undefined,
                kind: editorialDraft.kind ?? "SUMMARY",
                intelligenceType: editorialDraft.intelligenceType ?? "INTERNAL",
                generatedFromIds: editorialDraft.generatedFromIds ?? [],
                versionFamilyId: editorialDraft.versionFamilyId ?? undefined,
                cycleRunId: workerContext.cycleRunId,
                createdByRunId: workerContext.cycleRunId,
                createdAt: await getServerTime(prisma)
              }
            });
            flashcardNoveltyInventory.unshift({
              id: createdItem.id,
              publicId: createdItem.publicId,
              title: createdItem.title,
              body: createdItem.body,
              hashtags: createdItem.hashtags,
            });
            await recordGenerationEvent(prisma, {
              companyId: cid,
              entityType: "KNOWLEDGE",
              entityId: createdItem.id,
              sourceEntityIds: batch.map((src) => src.id),
              promptName: "flashcard-generation",
              promptVersion: cleanDraft.promptVersion || "worker-runtime",
              modelName: cleanDraft.modelName || "local-worker",
              generatedTitle: cleanDraft.title,
              generatedBody: cleanDraft.body,
              selected: true,
              payload: {
                category: normalizedCategory,
                hashtags: cleanDraft.hashtags || [],
                confidence: cleanDraft.confidence,
              },
              teachingWeight: 45,
              cycleRunId: workerContext.cycleRunId,
            });

            // Link sources to Flashcard
            for (const src of batch) {
              await prisma.flashcardSource.create({
                data: {
                  flashcardId: createdItem.id,
                  sourceId: src.id,
                  sourceType: "SOURCE",
                  sourceName: src.entityTag || "Agent Research",
                  createdAt: await getServerTime(prisma)
                }
              }).catch(() => {});
            }
            await enforceFlashcardProcessingCeiling(prisma, createdItem.id);
            dbFlashcards.push(createdItem);
          }
        }
        if (isOpportunityBatch) {
          await markOpportunityBatchMined(prisma, batch, workerContext, { createdCount: drafts.length });
        }
      } else if (isOpportunityBatch) {
        await markOpportunityBatchMined(prisma, batch, workerContext, { createdCount: 0 });
      }
    } catch (err) {
      console.error(`[GENERATOR] Failed batch:`, err.message);
    }
  }

  // M4.3: Refine the whole batch of new Flashcards
  if (dbFlashcards.length > 1) {
    const { refined, suppressed } = await refineFlashcardBatch(prisma, company, dbFlashcards, memoryPrompt);
    for (const r of refined) {
      await prisma.flashcard.update({
        where: { id: r.id },
        data: buildFlashcardRefineUpdatePayload(r),
      });
      await enforceFlashcardProcessingCeiling(prisma, r.id);
    }
    for (const s of suppressed) {
      await prisma.flashcard.update({
        where: { id: s.id },
        data: buildFlashcardRefineUpdatePayload(s),
      });
    }
    console.log(`[GENERATOR] ${company.name}: Refined ${dbFlashcards.length} → ${refined.length} flashcards.`);
  }

  return dbFlashcards.length;
}

async function performCompanyJudging(prisma, company, memoryPrompt, topic, workerContext) {
  const { validateTenant, getServerTime } = require("./shared");
  validateTenant(company.id);

  let ops = 0;
  const pending = await prisma.flashcard.findMany({
    where: { companyId: company.id, processingStatus: "CHECKED" },
    orderBy: { updatedAt: "asc" },
    take: 5
  });

  for (const fc of pending) {
    try {
      const audit = await auditCheckedFlashCard(prisma, fc, memoryPrompt, topic, null, workerContext);
      if (audit) {
        await prisma.$transaction(async (tx) => {
          const reconciledAt = await getServerTime(prisma);
          await tx.flashcard.update({
            where: { id: fc.id, processingStatus: "CHECKED" },
            data: buildFlashcardJudgeUpdatePayload(audit, reconciledAt),
          });
          await tx.flashcardAction.create({
            data: { flashcardId: fc.id, action: "ANNOTATE", annotation: audit.userAnnotation, actedBy: workerContext.workerId }
          });
        });
        await recordOutcomeEvent(prisma, {
          companyId: company.id,
          actorType: "AI",
          actorId: workerContext.workerId,
          entityType: "KNOWLEDGE",
          entityId: fc.id,
          outcomeType: "JUDGE_REVIEW_RESULT",
          outcomeValue: audit.processingStatus || "UPDATED",
          annotation: audit.userAnnotation || undefined,
          beforeState: {
            processingStatus: fc.processingStatus,
            activityState: fc.activityState,
          },
          afterState: {
            processingStatus: audit.processingStatus,
            activityState: audit.activityState,
          },
          teachingWeight: 40,
          cycleRunId: workerContext.cycleRunId,
        });
        await enforceFlashcardProcessingCeiling(prisma, fc.id);
        ops++;
      }
    } catch (err) {
      console.error(`[JUDGE] Failed fc:${fc.id}:`, err.message);
    }
  }
  return ops;
}

function buildTaskUpdatePayload(candidate) {
  const description = candidate?.description ?? candidate?.body ?? null;
  return {
    title: candidate?.title,
    description,
    kind: candidate?.kind,
    impact: candidate?.impact,
    confidence: candidate?.confidence,
    confidenceScore: candidate?.confidenceScore,
    ease: candidate?.ease,
    iceScore: candidate?.iceScore,
    scoreProfile: candidate?.scoreProfile ?? undefined,
    hashtags: Array.isArray(candidate?.hashtags) ? candidate.hashtags : undefined,
    processingStatus: candidate?.processingStatus,
    activityState: candidate?.activityState,
    status: candidate?.status,
    candidateState: candidate?.candidateState,
    reworkRoute: candidate?.reworkRoute ?? null,
    qualityScore: candidate?.qualityScore ?? null,
    urgencyScore: candidate?.urgencyScore ?? null,
    freshnessScore: candidate?.freshnessScore ?? null,
    feedbackScore: candidate?.feedbackScore ?? 0,
    evaluationReason: candidate?.evaluationReason ?? null,
    fingerprint: candidate?.fingerprint,
    sourceFlashcardIds: Array.isArray(candidate?.sourceFlashcardIds) ? candidate.sourceFlashcardIds : undefined,
    generatedFromIds: Array.isArray(candidate?.generatedFromIds) ? candidate.generatedFromIds : undefined,
    versionFamilyId: candidate?.versionFamilyId ?? null,
    duplicateClusterId: candidate?.duplicateClusterId ?? null,
    refinedFromId: candidate?.refinedFromId ?? null,
    kanbanColumn: candidate?.kanbanColumn,
    sortOrder: candidate?.sortOrder,
  };
}

function buildFlashcardRefineUpdatePayload(candidate) {
  return {
    title: candidate?.title,
    body: candidate?.body ?? candidate?.description ?? undefined,
    confidence: candidate?.confidence,
    impact: candidate?.impact,
    weight: candidate?.weight,
    processingStatus: candidate?.processingStatus,
    activityState: candidate?.activityState,
    status: candidate?.status,
    reviewStatus: candidate?.reviewStatus,
    userAnnotation: candidate?.userAnnotation ?? null,
    hashtags: Array.isArray(candidate?.hashtags) ? candidate.hashtags : undefined,
    evidence: candidate?.evidence ?? undefined,
    citationSnapshotIds: Array.isArray(candidate?.citationSnapshotIds)
      ? candidate.citationSnapshotIds
      : undefined,
    conflictDetected: candidate?.conflictDetected,
    conflictSummary: candidate?.conflictSummary ?? null,
    feedbackConfidenceDelta: candidate?.feedbackConfidenceDelta,
    feedbackWeightDelta: candidate?.feedbackWeightDelta,
    fingerprint: candidate?.fingerprint,
    kind: candidate?.kind,
    appVersion: candidate?.appVersion,
    brainVersion: candidate?.brainVersion,
    generatedAt: candidate?.generatedAt ?? null,
    promptVersion: candidate?.promptVersion,
    promptHash: candidate?.promptHash ?? null,
    promptName: candidate?.promptName,
    modelName: candidate?.modelName,
    modelVersion: candidate?.modelVersion ?? null,
    temperature: candidate?.temperature ?? null,
    createdByRunId: candidate?.createdByRunId ?? null,
    cycleRunId: candidate?.cycleRunId ?? null,
    intelligenceType: candidate?.intelligenceType,
    lastAuditedAt: candidate?.lastAuditedAt ?? null,
    lastRescoredAt: candidate?.lastRescoredAt ?? null,
    lastTaxonomyAuditedAt: candidate?.lastTaxonomyAuditedAt ?? null,
    lastCorrectionReconciledAt: candidate?.lastCorrectionReconciledAt ?? null,
    iceScore: candidate?.iceScore,
    scoreProfile: candidate?.scoreProfile ?? undefined,
    versionFamilyId: candidate?.versionFamilyId ?? null,
    duplicateClusterId: candidate?.duplicateClusterId ?? null,
    generatedFromIds: Array.isArray(candidate?.generatedFromIds)
      ? candidate.generatedFromIds
      : undefined,
    refinedFromId: candidate?.refinedFromId ?? null,
    refreshedAt: candidate?.refreshedAt ?? undefined,
    generatedTitle: candidate?.generatedTitle ?? null,
    generatedBody: candidate?.generatedBody ?? null,
    lastActionAt: candidate?.lastActionAt ?? null,
    manualBody: candidate?.manualBody ?? null,
    manualTitle: candidate?.manualTitle ?? null,
    hashtagMaintainedAt: candidate?.hashtagMaintainedAt ?? null,
    hashtagEvaluationPending: candidate?.hashtagEvaluationPending,
    lastHashtagError: candidate?.lastHashtagError ?? null,
  };
}

function buildFlashcardJudgeUpdatePayload(audit, reconciledAt) {
  return {
    processingStatus: audit?.processingStatus,
    reviewStatus: audit?.reviewStatus,
    confidenceScore: audit?.confidenceScore,
    evidence: audit?.evidence ?? undefined,
    userAnnotation: audit?.userAnnotation ?? null,
    promptName: audit?.promptName ?? undefined,
    promptVersion: audit?.promptVersion ?? undefined,
    modelName: audit?.modelName ?? undefined,
    temperature: audit?.temperature ?? undefined,
    lastAuditedAt: audit?.lastAuditedAt ?? reconciledAt,
    updatedAt: reconciledAt,
    lastCorrectionReconciledAt: reconciledAt,
  };
}

async function buildTaskCreatePayload(prisma, candidate, overrides = {}) {
  const serverTime = overrides.createdAt ?? await getServerTime(prisma);
  return {
    companyId: candidate?.companyId,
    publicId: candidate?.publicId ?? undefined,
    title: candidate?.title,
    description: candidate?.description ?? candidate?.body ?? null,
    kind: candidate?.kind,
    impact: candidate?.impact,
    confidence: candidate?.confidence,
    confidenceScore: candidate?.confidenceScore,
    ease: candidate?.ease,
    iceScore: candidate?.iceScore,
    processingStatus: candidate?.processingStatus,
    activityState: candidate?.activityState,
    status: candidate?.status,
    candidateState: candidate?.candidateState,
    reworkRoute: candidate?.reworkRoute ?? null,
    qualityScore: candidate?.qualityScore ?? null,
    urgencyScore: candidate?.urgencyScore ?? null,
    freshnessScore: candidate?.freshnessScore ?? null,
    feedbackScore: candidate?.feedbackScore ?? 0,
    evaluationReason: candidate?.evaluationReason ?? null,
    scoreProfile: candidate?.scoreProfile ?? undefined,
    hashtags: Array.isArray(candidate?.hashtags) ? candidate.hashtags : [],
    fingerprint: candidate?.fingerprint ?? undefined,
    sourceFlashcardIds: Array.isArray(candidate?.sourceFlashcardIds) ? candidate.sourceFlashcardIds : [],
    generatedFromIds: Array.isArray(candidate?.generatedFromIds) ? candidate.generatedFromIds : [],
    versionFamilyId: candidate?.versionFamilyId ?? null,
    duplicateClusterId: candidate?.duplicateClusterId ?? null,
    refinedFromId: candidate?.refinedFromId ?? null,
    kanbanColumn: candidate?.kanbanColumn,
    sortOrder: candidate?.sortOrder,
    createdBy: candidate?.createdBy ?? "generator-agent",
    createdByRunId: overrides.createdByRunId ?? candidate?.createdByRunId ?? undefined,
    cycleRunId: overrides.cycleRunId ?? candidate?.cycleRunId ?? undefined,
    createdAt: serverTime,
  };
}

/**
 * M4.3: Knowledge-to-Action Pipeline
 * Converts VERIFIED Flashcards (Knowledge) into executable TaskCards (Action).
 * Uses Drafter (Generator), Refiner, and Evaluator pipeline.
 */
async function performCompanyActionGeneration(prisma, company, memoryPrompt, topic, workerContext) {
  const { validateTenant, getServerTime } = require("./shared");
  validateTenant(company.id);

  let ops = 0;
  const cid = company.id;
  const orbitLimit = await getWorkerConfig(prisma, company, "batch_limit", 5);
  const inventory = await loadCompanyPlannerInventory(prisma, cid);
  const taskNoveltyInventory = await prisma.checklistTask.findMany({
    where: {
      companyId: cid,
      activityState: { in: ["ACTIVE", "STALE"] },
      status: { notIn: ["ARCHIVED", "COMPLETED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 150,
    select: { id: true, publicId: true, title: true, description: true, hashtags: true },
  });
  const feedbackPressureIndex = await readFeedbackPressureIndex(prisma);

  // 1. Find active Flashcards that haven't spawned actions recently.
  // Bootstrap mode may need to generate from CHECKED/DRAFT inventory as well.
  const knowledgeBase = await prisma.flashcard.findMany({
    where: { 
      companyId: cid, 
      processingStatus: { in: ["VERIFIED", "CHECKED", "DRAFT", "ACCEPTED"] },
      activityState: { in: ["ACTIVE", "STALE"] },
    },
    orderBy: [
      { lastActionAt: "asc" },
      { updatedAt: "asc" },
    ],
    take: orbitLimit * 2,
  });

  if (knowledgeBase.length === 0) return 0;

  // M3.1: Bottleneck Guard (§14.2)
  // Ensure we don't overwhelm the user or VRAM by generating beyond the 100-card active limit.
  const activeCount = await prisma.checklistTask.count({
    where: { 
      companyId: cid, 
      activityState: { in: ["ACTIVE", "STALE"] },
      processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] }
    }
  });

  if (activeCount >= 100) {
    console.log(`[BOTTLENECK] ${company.name}: Task inventory at limit (${activeCount}/100). Pausing generation.`);
    return 0;
  }

  const rankedKnowledgeBase = knowledgeBase.slice().sort((left, right) => {
    const statusDelta =
      (PROCESSING_STATUS_ORDER[String(right.processingStatus || "DRAFT").toUpperCase()] ?? 0) -
      (PROCESSING_STATUS_ORDER[String(left.processingStatus || "DRAFT").toUpperCase()] ?? 0);
    if (statusDelta !== 0) return statusDelta;
    const iceDelta = Number(right.iceScore || 0) - Number(left.iceScore || 0);
    if (iceDelta !== 0) return iceDelta;
    return new Date(left.lastActionAt || left.updatedAt || left.createdAt || 0) - new Date(right.lastActionAt || right.updatedAt || right.createdAt || 0);
  });
  const taskOpportunityCounts = await loadTaskOpportunityTaskCounts(prisma, cid, rankedKnowledgeBase);
  const eligibleKnowledgeBase = rankedKnowledgeBase
    .map((flashcard) => ({
      ...flashcard,
      _taskOpportunityCount: taskOpportunityCounts.get(flashcard.id) || 0,
      _feedbackPressure: getPressureForFamilyKeys(feedbackPressureIndex, [`flashcard:${flashcard.id}`]),
      _feedbackBlocked: isAnyFamilyBlocked(feedbackPressureIndex, [`flashcard:${flashcard.id}`]),
    }))
    .filter((flashcard) => !flashcard._feedbackBlocked)
    .filter((flashcard) => (
      flashcard._taskOpportunityCount === 0
      || isOlderThanDays(flashcard.lastActionAt || flashcard.updatedAt || flashcard.createdAt, TASK_OPPORTUNITY_REVISIT_DAYS)
    ))
    .sort((left, right) => {
      const pressureDelta = Number(right._feedbackPressure || 0) - Number(left._feedbackPressure || 0);
      if (pressureDelta !== 0) return pressureDelta;
      const taskCountDelta = (left._taskOpportunityCount || 0) - (right._taskOpportunityCount || 0);
      if (taskCountDelta !== 0) return taskCountDelta;
      const statusDelta =
        (PROCESSING_STATUS_ORDER[String(right.processingStatus || "DRAFT").toUpperCase()] ?? 0) -
        (PROCESSING_STATUS_ORDER[String(left.processingStatus || "DRAFT").toUpperCase()] ?? 0);
      if (statusDelta !== 0) return statusDelta;
      const iceDelta = Number(right.iceScore || 0) - Number(left.iceScore || 0);
      if (iceDelta !== 0) return iceDelta;
      return new Date(left.lastActionAt || left.updatedAt || left.createdAt || 0) - new Date(right.lastActionAt || right.updatedAt || right.createdAt || 0);
    });

  if (eligibleKnowledgeBase.length > 0) {
    await recordPlannerTelemetry(prisma, {
      companyId: cid,
      entityType: "FLASHCARD",
      entityId: eligibleKnowledgeBase[0].id,
      eventType: "OPPORTUNITY_MINING_RUN",
      reason: "Flashcards with low downstream task yield or stale action timing were selected for renewed task opportunity mining.",
      details: {
        flashcardIds: eligibleKnowledgeBase.slice(0, orbitLimit).map((flashcard) => flashcard.id),
        revisitDays: TASK_OPPORTUNITY_REVISIT_DAYS,
      },
    });
  }
  const blockedFlashcards = rankedKnowledgeBase.filter((flashcard) =>
    isAnyFamilyBlocked(feedbackPressureIndex, [`flashcard:${flashcard.id}`]),
  );
  for (const flashcard of blockedFlashcards.slice(0, 10)) {
    await recordPlannerTelemetry(prisma, {
      companyId: cid,
      entityType: "FLASHCARD",
      entityId: flashcard.id,
      eventType: "FEEDBACK_PRESSURE_SKIP",
      reason: "Flashcard task generation is blocked by repeated negative feedback on its downstream family.",
      details: {
        familyKeys: [`flashcard:${flashcard.id}`],
      },
    });
  }

  console.log(`[ACTION] ${company.name}: Found ${eligibleKnowledgeBase.length} active Flashcards to mine for actions`);

  for (const fc of eligibleKnowledgeBase.slice(0, orbitLimit)) {
    try {
      const taskStatusCeiling = getStatusCeilingFromValues([fc.processingStatus]);
      const linkedSources = await loadBatchLinkedSources(prisma, [fc.id]);
      const { context: researchContext } = await buildGenerationResearchContext(prisma, company, {
        operation: "TASK_CREATE",
        entityType: "FLASHCARD",
        entityId: fc.id,
        inventory,
        entity: fc,
        sources: linkedSources,
        flashcards: [fc],
      });
      // Step 1: GENERATE (M2.1 Drafter)
      const generatedCandidates = await withPlannerStageTimeout(
        prisma,
        company,
        `${company.name}:task_generation_from_flashcard:${fc.id}`,
        () => draftTaskcardFromFlashCard(prisma, company, fc, memoryPrompt, topic, { researchContext }),
        { stage: "task_generation_from_flashcard", flashcardId: fc.id },
      );
      if (!generatedCandidates || generatedCandidates.length === 0) continue;
      const publishableCandidates = [];
      for (const draft of generatedCandidates) {
        const editorialDraft = await applyEditorialGate(prisma, company, {
          entityType: "TASK",
          entityId: draft.id,
          candidate: draft,
          bodyLimit: 1200,
        });
        const novelty = await applyNoveltyGate(prisma, company, {
          entityType: "TASK",
          entityId: editorialDraft.id,
          candidate: {
            title: editorialDraft.title,
            description: editorialDraft.description ?? editorialDraft.body,
            hashtags: editorialDraft.hashtags,
          },
          inventory: taskNoveltyInventory,
        });
        if (!novelty.shouldPublish) continue;
        if (editorialDraft.scoreProfile && typeof editorialDraft.scoreProfile === "object") {
          editorialDraft.scoreProfile = {
            ...editorialDraft.scoreProfile,
            rationale: {
              ...(editorialDraft.scoreProfile.rationale || {}),
              noveltyScore: novelty.noveltyScore,
              maxSimilarity: novelty.maxSimilarity,
              noveltyClusterId: novelty.noveltyClusterId,
              noveltyClosestMatch: novelty.closestMatch,
              editorialGate: editorialDraft.editorialGate,
            },
          };
        }
        publishableCandidates.push(editorialDraft);
      }
      if (publishableCandidates.length === 0) continue;

      // Ensure fingerprint and other default fields for generated candidates
      const dbCandidates = await Promise.all(publishableCandidates.map(async draft => {
        const lifecycleCeiling = buildTaskLifecycleCeiling(taskStatusCeiling);
        const createData = await buildTaskCreatePayload(prisma, {
          ...draft,
          processingStatus: lifecycleCeiling.processingStatus,
          candidateState: lifecycleCeiling.candidateState,
          activityState: lifecycleCeiling.activityState,
        }, {
          cycleRunId: workerContext.cycleRunId,
        });
        const created = await prisma.checklistTask.create({
          data: createData,
        });
        await recordGenerationEvent(prisma, {
          companyId: cid,
          entityType: "TASK",
          entityId: created.id,
          sourceEntityIds: [fc.id],
          promptName: "action-generation",
          promptVersion: draft.promptVersion || "worker-runtime",
          modelName: draft.modelName || "local-worker",
          generatedTitle: draft.title,
          generatedBody: draft.description || draft.body,
          selected: true,
          payload: {
            fromFlashcardId: fc.id,
            iceScore: draft.iceScore,
            impact: draft.impact,
            confidenceScore: draft.confidenceScore,
            ease: draft.ease,
          },
          teachingWeight: 50,
          cycleRunId: workerContext.cycleRunId,
        });
        taskNoveltyInventory.unshift({
          id: created.id,
          publicId: created.publicId,
          title: created.title,
          description: created.description,
          hashtags: created.hashtags,
        });
        return created;
      }));

      // Step 2: REFINE (M2.2 Refiner)
      const { refined, suppressed, spawned = [] } = await refineNBAItemBatch(prisma, company, dbCandidates, memoryPrompt);

      for (const r of refined) {
        await prisma.checklistTask.update({ where: { id: r.id }, data: buildTaskUpdatePayload(r) });
        await enforceTaskProcessingCeiling(prisma, r.id);
      }
      for (const s of suppressed) {
        await prisma.checklistTask.update({ where: { id: s.id }, data: buildTaskUpdatePayload(s) });
      }
      const createdSpawned = [];
      for (const item of spawned) {
        const created = await prisma.checklistTask.create({
          data: await buildTaskCreatePayload(prisma, item),
        });
        await enforceTaskProcessingCeiling(prisma, created.id);
        createdSpawned.push(created);
      }

      // Step 3: EVALUATE (M2.3 Evaluator)
      if (refined.length > 0 || createdSpawned.length > 0) {
        await evaluateNBAItemBatch(prisma, company, [...refined, ...createdSpawned], memoryPrompt);
        for (const candidate of [...refined, ...createdSpawned]) {
          await enforceTaskProcessingCeiling(prisma, candidate.id);
        }
      }

      ops += dbCandidates.length + createdSpawned.length;

      // Touch the flashcard so we don't infinitely spawn from it
      await prisma.flashcard.update({
        where: { id: fc.id },
        data: { updatedAt: new Date(), lastActionAt: new Date() }
      });

    } catch (err) {
      console.error(`[ACTION] Failed generating from fc:${fc.id}:`, err.message);
    }
  }

  // M3.1: Candidate Backlog Sweeper
  await processCandidateBacklog(prisma, company, memoryPrompt);

  // M3.1: Immediate Frontier Re-alignment
  // Ensure that new (and potentially higher-scored) candidates are surfaced immediately.
  await recomputeFrontier(prisma, company, workerContext.cycleRunId);

  return ops;
}

/**
 * M3.1: Candidate Backlog Sweeper
 * Finds TaskCards that are stuck in GENERATED or REFINED states and pushes
 * them through the Refiner and Evaluator.
 */
async function processCandidateBacklog(prisma, company, memoryPrompt) {
  const cid = company.id;

  // 1. Process REFINED candidates that need EVALUATION
  const refined = await prisma.checklistTask.findMany({
    where: { 
      companyId: cid, 
      candidateState: CandidateState.REFINED,
      activityState: "ACTIVE"
    },
    orderBy: { updatedAt: "asc" },
    take: 10
  });

  if (refined.length > 0) {
    console.log(`[BACKLOG] ${company.name}: Found ${refined.length} REFINED items needing EVALUATION.`);
    await evaluateNBAItemBatch(prisma, company, refined, memoryPrompt);
  }

  // 2. Process GENERATED candidates that need REFINEMENT
  const generated = await prisma.checklistTask.findMany({
    where: { 
      companyId: cid, 
      candidateState: CandidateState.GENERATED,
      activityState: "ACTIVE"
    },
    orderBy: { updatedAt: "asc" },
    take: 10
  });

  if (generated.length > 0) {
    console.log(`[BACKLOG] ${company.name}: Found ${generated.length} GENERATED items needing REFINEMENT.`);
    const { refined: newRefined, suppressed, spawned = [] } = await refineNBAItemBatch(prisma, company, generated, memoryPrompt);
    
    for (const r of newRefined) await prisma.checklistTask.update({ where: { id: r.id }, data: buildTaskUpdatePayload(r) });
    for (const s of suppressed) await prisma.checklistTask.update({ where: { id: s.id }, data: buildTaskUpdatePayload(s) });
    const createdSpawned = [];
    for (const item of spawned) {
      const created = await prisma.checklistTask.create({
        data: await buildTaskCreatePayload(prisma, item),
      });
      createdSpawned.push(created);
    }
    
    if (newRefined.length > 0 || createdSpawned.length > 0) {
      await evaluateNBAItemBatch(prisma, company, [...newRefined, ...createdSpawned], memoryPrompt);
    }
  }
}

module.exports = {
  runSynthesisCycle,
  runCompanyPlannerCycle,
  loadCompanyPlannerInventory,
  performCompanyWriting,
  performCompanyScrubbing,
  performCompanyJudging,
  performCompanyActionGeneration,
  getSynthesisProgress,
  collectGlobalWorkerSettings,
  updateProgress,
  synthesisState
};
