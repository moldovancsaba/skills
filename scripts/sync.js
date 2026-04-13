const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { getHumanMemoryPrompt } = require("./lib/memory");
const { draftFlashcardFromDataCard, draftTaskcardFromFlashCard } = require("./lib/drafter");
const { refineDraftFlashCard, refineDraftTaskCard } = require("./lib/writer");
const { auditCheckedFlashCard, auditCheckedTaskCard } = require("./lib/judge");
const { getWorkerConfig } = require("./lib/shared");

const prisma = new PrismaClient();
const PORT = 10005;

/**
 * The SOVEREIGN TRINITY ORCHESTRATOR
 * v0.10.0-PROPER (V51 Priority Sweep)
 * Aligned with SOVEREIGN_WORKFLOW.md
 */
async function processCompanyCards(company) {
  console.log(`[SOVEREIGN] Auditing ALL Cards for ${company.name}...`);
  
  // 0. Worker Config & Dynamic Memory
  const expiryHours = getWorkerConfig(company, "card_expiry_hours", 168);
  const memoryPrompt = await getHumanMemoryPrompt(prisma, company);

  // --- STAGE 3: JUDGE (The Quality Floor) - PRIORITY 1 ---
  // We process Checked items first to populate the dashboard instantly.

  // 3.a FlashCard CHECKED -> VERIFIED
  const fcChecked = await prisma.flashcard.findMany({ where: { companyId: company.id, status: "CHECKED" } });
  for (const c of fcChecked) {
    const audit = await auditCheckedFlashCard(prisma, c, memoryPrompt);
    if (audit) {
      await prisma.flashcard.update({ where: { id: c.id }, data: audit });
      console.log(`[JUDGE] Audit Complete (FlashCard): ${c.title} -> ${audit.status}`);
    }
  }

  // 3.b TaskCard CHECKED -> VERIFIED
  const tcChecked = await prisma.nBAItem.findMany({ where: { companyId: company.id, status: "CHECKED" } });
  for (const tc of tcChecked) {
    const audit = await auditCheckedTaskCard(prisma, tc, memoryPrompt);
    if (audit) {
      await prisma.nBAItem.update({ where: { id: tc.id }, data: audit });
      console.log(`[JUDGE] Audit Complete (TaskCard): ${tc.title} -> ${audit.status}`);
    }
  }

  // --- STAGE 2: WRITER (The Editors) - PRIORITY 2 ---
  // We process Drafts second to move them into the Judge queue.

  // 2.a FlashCard DRAFT -> CHECKED
  const fcDrafts = await prisma.flashcard.findMany({ where: { companyId: company.id, status: "DRAFT" } });
  for (const f of fcDrafts) {
    const refined = await refineDraftFlashCard(prisma, f, memoryPrompt);
    if (refined) {
      await prisma.flashcard.update({ where: { id: f.id }, data: refined });
      console.log(`[WRITER] Promoted FlashCard to CHECKED: ${f.title}`);
    }
  }

  // 2.b TaskCard DRAFT -> CHECKED
  const tcDrafts = await prisma.nBAItem.findMany({ where: { companyId: company.id, status: "DRAFT" } });
  for (const t of tcDrafts) {
    const refined = await refineDraftTaskCard(prisma, t, memoryPrompt);
    if (refined) {
      await prisma.nBAItem.update({ where: { id: t.id }, data: refined });
      console.log(`[WRITER] Promoted TaskCard to CHECKED: ${t.title}`);
    }
  }

  // --- STAGE 1: DRAFTER (The Architects) - PRIORITY 3 ---
  // We only propose NEW work once the existing pipeline is moving.
  
  // 1.a DataCard -> FlashCard (DRAFT)
  const dataCards = await prisma.source.findMany({ where: { companyId: company.id } });
  for (const dc of dataCards) {
    const draft = await draftFlashcardFromDataCard(prisma, company, dc, memoryPrompt);
    if (draft) {
      await prisma.flashcard.upsert({
        where: { companyId_fingerprint: { companyId: company.id, fingerprint: draft.fingerprint } },
        create: draft,
        update: { updatedAt: new Date() }
      });
      console.log(`[DRAFTER] Proposed DRAFT FlashCard from DataCard: ${dc.id}`);
    }
  }

  // 1.b FlashCard (VERIFIED) -> TaskCard (DRAFT)
  const verifiedFlash = await prisma.flashcard.findMany({ where: { companyId: company.id, status: "VERIFIED" } });
  for (const vf of verifiedFlash) {
    const taskDraft = await draftTaskcardFromFlashCard(prisma, company, vf, memoryPrompt);
    if (taskDraft) {
      await prisma.nBAItem.create({ data: taskDraft });
      console.log(`[DRAFTER] Proposed DRAFT TaskCard from FlashCard: ${vf.title}`);
    }
  }

  // --- STAGE 4: EXPIRATION ---
  const now = new Date();
  const threshold = new Date(now.getTime() - expiryHours * 60 * 60 * 1000);
  
  await prisma.flashcard.updateMany({
    where: { companyId: company.id, status: { in: ["DRAFT", "CHECKED"] }, updatedAt: { lt: threshold } },
    data: { status: "EXPIRED" }
  });

  await prisma.nBAItem.updateMany({
    where: { companyId: company.id, status: { in: ["DRAFT", "CHECKED"] }, updatedAt: { lt: threshold } },
    data: { status: "EXPIRED" }
  });
}

async function runWorker() {
  const companies = await prisma.company.findMany();
  for (const company of companies) {
    try {
      await processCompanyCards(company);
    } catch (err) {
      console.error(`[ERROR] Trinity Cycle failure for ${company.name}:`, err.message);
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/force" && req.method === "POST") {
    await runWorker();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ACCEPTED" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Sovereign Trinity Worker v0.10.0-PROPER Active on Port ${PORT}`);
  runWorker();
  setInterval(runWorker, 60 * 60 * 1000);
});
