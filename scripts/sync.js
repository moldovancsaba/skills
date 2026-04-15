const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { getHumanMemoryPrompt } = require("./lib/memory");
const { getWorkerConfig } = require("./lib/shared");
const { OLLAMA_MODEL } = require("./lib/core");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;

const prisma = new PrismaClient();
const PORT = 10005;

/**
 * SOVEREIGN TRINITY ORCHESTRATOR
 * v0.11.4-STABLE
 * 
 * Main entry point for the background AI synthesis loop.
 * Orchestrates the recurring execution of the Trinity pipeline and serves health metrics.
 */
const { runSynthesisCycle, getSynthesisProgress } = require("./lib/synthesis");
const { scrubDatabase } = require("./lib/maintenance");

/**
 * Main worker loop. Executes the synthesis cycle and schedules the next run based on configuration.
 */
async function runWorkerLoop() {
  try {
    const loopInterval = await getWorkerConfig(prisma, {}, "loop_interval_ms", 3600000);
    const idleInterval = await getWorkerConfig(prisma, {}, "idle_poll_interval_ms", 300000); // Default 5m
    
    console.log(`[SYNTHESIS] Starting Cycle...`);
    const result = await runSynthesisCycle(prisma);
    
    if (result.workDone) {
      console.log(`[SYNTHESIS] Cycle Complete (${result.operations} ops). Standard cooldown: ${loopInterval / 60000} mins.`);
      setTimeout(runWorkerLoop, loopInterval);
    } else {
      console.log(`[HEARTBEAT] System idle (0 ops). Re-polling in ${idleInterval / 60000} mins.`);
      setTimeout(runWorkerLoop, idleInterval);
    }
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
        stage: progress.stage,
        pass: progress.pass,
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
  try {
    await scrubDatabase(prisma); // Critical Pre-flight scrub
  } catch (err) {
    console.error(`[MAINTENANCE] Pre-flight scrub failed (non-critical):`, err.message);
  }
  runWorkerLoop();
});
