const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { getHumanMemoryPrompt } = require("./lib/memory");
const { getWorkerConfig } = require("./lib/shared");
const { OLLAMA_MODEL } = require("./lib/core");
const { runPipelineQueueBatch } = require("./lib/pipeline-jobs");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;

const prisma = new PrismaClient();
const PORT = 10005;

const DEFAULT_LOOP_INTERVAL = 600000;      // 10 minutes default
const DEFAULT_IDLE_INTERVAL = 300000;      // 5 minutes default

/**
 * trinity ORCHESTRATOR
 * v1.2.0-PRODUCTION
 * 
 * Main entry point for the background AI synthesis loop.
 * Orchestrates the recurring execution of the Trinity pipeline:
 *   1. DRAFTER: Recurrent RDT Evidence Extraction
 *   2. WRITER: Strategic Synthesis & ICE Calculation
 *   3. JUDGE: Tournament Consensus & Strategic Learning
 */
const { runSynthesisCycle, getSynthesisProgress, collectGlobalWorkerSettings, updateProgress, synthesisState } = require("./lib/synthesis");
const { scrubDatabaseElemental } = require("./lib/maintenance");

// --- CONTINUOUS HEARTBEAT ---
setInterval(async () => {
  if (synthesisState) {
    await updateProgress(prisma);
  }
}, 60000);

let lastCycleStartTime = 0;
const FAILSAFE_INTERVAL = 3600000;
const IDLE_INTERVAL = 300000;
const POLLING_INTERVAL = 30000;

let isRunning = false;

async function runWorkerLoop() {
  if (isRunning) return;
  isRunning = true;
  
  try {
    console.log(`[SYNTHESIS] Initiating v2.0.0 Cycle...`);
    lastCycleStartTime = Date.now();
    
    await updateProgress(prisma, { stage: "MAINTENANCE" });
    await scrubDatabaseElemental(prisma);
    await updateProgress(prisma, { stage: "PIPELINE_QUEUE" });
    const queueOps = await runPipelineQueueBatch(prisma, 4);
    
    const result = await runSynthesisCycle(prisma);
    await updateProgress(prisma); 
    
    console.log(`[SYNTHESIS] Cycle Complete (${queueOps + result.operations} ops total; ${queueOps} pipeline-queue ops). Resting...`);

    const targetWakeTime = Date.now() + IDLE_INTERVAL;
    while (Date.now() < targetWakeTime) {
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }

    isRunning = false;
    runWorkerLoop();
  } catch (err) {
    console.error(`[CRITICAL] Worker Loop Failure:`, err);
    isRunning = false;
    setTimeout(runWorkerLoop, 60000); // Retry in 1 min on crash
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    // Contract v1 Health Response for mvp-factory-control
    const progress = getSynthesisProgress();
    const settings = await collectGlobalWorkerSettings(prisma);

    const health = {
      researchEnabled: process.env.checklist_RESEARCH_ENABLED === "true",
      progress: {
        state: progress.state,
        stage: progress.stage,
        pass: progress.pass,
        lastProgressAt: progress.lastProgressAt,
        currentCompany: progress.currentCompany,
        cycleCount: progress.cycleCount,
        enrichmentModeFlashcards: progress.enrichmentModeFlashcards,
        enrichmentModeTasks: progress.enrichmentModeTasks,
        metrics: progress.metrics,
        errorStats: progress.errorStats
      },
      settings
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(health));
  } else if (req.url === "/force" && req.method === "POST") {
    console.log("[BRIDGE] Force Trigger Received.");
    runSynthesisCycle(prisma); // Run out of band
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ACCEPTED" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`trinity Worker v${APP_VERSION} Active on Port ${PORT}`);
  runWorkerLoop();
});
