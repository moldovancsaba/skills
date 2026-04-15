const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { getHumanMemoryPrompt } = require("./lib/memory");
const { getWorkerConfig } = require("./lib/shared");
const { OLLAMA_MODEL } = require("./lib/core");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;

const prisma = new PrismaClient();
const PORT = 10005;

const DEFAULT_LOOP_INTERVAL = 600000;      // 10 minutes default
const DEFAULT_IDLE_INTERVAL = 300000;      // 5 minutes default

/**
 * SOVEREIGN TRINITY ORCHESTRATOR
 * v0.11.4-STABLE
 * 
 * Main entry point for the background AI synthesis loop.
 * Orchestrates the recurring execution of the Trinity pipeline and serves health metrics.
 */
const { runSynthesisCycle, getSynthesisProgress, syncSynthesisStateToDb, synthesisState } = require("./lib/synthesis");
const { scrubDatabase } = require("./lib/maintenance");

// --- CONTINUOUS HEARTBEAT ---
// Updates the "Last Activity" timestamp and syncs to DB for the Cloud Dashboard.
setInterval(async () => {
  if (synthesisState) {
    synthesisState.lastProgressAt = new Date().toISOString();
    await syncSynthesisStateToDb(prisma);
  }
}, 60000);

let lastCycleStartTime = 0;

/**
 * Main worker loop. Executes the synthesis cycle and handles the 'Sovereign' command-and-control polling.
 */
async function runWorkerLoop() {
  try {
    const loopInterval = await getWorkerConfig(prisma, {}, "loop_interval_ms", DEFAULT_LOOP_INTERVAL);
    const idleInterval = await getWorkerConfig(prisma, {}, "idle_poll_interval_ms", DEFAULT_IDLE_INTERVAL);
    
    console.log(`[SYNTHESIS] Starting Cycle...`);
    lastCycleStartTime = Date.now();
    const result = await runSynthesisCycle(prisma);
    await syncSynthesisStateToDb(prisma); // Post-cycle sync
    
    const cooldown = result.workDone ? loopInterval : idleInterval;
    const cooldownMins = cooldown / 60000;
    console.log(`[SYNTHESIS] Cycle Complete (${result.operations} ops). Resting for ${cooldownMins} mins...`);
    
    // --- IDLE WATCHER LOOP ---
    // Instead of one long setTimeout, we sleep in 30s increments to poll for DB reanimation signals.
    const wakeUpAt = Date.now() + cooldown;
    while (Date.now() < wakeUpAt) {
      // Check for Manual Reanimate Signal from Cloud
      const reanimateSignal = await prisma.globalSetting.findUnique({ where: { key: "core_synthesis_reanimate_requested_at" } });
      if (reanimateSignal) {
        const signalTime = new Date(reanimateSignal.value.timestamp).getTime();
        if (signalTime > lastCycleStartTime) {
          console.log(`[DEFIBRILLATOR] Manual reanimation detected in DB. Waking up...`);
          break; // Exit idle loop to start new cycle
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 30000)); // Poll every 30s
    }

    // Recurse to next cycle
    runWorkerLoop();
  } catch (err) {
    console.error(`[CRITICAL] Worker Loop Failure:`, err);
    setTimeout(runWorkerLoop, 60000); // Retry in 1 min on crash
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    // Contract v1 Health Response for mvp-factory-control
    const progress = getSynthesisProgress();
    const pollIntervalSec = await getWorkerConfig(prisma, {}, "loop_interval_ms", DEFAULT_LOOP_INTERVAL) / 1000;
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
