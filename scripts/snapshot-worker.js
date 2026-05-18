const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { refreshIntelligenceSnapshotSlice } = require("./lib/intelligence-snapshot");
const { syncAllCompanyPipelineJobsIfDue, syncDirtyCompanyPipelineJobs } = require("../src/lib/pipeline-queue");
const {
  getFreeMemoryMb,
  getResourceBand,
  shouldAllowBackgroundSnapshotWork,
} = require("./lib/runtime/resource-bands");
const {
  getSnapshotWorkerProgress,
  updateSnapshotWorkerProgress,
} = require("./lib/runtime/background-progress");
const {
  runRuntimeVerificationIfDue,
} = require("./lib/runtime/verification");
const packageJson = require("../package.json");

const prisma = new PrismaClient();
const PORT = 10007;
const APP_VERSION = packageJson.version;

const ACTIVE_INTERVAL = 60_000;
const IDLE_INTERVAL = 5 * 60 * 1000;
const POLLING_INTERVAL = 30_000;
const SNAPSHOT_BATCH_SIZE = 2;

let isRunning = false;
let wakeRequested = false;

setInterval(async () => {
  await updateSnapshotWorkerProgress(prisma);
}, 60_000);

async function shouldYieldToForeground() {
  const [runningJobs, activeJobs] = await Promise.all([
    prisma.pipelineJob.count({ where: { status: "RUNNING" } }),
    prisma.pipelineJob.count({ where: { status: "ACTIVE" } }),
  ]);

  return {
    shouldYield: runningJobs > 0 || activeJobs > 0,
    runningJobs,
    activeJobs,
  };
}

async function runSnapshotLoop() {
  if (isRunning) return;
  isRunning = true;

  try {
    wakeRequested = false;
    const freeMemMb = getFreeMemoryMb();
    const memoryDecision = shouldAllowBackgroundSnapshotWork(freeMemMb);
    const resourceBand = getResourceBand(freeMemMb);

    if (!memoryDecision.allowed) {
      await updateSnapshotWorkerProgress(prisma, {
        state: "idle",
        stage: "PAUSED_LOW_MEMORY",
        activeTask: `Snapshot refresh paused due to ${resourceBand} memory pressure (${freeMemMb}MB free)`,
        currentCompany: null,
        metrics: { freeMemMb, resourceBand },
      });
      const targetWakeTime = Date.now() + IDLE_INTERVAL;
      while (Date.now() < targetWakeTime) {
        if (wakeRequested) break;
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      }
      isRunning = false;
      void runSnapshotLoop();
      return;
    }

    const foregroundDecision = await shouldYieldToForeground();
    if (foregroundDecision.shouldYield) {
      await updateSnapshotWorkerProgress(prisma, {
        state: "idle",
        stage: "PAUSED_FOREGROUND_BACKLOG",
        activeTask: `Snapshot refresh paused while foreground queue has ${foregroundDecision.runningJobs} running and ${foregroundDecision.activeJobs} active job(s)`,
        currentCompany: null,
        metrics: {
          freeMemMb,
          resourceBand,
          runningJobs: foregroundDecision.runningJobs,
          activeJobs: foregroundDecision.activeJobs,
        },
      });
      const targetWakeTime = Date.now() + IDLE_INTERVAL;
      while (Date.now() < targetWakeTime) {
        if (wakeRequested) break;
        await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
      }
      isRunning = false;
      void runSnapshotLoop();
      return;
    }

    await updateSnapshotWorkerProgress(prisma, {
      state: "running",
      stage: "QUEUE_SYNC",
      activeTask: "Refreshing background pipeline sync state",
      currentCompany: null,
      metrics: { freeMemMb, resourceBand, batchSize: SNAPSHOT_BATCH_SIZE },
    });

    const targetedSyncResult = await syncDirtyCompanyPipelineJobs(prisma, {
      trigger: "snapshot-worker",
      limit: SNAPSHOT_BATCH_SIZE,
    });
    const didSyncQueue = await syncAllCompanyPipelineJobsIfDue(prisma);

    const snapshotResult = await refreshIntelligenceSnapshotSlice(prisma, {
      batchSize: SNAPSHOT_BATCH_SIZE,
    });

    const verificationResult = await runRuntimeVerificationIfDue(prisma, {
      mode: "scheduled",
      trigger: "snapshot-worker",
    });

    await updateSnapshotWorkerProgress(prisma, {
      state: "idle",
      stage: "IDLE",
      activeTask: `Refreshed intelligence snapshots for ${snapshotResult.refreshedCompanies} compan${snapshotResult.refreshedCompanies === 1 ? "y" : "ies"}`,
      currentCompany: null,
      cycleCount: Number(getSnapshotWorkerProgress().cycleCount || 0) + 1,
      metrics: {
        freeMemMb,
        resourceBand,
        targetedQueueSyncs: targetedSyncResult.syncedCompanies,
        dirtyCompaniesRemaining: targetedSyncResult.dirtyCompaniesRemaining,
        didSyncQueue,
        refreshedCompanies: snapshotResult.refreshedCompanies,
        wrapped: snapshotResult.wrapped,
        verificationRan: Boolean(verificationResult),
        verificationOk: verificationResult?.summary?.ok ?? null,
      },
    });

    const targetWakeTime = Date.now() + ACTIVE_INTERVAL;
    while (Date.now() < targetWakeTime) {
      if (wakeRequested) break;
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
    }

    isRunning = false;
    void runSnapshotLoop();
  } catch (error) {
    console.error("[CRITICAL] Snapshot Worker Failure:", error);
    isRunning = false;
    await updateSnapshotWorkerProgress(prisma, {
      state: "idle",
      stage: "ERROR",
      activeTask: "Snapshot worker failed",
      currentCompany: null,
      metrics: {
        ...getSnapshotWorkerProgress().metrics,
        lastError: error.message,
      },
    });
    setTimeout(() => {
      void runSnapshotLoop();
    }, 60_000);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    const progress = getSnapshotWorkerProgress();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ progress }));
    return;
  }

  if (req.url === "/force" && req.method === "POST") {
    wakeRequested = true;
    if (!isRunning) {
      void runSnapshotLoop();
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ACCEPTED", wakeRequested: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, async () => {
  console.log(`checklist snapshot worker v${APP_VERSION} active on port ${PORT}`);
  await updateSnapshotWorkerProgress(prisma, {
    state: "idle",
    stage: "BOOTING",
    activeTask: "Booting snapshot worker",
    currentCompany: null,
  });
  void runSnapshotLoop();
});
