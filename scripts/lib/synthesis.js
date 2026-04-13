const { getHumanMemoryPrompt } = require("./memory");
const { draftFlashcardFromDataCard, draftTaskcardFromFlashCard } = require("./drafter");
const { refineDraftFlashCard, refineDraftTaskCard } = require("./writer");
const { auditCheckedFlashCard, auditCheckedTaskCard } = require("./judge");
const { getWorkerConfig } = require("./shared");

const BATCH_LIMIT = 5; // The Carousel Orbit Limit

/**
 * THE SOVEREIGN SYNTHESIS ENGINE (CAROUSEL EDITION)
 * v0.13.3-STABLE
 * 
 * Implements round-robin orchestration to prevent sequential starvation.
 */
async function runSynthesisCycle(prisma) {
  const companies = await prisma.company.findMany();
  console.log(`[SYNTHESIS] Orbiting ${companies.length} companies...`);

  for (const company of companies) {
    try {
      await processCompanySynthesis(prisma, company);
    } catch (err) {
      console.error(`[ERROR] Synthesis failure for ${company.name}:`, err.message);
    }
  }
}

async function processCompanySynthesis(prisma, company) {
  const cid = company.id;
  
  // 0. Context & Config
  const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
  const expiryHours = getWorkerConfig(company, "card_expiry_hours", 168);

  // --- STAGE 1: DRAFTER (Sources -> Flashcards) ---
  const sources = await prisma.source.findMany({ 
    where: { companyId: cid },
    take: BATCH_LIMIT // Orbit limit
  });
  
  let dCount = 0;
  for (const s of sources) {
    const draft = await draftFlashcardFromDataCard(prisma, company, s, memoryPrompt);
    if (draft) {
      await prisma.flashcard.upsert({
        where: { companyId_fingerprint: { companyId: cid, fingerprint: draft.fingerprint } },
        create: draft,
        update: { updatedAt: new Date() }
      });
      dCount++;
    }
  }
  if (dCount > 0) console.log(`[DRAFTER] ${company.name}: Created ${dCount} Drafts`);

  // --- STAGE 2: WRITER & JUDGE (The Quality Pipeline) ---
  
  // 2.a Flashcards: Orbiting DRAFT -> CHECKED -> VERIFIED
  const fcActive = await prisma.flashcard.findMany({ 
    where: { companyId: cid, status: { in: ["DRAFT", "CHECKED"] } },
    take: BATCH_LIMIT * 2 // Allow a larger pipeline orbit
  });

  let wCount = 0;
  let jCount = 0;
  for (const fc of fcActive) {
    if (fc.status === "DRAFT") {
      const refined = await refineDraftFlashCard(prisma, fc, memoryPrompt);
      if (refined) {
        await prisma.flashcard.update({ where: { id: fc.id }, data: { ...refined, status: "CHECKED" } });
        wCount++;
      }
    } else if (fc.status === "CHECKED") {
      const audit = await auditCheckedFlashCard(prisma, fc, memoryPrompt);
      if (audit) {
        await prisma.flashcard.update({ where: { id: fc.id }, data: audit });
        jCount++;
      }
    }
  }
  if (wCount > 0) console.log(`[WRITER] ${company.name}: Promoted ${wCount} Flashcards`);
  if (jCount > 0) console.log(`[JUDGE] ${company.name}: Finalized ${jCount} Flashcards`);

  // 2.b Taskcards: Orbiting DRAFT -> CHECKED -> VERIFIED
  const tcActive = await prisma.nBAItem.findMany({ 
    where: { companyId: cid, status: { in: ["DRAFT", "CHECKED", "PENDING"] } },
    take: BATCH_LIMIT
  });

  for (const tc of tcActive) {
    if (tc.status === "DRAFT" || tc.status === "PENDING") {
      const refined = await refineDraftTaskCard(prisma, tc, memoryPrompt);
      if (refined) {
        await prisma.nBAItem.update({ where: { id: tc.id }, data: { ...refined, status: "CHECKED" } });
      }
    } else if (tc.status === "CHECKED") {
      const audit = await auditCheckedTaskCard(prisma, tc, memoryPrompt);
      if (audit) {
        await prisma.nBAItem.update({ where: { id: tc.id }, data: audit });
      }
    }
  }

  // --- STAGE 3: TASK DRAFTER (Verified Flashcards -> Draft Tasks) ---
  const verifiedFlash = await prisma.flashcard.findMany({ 
    where: { companyId: cid, status: "VERIFIED" },
    take: BATCH_LIMIT
  });
  for (const vf of verifiedFlash) {
    const taskDraft = await draftTaskcardFromFlashCard(prisma, company, vf, memoryPrompt);
    if (taskDraft) {
      await prisma.nBAItem.create({ data: taskDraft });
    }
  }

  // --- STAGE 4: MAINTENANCE ---
  const threshold = new Date(Date.now() - expiryHours * 60 * 60 * 1000);
  await prisma.flashcard.updateMany({
    where: { companyId: cid, status: { in: ["DRAFT", "CHECKED"] }, updatedAt: { lt: threshold } },
    data: { status: "EXPIRED" }
  });
}

module.exports = { runSynthesisCycle };
