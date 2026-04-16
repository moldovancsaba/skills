const { getHumanMemoryPrompt } = require("./memory");
const { draftFlashcardFromDataCard, draftTaskcardFromFlashCard } = require("./drafter");
const { refineDraftFlashCard, refineDraftTaskCard } = require("./writer");
const { auditCheckedFlashCard, auditCheckedTaskCard } = require("./judge");
const { getWorkerConfig } = require("./shared");
const { runMaintenance } = require("./maintenance");
const { OLLAMA_MODEL } = require("./core");

/**
 * SOVEREIGN SYNTHESIS ENGINE
 * v0.11.4-STABLE
 * 
 * Implements round-robin orchestration (Orbiting) across all multi-tenant companies.
 * Ensures fair distribution of AI compute and prevents sequential starvation.
 */

// --- GLOBAL STATE ---
var synthesisState = {
  state: "idle",
  stage: "IDLE",
  pass: 0,
  lastProgressAt: new Date().toISOString(),
  currentCompany: null,
  cycleCount: 0
};

/**
 * Retrieves the current internal operational state of the synthesis engine.
 * Used primarily for health reporting and status dashboards.
 * 
 * @returns {object} Current synthesis state
 */
function getSynthesisProgress() {
  return synthesisState;
}

/**
 * Aggregates global worker configuration settings for reporting.
 * 
 * @param {PrismaClient} prisma - Database client instance
 * @returns {Promise<object>} Map of active worker settings
 */
async function collectGlobalWorkerSettings(prisma) {
  const pollIntervalSec = await getWorkerConfig(prisma, {}, "loop_interval_ms", 600000) / 1000;
  const ollamaTimeout = await getWorkerConfig(prisma, {}, "ollama_timeout_ms", 120000);

  return {
    supervisorContractVersion: 1,
    schedulingMode: "company-serial-cycle",
    companyCycleCooldownMs: pollIntervalSec * 1000,
    researchHarvestBatchSize: 1,
    ollamaTimeoutMs: ollamaTimeout,
    failsafeModel: `${OLLAMA_MODEL},llama3.2:3b`,
    failsafeTimeoutMs: 90000,
    failsafeMaxAttempts: 2,
    taskMinIceScore: await getWorkerConfig(prisma, {}, "task_min_ice", 50),
    flashcardMinConfidence: await getWorkerConfig(prisma, {}, "flashcard_min_confidence", 40),
    flashcardMinImpact: await getWorkerConfig(prisma, {}, "flashcard_min_impact", 40),
    flashcardMinWeight: await getWorkerConfig(prisma, {}, "flashcard_min_weight", 40),
    stuckRunningMs: 15 * 60 * 1000,
    noProgressMs: 180 * 60 * 1000,
    flashcardRevisitBatchSize: await getWorkerConfig(prisma, {}, "flashcard_revisit_batch_size", 1),
    taskRevisitBatchSize: await getWorkerConfig(prisma, {}, "task_revisit_batch_size", 1),
    feedbackReplayBatchSize: await getWorkerConfig(prisma, {}, "feedback_replay_batch_size", 1),
    hashtagMaintenanceBatchSize: await getWorkerConfig(prisma, {}, "hashtag_maintenance_batch_size", 1),
    cleanupBatchSize: await getWorkerConfig(prisma, {}, "cleanup_batch_size", 1),
    flashcardRevisitIntervalMinutes: await getWorkerConfig(prisma, {}, "flashcard_revisit_interval_minutes", 0),
    taskRevisitIntervalMinutes: await getWorkerConfig(prisma, {}, "task_revisit_interval_minutes", 0),
    feedbackReplayIntervalMinutes: await getWorkerConfig(prisma, {}, "feedback_replay_interval_minutes", 0),
    hashtagMaintenanceIntervalHours: await getWorkerConfig(prisma, {}, "hashtag_maintenance_interval_hours", 0),
    cleanupIntervalHours: await getWorkerConfig(prisma, {}, "cleanup_interval_hours", 0),
    factcheckMinCitations: await getWorkerConfig(prisma, {}, "factcheck_min_citations", 2),
    factcheckMinDomains: await getWorkerConfig(prisma, {}, "factcheck_min_domains", 2)
  };
}

/**
 * Persists the current synthesis state to the database global settings.
 * This acts as the Source of Truth for the cloud-based webapp (Vercel).
 */
async function syncSynthesisStateToDb(prisma) {
  try {
    if (!synthesisState) {
      console.warn("[WORKER] [SYNC] synthesisState not initialized, skipping DB sync...");
      return;
    }
    const settings = await collectGlobalWorkerSettings(prisma);
    const data = {
      state: synthesisState.state,
      stage: synthesisState.stage,
      pass: synthesisState.pass,
      lastProgressAt: synthesisState.lastProgressAt,
      currentCompany: synthesisState.currentCompany,
      cycleCount: synthesisState.cycleCount,
      timestamp: new Date().toISOString(),
      researchEnabled: process.env.CHECKLIST_RESEARCH_ENABLED === "true",
      settings
    };
    
    await prisma.globalSetting.upsert({
      where: { key: "core_synthesis_progress" },
      create: { key: "core_synthesis_progress", value: data },
      update: { value: data, updatedAt: new Date() }
    });
  } catch (err) {
    console.error(`[HEARTBEAT] Global sync failed:`, err.message);
  }
}
// --- CYCLING LOGIC ---

