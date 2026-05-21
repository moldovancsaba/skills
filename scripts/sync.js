const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { OLLAMA_MODEL, envFlag } = require("./lib/core");
const { runPipelineQueueBatch, shouldDelegateQueueRefresh } = require("./lib/pipeline-jobs");
const { recoverOrphanedRunningPipelineJobs } = require("../src/lib/pipeline-queue");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;
const { refreshCompanyIntelligenceSnapshot } = require("./lib/intelligence-snapshot");

const prisma = new PrismaClient();
const PORT = 10005;
const SNAPSHOT_PORT = 10007;
const STARTUP_SCRUB_SETTING_KEY = "local_ai_startup_integrity_last_ran_at";
const OPPORTUNITYCARD_SCORE_REPAIR_SETTING_KEY = "opportunitycard_score_contract_repair_v1";
const OPPORTUNITYCARD_SCORE_REPAIR_BATCH_SIZE = 100;
const OPPORTUNITYCARD_SCORE_REPAIR_MAX_BATCHES_PER_PASS = 2;

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
const { repairOpportunitycards } = require("./lib/opportunitycard-score-repair");
const {
  getFreeMemoryMb,
  getResourceBand,
  shouldAllowForegroundWork,
} = require("./lib/runtime/resource-bands");
const {
  LOCK_RENEW_INTERVAL_MS,
  acquireLinearWorkerLock,
  createLockOwner,
  releaseLinearWorkerLock,
  renewLinearWorkerLock,
} = require("./lib/runtime/linear-worker-lock");

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
const linearWorkerOwner = createLockOwner();
let hasLinearWorkerLock = false;

async function ensureLinearWorkerLock() {
  if (hasLinearWorkerLock) {
    const renewed = await renewLinearWorkerLock(linearWorkerOwner, {
      activeTask: synthesisState.activeTask || null,
      stage: synthesisState.stage || null,
    });
    hasLinearWorkerLock = renewed;
    return renewed;
  }

  const lease = await acquireLinearWorkerLock(linearWorkerOwner, {
    activeTask: synthesisState.activeTask || null,
    stage: synthesisState.stage || "BOOT",
  });
  hasLinearWorkerLock = lease.acquired;
  if (!lease.acquired) {
    const holder = lease.holder || {};
    console.log(
      `[SCHEDULER] Linear worker lock held by pid=${holder.pid || "unknown"} host=${holder.hostname || "unknown"}; standing by.`,
    );
    return false;
  }
  if (lease.staleReclaimed) {
    console.warn("[SCHEDULER] Reclaimed stale linear worker lock.");
  }
  return true;
}

async function releaseLinearWorkerLockIfOwned() {
  if (!hasLinearWorkerLock) return;
  await releaseLinearWorkerLock(linearWorkerOwner);
  hasLinearWorkerLock = false;
}

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

async function readOpportunitycardScoreRepairState(prisma) {
  const setting = await prisma.globalSetting.findUnique({
    where: { key: OPPORTUNITYCARD_SCORE_REPAIR_SETTING_KEY },
    select: { value: true },
  });
  const value = setting?.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    version: Number(value.version || 1),
    status: typeof value.status === "string" ? value.status : "PENDING",
    processed: Number(value.processed || 0),
    updated: Number(value.updated || 0),
    lastBatchProcessed: Number(value.lastBatchProcessed || 0),
    lastBatchUpdated: Number(value.lastBatchUpdated || 0),
    batchesProcessed: Number(value.batchesProcessed || 0),
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
    lastRunAt: typeof value.lastRunAt === "string" ? value.lastRunAt : null,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    lastError: typeof value.lastError === "string" ? value.lastError : null,
    cursor: value.cursor && typeof value.cursor === "object" && !Array.isArray(value.cursor)
      && typeof value.cursor.createdAt === "string" && typeof value.cursor.id === "string"
      ? { createdAt: value.cursor.createdAt, id: value.cursor.id }
      : null,
  };
}

async function writeOpportunitycardScoreRepairState(prisma, value) {
  await prisma.globalSetting.upsert({
    where: { key: OPPORTUNITYCARD_SCORE_REPAIR_SETTING_KEY },
    create: {
      key: OPPORTUNITYCARD_SCORE_REPAIR_SETTING_KEY,
      value,
    },
    update: {
      value,
    },
  });
}

