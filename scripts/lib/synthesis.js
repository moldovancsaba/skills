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
  GENERATION_TIMEOUT_MS,
  getCompanyOperatingMode,
} = require("../../src/lib/planner-contract");
const {
  getWeakestProcessingStatus,
  deriveSourceProcessingStatus,
} = require("../../src/lib/source-contract");

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

async function withPlannerStageTimeout(label, operation, timeoutMs = GENERATION_TIMEOUT_MS) {
  let timeoutHandle = null;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`[PLANNER_TIMEOUT] ${label} exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

const PROCESSING_STATUS_ORDER = Object.freeze({
  DRAFT: 0,
  CHECKED: 1,
  VERIFIED: 2,
  ACCEPTED: 2,
});

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
    select: { id: true, processingStatus: true },
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
      `${company.name}:bootstrap_flashcard_generation`,
      () => performCompanyWriting(prisma, company, memoryPrompt, topic, workerContext),
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    ops += await withPlannerStageTimeout(
      `${company.name}:bootstrap_flashcard_judging`,
      () => performCompanyJudging(prisma, company, memoryPrompt, topic, workerContext),
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
        `${company.name}:research_backfill_flashcard_generation`,
        () => performCompanyWriting(prisma, company, memoryPrompt, topic, workerContext),
      ).catch((error) => {
        console.warn(error.message);
        return 0;
      });
      ops += await withPlannerStageTimeout(
        `${company.name}:research_backfill_flashcard_judging`,
        () => performCompanyJudging(prisma, company, memoryPrompt, topic, workerContext),
      ).catch((error) => {
        console.warn(error.message);
        return 0;
      });
      inventory = await loadCompanyPlannerInventory(prisma, company.id);
    }
  }

  if (inventory.deficits.length > 0) {
    ops += await withPlannerStageTimeout(
      `${company.name}:lane_deficit_task_generation`,
      () => performCompanyActionGeneration(prisma, company, memoryPrompt, topic, workerContext),
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    inventory = await loadCompanyPlannerInventory(prisma, company.id);
  }

  if (inventory.deficits.length > 0 && inventory.flashcardCount < PLANNER_MIN_FLASHCARDS) {
    ops += await withPlannerStageTimeout(
      `${company.name}:lane_deficit_flashcard_generation`,
      () => performCompanyWriting(prisma, company, memoryPrompt, topic, workerContext),
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    ops += await withPlannerStageTimeout(
      `${company.name}:lane_deficit_flashcard_judging`,
      () => performCompanyJudging(prisma, company, memoryPrompt, topic, workerContext),
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    ops += await withPlannerStageTimeout(
      `${company.name}:lane_deficit_retry_task_generation`,
      () => performCompanyActionGeneration(prisma, company, memoryPrompt, topic, workerContext),
    ).catch((error) => {
      console.warn(error.message);
      return 0;
    });
    inventory = await loadCompanyPlannerInventory(prisma, company.id);
  }

  if (inventory.mode === "MAINTENANCE" && ops === 0) {
    ops += await withPlannerStageTimeout(
      `${company.name}:maintenance_task_generation`,
      () => performCompanyActionGeneration(prisma, company, memoryPrompt, topic, workerContext),
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
    schedulingMode: "pipeline-queue-aware"
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

  // M2.1: Build evidence batches for multi-cardinality synthesis
  const batches = buildEvidenceBatches(unprocessed, 3);
  console.log(`[GENERATOR] ${company.name}: ${unprocessed.length} unprocessed sources → ${batches.length} evidence batches`);

  for (const batch of batches.slice(0, orbitLimit)) {
    try {
      const drafts = await draftFlashcardsFromEvidenceBatch(prisma, company, batch, memoryPrompt, topic);
      if (drafts && drafts.length > 0) {
        for (const draft of drafts) {
          const { category, ...cleanDraft } = draft;
          let createdItem;

          if (category === "GOALCARD") {
            const normalizedScores = normalizeKnowledgeScores(cleanDraft);
            createdItem = await prisma.goalcard.create({
              data: {
                id: cleanDraft.id,
                publicId: cleanDraft.publicId,
                companyId: cid,
                title: cleanDraft.title,
                body: cleanDraft.body,
                confidence: normalizedScores.confidence,
                confidenceScore: normalizedScores.confidenceScore,
                impact: normalizedScores.impact,
                weight: normalizedScores.weight,
                iceScore: normalizedScores.iceScore,
                scoreProfile: cleanDraft.scoreProfile ?? undefined,
                processingStatus: "DRAFT",
                activityState: cleanDraft.activityState ?? "ACTIVE",
                createdBy: cleanDraft.createdBy ?? "generator-agent",
                refreshedAt: cleanDraft.refreshedAt ?? await getServerTime(prisma),
                hashtags: cleanDraft.hashtags ?? [],
                evidence: cleanDraft.evidence ?? undefined,
                fingerprint: cleanDraft.fingerprint ?? undefined,
                kind: cleanDraft.kind ?? "GOAL",
                intelligenceType: cleanDraft.intelligenceType ?? "INTERNAL",
                createdAt: await getServerTime(prisma)
              }
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
                category,
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
          } else if (category === "TASKCARD") {
            const sourceIds = batch.map(src => src.id);
            const normalizedScores = normalizeTaskScores({
              impact: cleanDraft.impact,
              confidence: cleanDraft.confidenceScore ?? cleanDraft.confidence,
              ease: cleanDraft.weight ?? cleanDraft.ease,
            });
            createdItem = await prisma.checklistTask.create({
              data: {
                companyId: cid,
                title: cleanDraft.title,
                description: cleanDraft.body,
                status: "PENDING",
                confidence: normalizedScores.confidence,
                confidenceScore: normalizedScores.confidenceScore,
                impact: normalizedScores.impact,
                ease: normalizedScores.ease,
                iceScore: normalizedScores.iceScore,
                hashtags: cleanDraft.hashtags,
                cycleRunId: workerContext.cycleRunId,
                generatedFromIds: sourceIds,
                candidateState: "GENERATED",
              }
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
                category,
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
            const normalizedScores = normalizeKnowledgeScores(cleanDraft);
            createdItem = await prisma.flashcard.create({
              data: {
                id: cleanDraft.id,
                publicId: cleanDraft.publicId,
                companyId: cid,
                title: cleanDraft.title,
                body: cleanDraft.body,
                confidence: normalizedScores.confidence,
                confidenceScore: normalizedScores.confidenceScore,
                impact: normalizedScores.impact,
                weight: normalizedScores.weight,
                iceScore: normalizedScores.iceScore,
                scoreProfile: cleanDraft.scoreProfile ?? undefined,
                processingStatus: "DRAFT",
                activityState: cleanDraft.activityState ?? "ACTIVE",
                status: cleanDraft.status ?? "ACTIVE",
                reviewStatus: cleanDraft.reviewStatus ?? "PENDING",
                createdBy: cleanDraft.createdBy ?? "generator-agent",
                refreshedAt: cleanDraft.refreshedAt ?? await getServerTime(prisma),
                hashtags: cleanDraft.hashtags ?? [],
                evidence: cleanDraft.evidence ?? undefined,
                citationSnapshotIds: cleanDraft.citationSnapshotIds ?? [],
                conflictDetected: cleanDraft.conflictDetected ?? false,
                conflictSummary: cleanDraft.conflictSummary ?? undefined,
                fingerprint: cleanDraft.fingerprint ?? undefined,
                kind: cleanDraft.kind ?? "SUMMARY",
                intelligenceType: cleanDraft.intelligenceType ?? "INTERNAL",
                generatedFromIds: cleanDraft.generatedFromIds ?? [],
                versionFamilyId: cleanDraft.versionFamilyId ?? undefined,
                cycleRunId: workerContext.cycleRunId,
                createdByRunId: workerContext.cycleRunId,
                createdAt: await getServerTime(prisma)
              }
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
                category: "FLASHCARD",
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
      }
    } catch (err) {
      console.error(`[GENERATOR] Failed batch:`, err.message);
    }
  }

  // M4.3: Refine the whole batch of new Flashcards
  if (dbFlashcards.length > 1) {
    const { refined, suppressed } = await refineFlashcardBatch(prisma, company, dbFlashcards, memoryPrompt);
    for (const r of refined) {
      await prisma.flashcard.update({ where: { id: r.id }, data: r });
      await enforceFlashcardProcessingCeiling(prisma, r.id);
    }
    for (const s of suppressed) {
      await prisma.flashcard.update({ where: { id: s.id }, data: s });
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
            data: {
              ...audit,
              cycleRunId: workerContext.cycleRunId,
              updatedAt: reconciledAt,
              lastCorrectionReconciledAt: reconciledAt,
            } 
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
    return new Date(left.lastActionAt || left.updatedAt || left.createdAt || 0) - new Date(right.lastActionAt || right.updatedAt || right.createdAt || 0);
  });

  console.log(`[ACTION] ${company.name}: Found ${rankedKnowledgeBase.length} active Flashcards to mine for actions`);

  for (const fc of rankedKnowledgeBase.slice(0, orbitLimit)) {
    try {
      const taskStatusCeiling = getStatusCeilingFromValues([fc.processingStatus]);
      // Step 1: GENERATE (M2.1 Drafter)
      const generatedCandidates = await withPlannerStageTimeout(
        `${company.name}:task_generation_from_flashcard:${fc.id}`,
        () => draftTaskcardFromFlashCard(prisma, company, fc, memoryPrompt, topic),
      );
      if (!generatedCandidates || generatedCandidates.length === 0) continue;

      // Ensure fingerprint and other default fields for generated candidates
      const dbCandidates = await Promise.all(generatedCandidates.map(async draft => {
        const lifecycleCeiling = buildTaskLifecycleCeiling(taskStatusCeiling);
        const created = await prisma.checklistTask.create({
          data: {
            ...draft,
            processingStatus: lifecycleCeiling.processingStatus,
            candidateState: lifecycleCeiling.candidateState,
            activityState: lifecycleCeiling.activityState,
            cycleRunId: workerContext.cycleRunId,
            createdAt: await getServerTime(prisma)
          }
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
        const created = await prisma.checklistTask.create({ data: item });
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
      const created = await prisma.checklistTask.create({ data: item });
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
