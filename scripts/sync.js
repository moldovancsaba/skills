const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { OLLAMA_MODEL, envFlag } = require("./lib/core");
const { runPipelineQueueBatch, shouldDelegateQueueRefresh } = require("./lib/pipeline-jobs");
const { recoverOrphanedRunningPipelineJobs } = require("../src/lib/pipeline-queue");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;

const prisma = new PrismaClient();
const PORT = 10005;
const SNAPSHOT_PORT = 10007;
const STARTUP_SCRUB_SETTING_KEY = "local_ai_startup_integrity_last_ran_at";

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
const {
  getFreeMemoryMb,
  getResourceBand,
  shouldAllowForegroundWork,
} = require("./lib/runtime/resource-bands");

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
let recoveredOrphanedRunningJobs = false;

function requestBackgroundQueueSync(reason = "foreground-idle-claim-miss") {
  const req = http.request(
    { hostname: "127.0.0.1", port: SNAPSHOT_PORT, path: "/force", method: "POST", timeout: 3000 },
    (res) => {
      res.resume();
      console.log(`[SCHEDULER] Background snapshot worker wake requested (${reason}) status=${res.statusCode}.`);
    },
  );

  req.on("error", (error) => {
    console.warn(`[SCHEDULER] Background snapshot wake request failed (${reason}): ${error.message}`);
  });

  req.on("timeout", () => {
    req.destroy();
    console.warn(`[SCHEDULER] Background snapshot wake request timed out (${reason}).`);
  });

  req.end();
}

async function readLastStartupScrubAt(prisma) {
  if (lastStartupScrubAt > 0) return lastStartupScrubAt;

  const setting = await prisma.globalSetting.findUnique({
    where: { key: STARTUP_SCRUB_SETTING_KEY },
    select: { value: true },
  });
  const rawValue = setting?.value?.lastRanAt;
  if (!rawValue) return 0;

  const parsed = new Date(rawValue).getTime();
  if (Number.isFinite(parsed) && parsed > 0) {
    lastStartupScrubAt = parsed;
    return parsed;
  }
  return 0;
}

async function writeLastStartupScrubAt(prisma, timestampMs) {
  lastStartupScrubAt = timestampMs;
  await prisma.globalSetting.upsert({
    where: { key: STARTUP_SCRUB_SETTING_KEY },
    create: {
      key: STARTUP_SCRUB_SETTING_KEY,
      value: { lastRanAt: new Date(timestampMs).toISOString() },
    },
    update: {
      value: { lastRanAt: new Date(timestampMs).toISOString() },
    },
  });
}

async function runStartupIntegrityPass() {
  const now = Date.now();
  const lastRanAt = await readLastStartupScrubAt(prisma);
  if (now - lastRanAt < STARTUP_SCRUB_INTERVAL) return;

  await updateProgress(prisma, {
    state: "running",
    stage: "STARTUP_MAINTENANCE",
    currentCompany: null,
    activeTask: "Running startup integrity maintenance",
  });
  await scrubDatabaseElemental(prisma);
  await writeLastStartupScrubAt(prisma, now);
}

async function runWorkerLoop() {
  if (isRunning) return;
  isRunning = true;
  
  try {
    console.log(`[SCHEDULER] Initiating queue-owned worker cycle...`);
    lastCycleStartTime = Date.now();
    wakeRequested = false;

    if (!recoveredOrphanedRunningJobs) {
      await recoverOrphanedRunningPipelineJobs(prisma);
      recoveredOrphanedRunningJobs = true;
    }

    const freeMemMb = getFreeMemoryMb();
    const foregroundDecision = shouldAllowForegroundWork(freeMemMb);
    const resourceBand = getResourceBand(freeMemMb);

    if (!foregroundDecision.allowed) {
      await updateProgress(prisma, {
        state: "idle",
        stage: "PAUSED_LOW_MEMORY",
        currentCompany: null,
        activeTask: `Foreground queue paused due to ${resourceBand} memory pressure (${freeMemMb}MB free)`,
        metrics: {
          ...(synthesisState.metrics || {}),
          freeMemMb,
          resourceBand,
        },
      });

      const targetWakeTime = Date.now() + IDLE_INTERVAL;
      while (Date.now() < targetWakeTime) {
        if (wakeRequested) break;
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
      }

      isRunning = false;
      runWorkerLoop();
      return;
    }

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
      metrics: {
        ...(synthesisState.metrics || {}),
        freeMemMb,
        resourceBand,
      },
    });
    // Queue execution is the only mutation lane. Any revisit, synthesis,
    // repair, or maintenance work must arrive through claimable jobs.
    const queueBatch = await runPipelineQueueBatch(prisma, 1);
    const queueOps = Number(queueBatch?.executed || 0);

    if (shouldDelegateQueueRefresh(queueBatch)) {
      requestBackgroundQueueSync("foreground-claim-miss");
    }

    await updateProgress(prisma, {
      state: "idle",
      stage: "IDLE",
      currentCompany: null,
      activeTask: shouldDelegateQueueRefresh(queueBatch)
        ? "Waiting for background queue sync after claim miss"
        : "Waiting for the next planner cycle",
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
