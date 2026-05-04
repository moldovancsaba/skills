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
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

/**
 * trinity ENGINE
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

async function collectGlobalWorkerSettings(prisma) {
  return {
    supervisorContractVersion: 2,
    schedulingMode: "company-serial-cycle"
  };
}

async function updateProgress(prisma, updates = {}) {
  Object.assign(synthesisState, updates, { lastProgressAt: new Date().toISOString() });
  try {
    const settings = await collectGlobalWorkerSettings(prisma);
    await prisma.globalSetting.upsert({
      where: { key: "core_synthesis_progress" },
      create: { key: "core_synthesis_progress", value: { ...synthesisState, settings } },
      update: { value: { ...synthesisState, settings }, updatedAt: new Date() }
    });
  } catch (e) {
    console.error("[PROGRESS] Sync failed:", e.message);
  }
}

async function acquireLock(prisma, companyId, attempt = 1) {
  const { isUniqueConstraintError, getServerTime } = require("./shared");
  const key = `lock:company:${companyId}`;
  const now = await getServerTime(prisma);
  const ownerId = `trinity-worker:${process.pid}`;
  
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
      // M4.1: Refresh memory prompt with stage-specific lessons
      const stagePrompt = await getStagedMemoryPrompt(prisma, ctx.company, stage.name);
      
      const ops = await stage.handler(prisma, ctx.company, stagePrompt, null, { 
        cycleRunId: ctx.lockId, 
        workerId: `trinity-worker:${process.pid}` 
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
            createdItem = await prisma.goalcard.create({
              data: {
                ...cleanDraft,
                companyId: cid,
                processingStatus: "DRAFT",
                cycleRunId: workerContext.cycleRunId,
                createdAt: await getServerTime(prisma)
              }
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
            createdItem = await prisma.nBAItem.create({
              data: {
                companyId: cid,
                title: cleanDraft.title,
                description: cleanDraft.body,
                status: "PENDING",
                confidence: cleanDraft.confidence,
                confidenceScore: cleanDraft.confidence,
                impact: cleanDraft.impact,
                ease: cleanDraft.weight,
                iceScore: cleanDraft.iceScore,
                hashtags: cleanDraft.hashtags,
                cycleRunId: workerContext.cycleRunId,
                generatedFromIds: sourceIds,
                candidateState: "GENERATED",
              }
            });
          } else {
            // Default: FLASHCARD
            createdItem = await prisma.flashcard.create({
              data: {
                ...cleanDraft,
                companyId: cid,
                processingStatus: "DRAFT",
                candidateState: CandidateState.GENERATED,
                cycleRunId: workerContext.cycleRunId,
                createdByRunId: workerContext.cycleRunId,
                createdAt: await getServerTime(prisma)
              }
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
    take: 5
  });

  for (const fc of pending) {
    try {
      const audit = await auditCheckedFlashCard(prisma, fc, memoryPrompt, topic, null, workerContext);
      if (audit) {
        await prisma.$transaction(async (tx) => {
          await tx.flashcard.update({ 
            where: { id: fc.id, processingStatus: "CHECKED" }, 
            data: { ...audit, cycleRunId: workerContext.cycleRunId, updatedAt: await getServerTime(prisma) } 
          });
          await tx.flashcardAction.create({
            data: { flashcardId: fc.id, action: "ANNOTATE", annotation: audit.userAnnotation, actedBy: workerContext.workerId }
          });
        });
        ops++;
      }
    } catch (err) {
      console.error(`[JUDGE] Failed fc:${fc.id}:`, err.message);
    }
  }
  return ops;
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

  // 1. Find VERIFIED Flashcards that haven't spawned actions recently
  const knowledgeBase = await prisma.flashcard.findMany({
    where: { 
      companyId: cid, 
      processingStatus: "VERIFIED",
      activityState: "ACTIVE",
      intelligenceType: "INTERNAL"
    },
    orderBy: { updatedAt: "desc" },
    take: orbitLimit
  });

  if (knowledgeBase.length === 0) return 0;

  // M3.1: Bottleneck Guard (§14.2)
  // Ensure we don't overwhelm the user or VRAM by generating beyond the 100-card active limit.
  const activeCount = await prisma.nBAItem.count({
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

  console.log(`[ACTION] ${company.name}: Found ${knowledgeBase.length} VERIFIED Flashcards to mine for actions`);

  for (const fc of knowledgeBase) {
    try {
      // Step 1: GENERATE (M2.1 Drafter)
      const generatedCandidates = await draftTaskcardFromFlashCard(prisma, company, fc, memoryPrompt, topic);
      if (!generatedCandidates || generatedCandidates.length === 0) continue;

      // Ensure fingerprint and other default fields for generated candidates
      const dbCandidates = await Promise.all(generatedCandidates.map(async draft => {
        return await prisma.nBAItem.create({
          data: {
            ...draft,
            cycleRunId: workerContext.cycleRunId,
            createdAt: await getServerTime(prisma)
          }
        });
      }));

      // Step 2: REFINE (M2.2 Refiner)
      const { refined, suppressed } = await refineNBAItemBatch(prisma, company, dbCandidates, memoryPrompt);

      for (const r of refined) {
        await prisma.nBAItem.update({ where: { id: r.id }, data: r });
      }
      for (const s of suppressed) {
        await prisma.nBAItem.update({ where: { id: s.id }, data: s });
      }

      // Step 3: EVALUATE (M2.3 Evaluator)
      if (refined.length > 0) {
        await evaluateNBAItemBatch(prisma, company, refined, memoryPrompt);
      }

      ops += dbCandidates.length;

      // Touch the flashcard so we don't infinitely spawn from it
      await prisma.flashcard.update({
        where: { id: fc.id },
        data: { updatedAt: new Date() }
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
  const refined = await prisma.nBAItem.findMany({
    where: { 
      companyId: cid, 
      candidateState: CandidateState.REFINED,
      activityState: "ACTIVE"
    },
    take: 10
  });

  if (refined.length > 0) {
    console.log(`[BACKLOG] ${company.name}: Found ${refined.length} REFINED items needing EVALUATION.`);
    await evaluateNBAItemBatch(prisma, company, refined, memoryPrompt);
  }

  // 2. Process GENERATED candidates that need REFINEMENT
  const generated = await prisma.nBAItem.findMany({
    where: { 
      companyId: cid, 
      candidateState: CandidateState.GENERATED,
      activityState: "ACTIVE"
    },
    take: 10
  });

  if (generated.length > 0) {
    console.log(`[BACKLOG] ${company.name}: Found ${generated.length} GENERATED items needing REFINEMENT.`);
    const { refined: newRefined, suppressed } = await refineNBAItemBatch(prisma, company, generated, memoryPrompt);
    
    for (const r of newRefined) await prisma.nBAItem.update({ where: { id: r.id }, data: r });
    for (const s of suppressed) await prisma.nBAItem.update({ where: { id: s.id }, data: s });
    
    if (newRefined.length > 0) {
      await evaluateNBAItemBatch(prisma, company, newRefined, memoryPrompt);
    }
  }
}

module.exports = {
  runSynthesisCycle,
  performCompanyWriting,
  performCompanyScrubbing,
  performCompanyJudging,
  performCompanyActionGeneration,
  getSynthesisProgress,
  collectGlobalWorkerSettings,
  updateProgress,
  synthesisState
};
