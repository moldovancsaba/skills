const { getHumanMemoryPrompt } = require("./memory");
const { draftFlashcardFromDataCard, draftTaskcardFromFlashCard } = require("./drafter");
const { refineDraftFlashCard, refineDraftTaskCard } = require("./writer");
const { auditCheckedFlashCard, auditCheckedTaskCard } = require("./judge");
const { getWorkerConfig } = require("./shared");
const { runMaintenance } = require("./maintenance");

// Global state for /health reporting
let synthesisState = {
  state: "idle",
  lastProgressAt: new Date().toISOString(),
  currentCompany: null,
  cycleCount: 0
};

function getSynthesisProgress() {
  return synthesisState;
}

const BATCH_LIMIT = 5; // The Carousel Orbit Limit

/**
 * THE SOVEREIGN SYNTHESIS ENGINE (CAROUSEL EDITION)
 * v0.13.3-STABLE
 * 
 * Implements round-robin orchestration to prevent sequential starvation.
 */
async function runSynthesisCycle(prisma) {
  // Fair Rotation: Oldest last-visited company first
  const companies = await prisma.company.findMany({
    where: { updatedAt: { not: undefined } }, // Just to ensure active
    orderBy: { lastAIVisited: "asc" }
  });

  synthesisState.state = "running";
  synthesisState.lastProgressAt = new Date().toISOString();
  synthesisState.cycleCount++;

  const batchSize = await getWorkerConfig(prisma, {}, "batch_limit", 5);
  console.log(`[SYNTHESIS] Orbiting ${companies.length} companies (Batch Size: ${batchSize})...`);

  // Process a batch of companies to ensure fairness
  for (const company of companies.slice(0, batchSize)) {
    try {
      await processCompanySynthesis(prisma, company);
    } catch (err) {
      console.error(`[ERROR] Synthesis failure for ${company.name}:`, err.message);
    }
  }

  synthesisState.state = "idle";
  synthesisState.currentCompany = null;
  synthesisState.lastProgressAt = new Date().toISOString();
}

async function processCompanySynthesis(prisma, company) {
  const cid = company.id;
  
  // 1. Context & Config
  const passes = await getWorkerConfig(prisma, company, "mini_loop_passes", 3);
  const orbitLimit = await getWorkerConfig(prisma, company, "batch_limit", 5);
  
  synthesisState.currentCompany = company.name;
  synthesisState.lastProgressAt = new Date().toISOString();

  console.log(`[SYNTHESIS] ${company.name}: Starting ${passes}-pass Mini-loop.`);

  for (let pass = 1; pass <= passes; pass++) {
    console.log(`[SYNTHESIS] ${company.name}: PASS ${pass}/${passes}`);
    
    // Step A: Teach Local Brain
    const memoryPrompt = await getHumanMemoryPrompt(prisma, company);

    // --- STAGE 0: Orbit Entrance ---
    await prisma.company.update({
      where: { id: cid },
      data: { lastAIVisited: new Date() }
    });
    console.log(`[SYNTHESIS] ${company.name}: Entering Orbit...`);

    // --- STAGE 1: DRAFTER (Sources -> Flashcards) ---
    const sources = await prisma.source.findMany({ 
      where: { companyId: cid },
      take: orbitLimit
    });
    
    for (const s of sources) {
      const drafts = await draftFlashcardFromDataCard(prisma, company, s, memoryPrompt);
      for (const draft of drafts) {
        const { sourceId, sourceType, ...cleanDraft } = draft;
        const created = await prisma.flashcard.upsert({
          where: { companyId_fingerprint: { companyId: cid, fingerprint: draft.fingerprint } },
          create: cleanDraft,
          update: { updatedAt: new Date() }
        });
        
        // Ensure Source Linking
        await prisma.flashcardSource.upsert({
          where: { flashcardId_sourceType_sourceId: { flashcardId: created.id, sourceType, sourceId } },
          create: { flashcardId: created.id, sourceType, sourceId, sourceName: "Auto-detected Source" },
          update: {}
        });
      }
    }

    // --- STAGE 2: WRITER & JUDGE (The Quality Pipeline) ---
    
    // 2.a Flashcards: DRAFT -> CHECKED -> VERIFIED
    const fcActive = await prisma.flashcard.findMany({ 
      where: { companyId: cid, processingStatus: { in: ["DRAFT", "CHECKED"] } },
      take: orbitLimit * 2
    });

    for (const fc of fcActive) {
      if (fc.processingStatus === "DRAFT") {
        const refined = await refineDraftFlashCard(prisma, fc, memoryPrompt);
        if (refined) {
          await prisma.flashcard.update({ where: { id: fc.id }, data: refined });
        }
      } else if (fc.processingStatus === "CHECKED") {
        const audit = await auditCheckedFlashCard(prisma, fc, memoryPrompt);
        if (audit) {
          await prisma.flashcard.update({ where: { id: fc.id }, data: audit });
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
      if (tc.processingStatus === "DRAFT") {
        const refined = await refineDraftTaskCard(prisma, tc, memoryPrompt);
        if (refined) {
          await prisma.nBAItem.update({ where: { id: tc.id }, data: refined });
        }
      } else if (tc.processingStatus === "CHECKED") {
        const audit = await auditCheckedTaskCard(prisma, tc, memoryPrompt);
        if (audit) {
          await prisma.nBAItem.update({ where: { id: tc.id }, data: audit });
        }
      }
    }

    // --- STAGE 3: TASK DRAFTER (Verified Flashcards -> Draft Tasks) ---
    const verifiedFlash = await prisma.flashcard.findMany({ 
      where: { companyId: cid, processingStatus: "VERIFIED" },
      take: orbitLimit
    });
    for (const vf of verifiedFlash) {
      const taskDrafts = await draftTaskcardFromFlashCard(prisma, company, vf, memoryPrompt);
      for (const td of taskDrafts) {
        await prisma.nBAItem.upsert({
          where: { companyId_fingerprint: { companyId: cid, fingerprint: td.fingerprint } },
          create: td,
          update: { updatedAt: new Date() }
        });
      }
    }
  }

  // Maintenance Phase
  await runMaintenance(prisma, company);
}

module.exports = { 
  runSynthesisCycle,
  processCompanySynthesis,
  getSynthesisProgress
};