/**
 * Executes a global synthesis cycle across all companies in the database.
 * Uses a rotation-aware selection to ensure equitable distribution of AI attention.
 * 
 * @param {PrismaClient} prisma - Database client instance
 * @returns {Promise<{ workDone: boolean, operations: number }>} Result of the cycle
 */
async function runSynthesisCycle(prisma) {
  let totalOperations = 0;
  // Fair Rotation: Oldest last-visited company first
  // REMOVED [where: { updatedAt: { not: undefined } }] to avoid skipping newly created or un-updated companies
  const companies = await prisma.company.findMany({
    orderBy: { lastAIVisited: "asc" }
  });

  console.log(`[SYNTHESIS] FOUND ${companies.length} COMPANIES: ${companies.map(c => c.name).join(", ")}`);

  synthesisState.state = "running";
  synthesisState.stage = "SCHEDULING";
  synthesisState.pass = 0;
  synthesisState.lastProgressAt = new Date().toISOString();
  synthesisState.cycleCount++;

  const batchSize = await getWorkerConfig(prisma, {}, "batch_limit", 5);
  console.log(`[SYNTHESIS] Orbiting ${companies.length} companies (Batch Size: ${batchSize})...`);

  // Process a batch of companies to ensure fairness
  for (const company of companies.slice(0, batchSize)) {
    try {
      const ops = await processCompanySynthesis(prisma, company);
      totalOperations += ops;
    } catch (err) {
      console.error(`[ERROR] Synthesis failure for ${company.name}:`, err.message);
    }
  }

  synthesisState.state = "idle";
  synthesisState.stage = "IDLE";
  synthesisState.pass = 0;
  synthesisState.currentCompany = null;
  synthesisState.lastProgressAt = new Date().toISOString();

  return { 
    workDone: totalOperations > 0, 
    operations: totalOperations 
  };
}

/**
 * Performs a deep synthesis pass for a specific company.
 * Orchestrates Drafter -> Writer -> Judge pipeline across multiple passes.
 * 
 * @param {PrismaClient} prisma - Database client instance
 * @param {object} company - Company database record to synthesize
 * @returns {Promise<number>} Number of meaningful operations performed
 */
