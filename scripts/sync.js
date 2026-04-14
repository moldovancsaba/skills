const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { getHumanMemoryPrompt } = require("./lib/memory");
const { getWorkerConfig } = require("./lib/shared");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;

const prisma = new PrismaClient();
const PORT = 10005;

/**
 * The SOVEREIGN TRINITY ORCHESTRATOR
 * Aligned with SOVEREIGN_WORKFLOW.md
 */
const { runSynthesisCycle, getSynthesisProgress } = require("./lib/synthesis");
const { scrubDatabase } = require("./lib/maintenance");

async function runWorkerLoop() {
  try {
    const interval = await getWorkerConfig(prisma, {}, "loop_interval_ms", 3600000);
    console.log(`[SYNTHESIS] Starting Cycle... (Next cycle in ${interval / 60000} mins)`);
    
    await runSynthesisCycle(prisma);
    
    console.log(`[SYNTHESIS] Cycle Complete. Waiting ${interval / 60000} mins.`);
    setTimeout(runWorkerLoop, interval);
  } catch (err) {
    console.error(`[CRITICAL] Worker Loop Failure:`, err);
    setTimeout(runWorkerLoop, 60000); // Retry in 1 min on crash
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    // Contract v1 Health Response for mvp-factory-control
    const progress = getSynthesisProgress();
    const pollIntervalSec = await getWorkerConfig(prisma, {}, "loop_interval_ms", 3600000) / 1000;
    const ollamaTimeout = await getWorkerConfig(prisma, {}, "ollama_timeout_ms", 120000);

    const health = {
      researchEnabled: process.env.CHECKLIST_RESEARCH_ENABLED === "true",
      progress: {
        state: progress.state,
        lastProgressAt: progress.lastProgressAt,
        currentCompany: progress.currentCompany,
        cycleCount: progress.cycleCount
      },
      settings: {
        supervisorContractVersion: 1,
        schedulingMode: "company-serial-cycle",
        companyCycleCooldownMs: pollIntervalSec * 1000,
        researchHarvestBatchSize: 1,
        ollamaTimeoutMs: ollamaTimeout,
        failsafeModel: "gemma4:e4b,granite3.3:2b",
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
      }
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
  console.log(`Sovereign Trinity Worker v${APP_VERSION} Active on Port ${PORT}`);
  await scrubDatabase(prisma); // Critical Pre-flight scrub
  runWorkerLoop();
});