async function runOpportunitycardScoreRepairPass() {
  const existing = await readOpportunitycardScoreRepairState(prisma);
  if (existing?.completedAt) return existing;
  const startedAt = existing?.startedAt || new Date().toISOString();
  let latestState = {
    version: 1,
    status: "RUNNING",
    processed: Number(existing?.processed || 0),
    updated: Number(existing?.updated || 0),
    lastBatchProcessed: 0,
    lastBatchUpdated: 0,
    batchesProcessed: Number(existing?.batchesProcessed || 0),
    startedAt,
    lastRunAt: new Date().toISOString(),
    completedAt: null,
    lastError: null,
    cursor: existing?.cursor || null,
  };

  await writeOpportunitycardScoreRepairState(prisma, latestState);

  await updateProgress(prisma, {
    state: "running",
    stage: "STARTUP_OPPORTUNITYCARD_REPAIR",
    currentCompany: null,
    activeTask: "Repairing historical opportunitycard score contract drift",
  });

  try {
    const result = await repairOpportunitycards(prisma, {
      batchSize: OPPORTUNITYCARD_SCORE_REPAIR_BATCH_SIZE,
      maxBatches: OPPORTUNITYCARD_SCORE_REPAIR_MAX_BATCHES_PER_PASS,
      startAfter: existing?.cursor || null,
      onProgress: async ({ processed, updated, batchProcessed, batchUpdated, batchesProcessed, completed, cursor, touchedCompanyIds }) => {
        console.log(
          `[STARTUP_REPAIR] opportunitycards processed=${processed} updated=${updated} batches=${batchesProcessed}`,
        );
        for (const companyId of touchedCompanyIds) {
          await refreshCompanyIntelligenceSnapshot(prisma, companyId);
        }
        latestState = {
          version: 1,
          status: completed ? "COMPLETED" : "PENDING",
          processed: Number(existing?.processed || 0) + processed,
          updated: Number(existing?.updated || 0) + updated,
          lastBatchProcessed: batchProcessed,
          lastBatchUpdated: batchUpdated,
          batchesProcessed: Number(existing?.batchesProcessed || 0) + batchesProcessed,
          startedAt,
          lastRunAt: new Date().toISOString(),
          completedAt: completed ? new Date().toISOString() : null,
          lastError: null,
          cursor,
        };
        await writeOpportunitycardScoreRepairState(prisma, latestState);
      },
    });
    if (result.processed === 0 || (result.completed && latestState.completedAt === null)) {
      latestState = {
        version: 1,
        status: result.completed ? "COMPLETED" : "PENDING",
        processed: Number(existing?.processed || 0) + result.processed,
        updated: Number(existing?.updated || 0) + result.updated,
        lastBatchProcessed: result.processed,
        lastBatchUpdated: result.updated,
        batchesProcessed: Number(existing?.batchesProcessed || 0) + result.batchesProcessed,
        startedAt,
        lastRunAt: new Date().toISOString(),
        completedAt: result.completed ? new Date().toISOString() : null,
        lastError: null,
        cursor: result.cursor,
      };
      await writeOpportunitycardScoreRepairState(prisma, latestState);
    }
    return latestState;
  } catch (error) {
    const failedState = {
      version: 1,
      status: "FAILED",
      processed: Number(existing?.processed || 0),
      updated: Number(existing?.updated || 0),
      lastBatchProcessed: 0,
      lastBatchUpdated: 0,
      batchesProcessed: Number(existing?.batchesProcessed || 0),
      startedAt,
      lastRunAt: new Date().toISOString(),
      completedAt: null,
      lastError: error?.message || String(error),
      cursor: existing?.cursor || null,
    };
    await writeOpportunitycardScoreRepairState(prisma, failedState);
    throw error;
  }
}

async function runStartupIntegrityPass() {
  await runOpportunitycardScoreRepairPass();

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
    const hasLease = await ensureLinearWorkerLock();
    if (!hasLease) {
      isRunning = false;
      setTimeout(() => {
        void runWorkerLoop();
      }, POLLING_INTERVAL);
      return;
    }

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

setInterval(() => {
  void ensureLinearWorkerLock().catch((error) => {
    console.warn(`[SCHEDULER] Failed to renew linear worker lock: ${error.message}`);
  });
}, LOCK_RENEW_INTERVAL_MS);

process.on("SIGINT", () => {
  void releaseLinearWorkerLockIfOwned().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void releaseLinearWorkerLockIfOwned().finally(() => process.exit(0));
});

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