async function processCompanySynthesis(prisma, company) {
  let ops = 0;
  const cid = company.id;
  
  // 1. Worker Configuration
  const passes = await getWorkerConfig(prisma, company, "mini_loop_passes", 3);
  const orbitLimit = await getWorkerConfig(prisma, company, "batch_limit", 5);
  
  synthesisState.currentCompany = company.name;
  synthesisState.lastProgressAt = new Date().toISOString();

  console.log(`[SYNTHESIS] ${company.name}: Starting ${passes}-pass Mini-loop.`);

  for (let pass = 1; pass <= passes; pass++) {
    synthesisState.pass = pass;
    console.log(`[SYNTHESIS] ${company.name}: PASS ${pass}/${passes}`);
    
    // Step A: Teach Local Brain
    const memoryPrompt = await getHumanMemoryPrompt(prisma, company);

    // --- STAGE 0: Orbit Entrance ---
    await prisma.company.update({
      where: { id: cid },
      data: { lastAIVisited: new Date() }
    });
    synthesisState.stage = "ORBITING";
    console.log(`[SYNTHESIS] ${company.name}: Entering Orbit...`);

    // --- STAGE 1: DRAFTER (Sources & Files -> Flashcards) ---
    synthesisState.stage = "SCRUBBING";
    
    // Fetch both raw text sources and uploaded binary files
    const [rawSources, rawFiles] = await Promise.all([
      prisma.source.findMany({ where: { companyId: cid }, take: orbitLimit }),
      prisma.uploadedSourceFile.findMany({ where: { companyId: cid }, take: orbitLimit })
    ]);

      // Normalize into Unified DataCards
      const dataCards = [
        ...rawSources.map(s => ({ 
          id: s.id, 
          type: "SOURCE", 
          content: s.content, 
          name: "Source Snippet" 
        })),
        ...rawFiles.map(f => {
          // Robust Byte-to-Text conversion for binary files
          let safeContent = "";
          if (f.content) {
            try {
              safeContent = f.content.toString("utf8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
            } catch (e) {
              console.warn(`[WARN] Failed to stringify content for file ${f.id}, skipping content...`);
            }
          }
          return { 
            id: f.id, 
            type: "FILE", 
            content: safeContent, 
            name: f.name 
          };
        })
      ];

    console.log(`[SYNTHESIS] ${company.name}: Scrubbing ${dataCards.length} DataCards...`);
    
    for (const dc of dataCards) {
      synthesisState.lastProgressAt = new Date().toISOString();
      console.log(`[SYNTHESIS] [${dc.type}] Scrubbing: ${dc.name} (${dc.id})...`);
      
      const drafts = await draftFlashcardFromDataCard(prisma, company, dc, memoryPrompt);
      if (drafts.length === 0) {
        console.log(`[WARN] Drafter returned 0 insights for ${dc.type}: ${dc.id}. Model may be refusing or content is silent.`);
      }

      for (const draft of drafts) {
        const { sourceId, sourceType, ...cleanDraft } = draft;
        const created = await prisma.flashcard.upsert({
          where: { companyId_fingerprint: { companyId: cid, fingerprint: draft.fingerprint } },
          create: { ...cleanDraft, companyId: cid },
          update: { updatedAt: new Date() }
        });
        
        // Ensure Source Linking
        await prisma.flashcardSource.upsert({
          where: { flashcardId_sourceType_sourceId: { flashcardId: created.id, sourceType: dc.type, sourceId: dc.id } },
          create: { flashcardId: created.id, sourceType: dc.type, sourceId: dc.id, sourceName: dc.name },
          update: {}
        });
        ops++;
      }
    }

    // --- STAGE 2: WRITER & JUDGE (The Quality Pipeline) ---
    
    // 2.a Flashcards: DRAFT -> CHECKED -> VERIFIED
    synthesisState.stage = "WRITING";
    const fcActive = await prisma.flashcard.findMany({ 
      where: { companyId: cid, processingStatus: { in: ["DRAFT", "CHECKED"] } },
      take: orbitLimit * 2
    });

    for (const fc of fcActive) {
      synthesisState.lastProgressAt = new Date().toISOString();
      console.log(`[DEBUG] Processing fc.id: ${fc.id}, status: ${fc.processingStatus}`);
      if (fc.processingStatus === "DRAFT") {
        const refined = await refineDraftFlashCard(prisma, fc, memoryPrompt);
        if (refined) {
          await prisma.flashcard.update({ where: { id: fc.id }, data: refined });
          ops++;
        }
      } else if (fc.processingStatus === "CHECKED") {
        synthesisState.stage = "JUDGING";
        const audit = await auditCheckedFlashCard(prisma, fc, memoryPrompt);
        if (audit) {
          await prisma.flashcard.update({ where: { id: fc.id }, data: audit });
          ops++;
        }
      }
    }

    // 2.b Taskcards: DRAFT -> CHECKED -> VERIFIED
    const tcActive = await prisma.nBAItem.findMany({ 
      where: { companyId: cid, processingStatus: { in: ["DRAFT", "CHECKED"] } },
      orderBy: { createdAt: "desc" }, // Prioritize new user-created drafts
      take: orbitLimit
    });

    for (const tc of tcActive) {
      synthesisState.lastProgressAt = new Date().toISOString();
      console.log(`[DEBUG] Processing tc.id: ${tc.id}, status: ${tc.processingStatus}`);
      if (tc.processingStatus === "DRAFT") {
        synthesisState.stage = "WRITING";
        const refined = await refineDraftTaskCard(prisma, tc, memoryPrompt);
        if (refined) {
          await prisma.nBAItem.update({ where: { id: tc.id }, data: refined });
          ops++;
        }
      } else if (tc.processingStatus === "CHECKED") {
        synthesisState.stage = "JUDGING";
        const audit = await auditCheckedTaskCard(prisma, tc, memoryPrompt);
        if (audit) {
          await prisma.nBAItem.update({ where: { id: tc.id }, data: audit });
          ops++;
        }
      }
    }

    // --- STAGE 3: SYNTHESIS ASCENSION (Verified Flashcards -> Draft Tasks) ---
    synthesisState.stage = "ASCENDING";
    const verifiedFlash = await prisma.flashcard.findMany({ 
      where: { companyId: cid, processingStatus: "VERIFIED" },
      take: orbitLimit
    });
    for (const vf of verifiedFlash) {
      synthesisState.lastProgressAt = new Date().toISOString();
      console.log(`[DEBUG] draftTaskcardFromFlashCard for vf.id: ${vf.id}`);
      const taskDrafts = await draftTaskcardFromFlashCard(prisma, company, vf, memoryPrompt);
      for (const td of taskDrafts) {
        await prisma.nBAItem.upsert({
          where: { companyId_fingerprint: { companyId: cid, fingerprint: td.fingerprint } },
          create: td,
          update: { updatedAt: new Date() }
        });
        ops++;
      }
    }
  }

  // Maintenance Phase
  synthesisState.stage = "MAINTENANCE";
  await runMaintenance(prisma, company);

  return ops;
}

module.exports = { 
  runSynthesisCycle,
  processCompanySynthesis,
  getSynthesisProgress,
  collectGlobalWorkerSettings,
  syncSynthesisStateToDb,
  synthesisState
};
