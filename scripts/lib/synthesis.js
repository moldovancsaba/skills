const { getHumanMemoryPrompt } = require("./memory");
const { draftFlashcardFromDataCard, draftFlashcardsFromEvidenceBatch, draftTaskcardFromFlashCard } = require("./drafter");
const { refineDraftFlashCard, refineDraftTaskCard } = require("./writer");
const { auditCheckedFlashCard, auditCheckedTaskCard } = require("./judge");
const { getWorkerConfig, validateTenant, getServerTime, logTelemetry } = require("./shared");
const { runMaintenance, processUserFeedback, scrubDatabaseElemental } = require("./maintenance");
const { updateCompanyMemory } = require("./memory");
const { enforceLanguagePolicy } = require("./language-validator");
const { OLLAMA_MODEL, STAGE_MODELS } = require("./core");
const { generateStrategicKeywords, performResearchHarvest } = require("./research");
const { ingestEvidenceUnit, selectEvidenceForGeneration, buildEvidenceBatches } = require("./evidence");
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

    const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
    batchContext.push({ company, memoryPrompt, lockCtx, lockId: lockCtx.cycleRunId, ops: 0 });
    await prisma.company.update({ where: { id: company.id }, data: { lastAIVisited: new Date() } });
  }

  const STAGES = [
    { name: "SCRUBBING", handler: performCompanyScrubbing },
    { name: "WRITING",   handler: performCompanyWriting },
    { name: "JUDGING",   handler: performCompanyJudging }
  ];

  for (const stage of STAGES) {
    for (const ctx of batchContext) await renewLock(prisma, ctx.company.id, ctx.lockCtx);
    await updateProgress(prisma, { stage: stage.name });

    for (const ctx of batchContext) {
      const ops = await stage.handler(prisma, ctx.company, ctx.memoryPrompt, null, { 
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

  let ops = 0;
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
          const fingerprint = generateFingerprint({
            companyId: cid,
            entityId: batch.map(b => b.id).join(","),
            stage: "WRITING",
            input: draft.title
          });

          await prisma.$transaction(async (tx) => {
            const { sourceId, sourceType, ...cleanDraft } = draft;

            const fc = await tx.flashcard.create({
              data: {
                ...cleanDraft,
                companyId: cid,
                processingStatus: "DRAFT",
                cycleRunId: workerContext.cycleRunId,
                createdByRunId: workerContext.cycleRunId,
                fingerprint: draft.fingerprint || fingerprint,
                createdAt: await getServerTime(prisma)
              }
            });

            // Link all evidence sources in the batch (supports many→1)
            for (const src of batch) {
              await tx.flashcardSource.create({
                data: {
                  flashcardId: fc.id,
                  sourceId: src.id,
                  sourceType: "SOURCE",
                  sourceName: src.entityTag || "Agent Research",
                  createdAt: await getServerTime(prisma)
                }
              }).catch(() => {}); // ignore duplicate link errors
            }
          });
          ops++;
        }
      }
    } catch (err) {
      console.error(`[GENERATOR] Failed batch:`, err.message);
    }
  }
  return ops;
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

module.exports = {
  runSynthesisCycle,
  performCompanyWriting,
  performCompanyScrubbing,
  performCompanyJudging,
  getSynthesisProgress,
  collectGlobalWorkerSettings,
  updateProgress,
  synthesisState
};
