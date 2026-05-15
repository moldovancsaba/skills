const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { OLLAMA_MODEL, envFlag } = require("./lib/core");
const { runPipelineQueueBatch } = require("./lib/pipeline-jobs");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;

const prisma = new PrismaClient();
const PORT = 10005;

/**
 * Main entry point for the recurring local AI worker loop.
 *
 * Runs the queue-owned local AI worker loop for the company intelligence
 * pipeline.
 */
const { getSynthesisProgress, collectGlobalWorkerSettings, updateProgress, synthesisState } = require("./lib/synthesis");
const { scrubDatabaseElemental } = require("./lib/maintenance");
const { refreshAllIntelligenceSnapshots } = require("./lib/intelligence-snapshot");
const { processPendingWorkerCommands } = require("./lib/system-commands");

// --- CONTINUOUS HEARTBEAT ---
// Persist progress even while the worker is between queue batches so the
// watchdog and dashboard can detect a live-but-idle worker accurately.
setInterval(async () => {
  if (synthesisState) {
    await updateProgress(prisma);
  }
}, 60000);

let lastCycleStartTime = 0;
const IDLE_INTERVAL = 300000;
const ACTIVE_INTERVAL = 30000;
const POLLING_INTERVAL = 30000;
const STARTUP_SCRUB_INTERVAL = 6 * 60 * 60 * 1000;

let isRunning = false;
let wakeRequested = false;
let lastStartupScrubAt = 0;

async function runStartupIntegrityPass() {
  const now = Date.now();
  if (now - lastStartupScrubAt < STARTUP_SCRUB_INTERVAL) return;

  lastStartupScrubAt = now;
  await updateProgress(prisma, {
    state: "running",
    stage: "STARTUP_MAINTENANCE",
    currentCompany: null,
    activeTask: "Running startup integrity maintenance",
  });
  await scrubDatabaseElemental(prisma);
}

async function runWorkerLoop() {
  if (isRunning) return;
  isRunning = true;
  
  try {
    console.log(`[SCHEDULER] Initiating queue-owned worker cycle...`);
    lastCycleStartTime = Date.now();
    wakeRequested = false;

    await runStartupIntegrityPass();
    await updateProgress(prisma, {
      state: "running",
      stage: "SYSTEM_COMMANDS",
      currentCompany: null,
      activeTask: "Processing worker system commands",
    });
    await processPendingWorkerCommands(prisma, refreshAllIntelligenceSnapshots);
    await updateProgress(prisma, {
      state: "running",
      stage: "PIPELINE_QUEUE",
      currentCompany: null,
      activeTask: "Scanning pipeline queue for runnable jobs",
    });
    // Queue execution is the only mutation lane. Any revisit, synthesis,
    // repair, or maintenance work must arrive through claimable jobs.
    const queueOps = await runPipelineQueueBatch(prisma, 4);
    await updateProgress(prisma, {
      state: "running",
      stage: "SNAPSHOT_REFRESH",
      currentCompany: null,
      activeTask: "Refreshing intelligence snapshots",
    });
    await refreshAllIntelligenceSnapshots(prisma);

    await updateProgress(prisma, {
      state: "idle",
      stage: "IDLE",
      currentCompany: null,
      activeTask: "Waiting for the next planner cycle",
    });

    const restInterval = queueOps > 0 ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    console.log(
      `[SCHEDULER] Cycle complete (${queueOps} queue job(s) executed). Resting for ${Math.round(restInterval / 1000)}s...`,
    );

    const targetWakeTime = Date.now() + restInterval;
    while (Date.now() < targetWakeTime) {
      if (wakeRequested) break;
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }

    isRunning = false;
    runWorkerLoop();
  } catch (err) {
    console.error(`[CRITICAL] Worker Loop Failure:`, err);
    isRunning = false;
    await updateProgress(prisma, {
      state: "idle",
      stage: "ERROR",
      activeTask: "Worker loop failed",
      errorStats: {
        ...synthesisState.errorStats,
        attempts: (synthesisState.errorStats?.attempts || 0) + 1,
        failures: (synthesisState.errorStats?.failures || 0) + 1,
        criticalFailureStreak: (synthesisState.errorStats?.criticalFailureStreak || 0) + 1,
      },
    });
    setTimeout(runWorkerLoop, 60000); // Retry in 1 min on crash
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    // Health reflects the queue-owned worker only. The direct synthesis loop
    // is retired and should not be inferred from this payload.
    const progress = getSynthesisProgress();
    const settings = await collectGlobalWorkerSettings(prisma);

    const health = {
      researchEnabled: envFlag(
        process.env.CHECKLIST_RESEARCH_ENABLED ?? process.env.checklist_RESEARCH_ENABLED,
        false,
      ),
      progress: {
        state: progress.state,
        stage: progress.stage,
        pass: progress.pass,
        lastProgressAt: progress.lastProgressAt,
        currentCompany: progress.currentCompany,
        activeTask: progress.activeTask,
        activeModel: progress.activeModel,
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
    wakeRequested = true;
    if (!isRunning) {
      void runWorkerLoop();
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ACCEPTED", schedulingMode: "queue-only", wakeRequested: true }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`checklist local AI worker v${APP_VERSION} active on port ${PORT}`);
  runWorkerLoop();
});
