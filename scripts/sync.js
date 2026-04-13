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
const { runSynthesisCycle } = require("./lib/synthesis");

async function runWorker() {
  const companies = await prisma.company.findMany();
  console.log(`[SYNTHESIS] Ignition Cycle for ${companies.length} companies...`);
  await runSynthesisCycle(prisma);
}

async function runWorker() {
  const companies = await prisma.company.findMany();
  console.log(`[SYNTHESIS] Ignition Cycle for ${companies.length} companies...`);
  await runSynthesisCycle(prisma);
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
