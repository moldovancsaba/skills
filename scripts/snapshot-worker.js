const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { applyRunnerIdentity } = require("./lib/runtime/runner-registry");
const {
  markCompanyProjectionDirty,
  refreshMissingProjectionSnapshots,
  refreshDirtyCompanyIntelligenceSnapshots,
  refreshIntelligenceSnapshotSlice,
} = require("./lib/intelligence-snapshot");
const { syncAllCompanyPipelineJobsIfDue, syncDirtyCompanyPipelineJobs } = require("../src/lib/pipeline-queue");
const { maintainLifecycleShard } = require("../src/lib/check-lifecycle/maintenance-engine");
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

const RUNNER = applyRunnerIdentity("check.local.snapshot-worker");
const prisma = new PrismaClient();
const PORT = 10007;
const APP_VERSION = packageJson.version;

const ACTIVE_INTERVAL = 60_000;
const IDLE_INTERVAL = 5 * 60 * 1000;
const POLLING_INTERVAL = 30_000;
const SNAPSHOT_BATCH_SIZE = 2;
const FOREGROUND_ACTIVE_QUEUE_BACKLOG_THRESHOLD = 24;

let isRunning = false;
let wakeRequested = false;

setInterval(async () => {
  await updateSnapshotWorkerProgress(prisma);
}, 60_000);

async function shouldYieldToForeground() {
  const [runningJobs, activeJobs, runnableActiveJobs, humanGuidedActiveJobs] = await Promise.all([
    prisma.pipelineJob.count({ where: { status: "RUNNING" } }),
    prisma.pipelineJob.count({ where: { status: "ACTIVE" } }),
    prisma.pipelineJob.count({
      where: {
        status: "ACTIVE",
        queueColumn: { in: ["NOW", "SOON", "LATER"] },
      },
    }),
    prisma.pipelineJob.count({
      where: {
        status: "ACTIVE",
        controlMode: "HUMAN_GUIDED",
      },
    }),
  ]);

  return {
    shouldYield: runningJobs > 0 || runnableActiveJobs > FOREGROUND_ACTIVE_QUEUE_BACKLOG_THRESHOLD,
    runningJobs,
    activeJobs,
    runnableActiveJobs,
    humanGuidedActiveJobs,
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
        activeTask: `Snapshot refresh paused while foreground queue has ${foregroundDecision.runningJobs} running and ${foregroundDecision.runnableActiveJobs} runnable active job(s)`,
        currentCompany: null,
        metrics: {
          freeMemMb,
          resourceBand,
          runningJobs: foregroundDecision.runningJobs,
          activeJobs: foregroundDecision.activeJobs,
          runnableActiveJobs: foregroundDecision.runnableActiveJobs,
          humanGuidedActiveJobs: foregroundDecision.humanGuidedActiveJobs,
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
    const lifecycleMaintenanceResult = await maintainLifecycleShard(prisma, {
      trigger: "snapshot-worker",
      limit: SNAPSHOT_BATCH_SIZE,
      actorId: "snapshot-worker",
    });
    for (const entry of Array.isArray(targetedSyncResult.syncedEntries) ? targetedSyncResult.syncedEntries : []) {
      await markCompanyProjectionDirty(prisma, entry.companyId, `topology-sync:${entry.reason || "background-dirty-drain"}`);
    }

    await updateSnapshotWorkerProgress(prisma, {
      state: "running",
      stage: "PROJECTION_BACKFILL",
      activeTask: "Backfilling missing webapp projections",
      currentCompany: null,
      metrics: {
        freeMemMb,
        resourceBand,
        batchSize: SNAPSHOT_BATCH_SIZE,
        targetedQueueSyncs: targetedSyncResult.syncedCompanies,
        dirtyCompaniesRemaining: targetedSyncResult.dirtyCompaniesRemaining,
        lifecycleMaintainedCompanies: lifecycleMaintenanceResult.repairedOrVerified,
        didSyncQueue,
      },
    });

    const projectionBackfillResult = await refreshMissingProjectionSnapshots(prisma, {
      trigger: "snapshot-worker",
      limit: SNAPSHOT_BATCH_SIZE,
    });

    await updateSnapshotWorkerProgress(prisma, {
      state: "running",
      stage: "TARGETED_PROJECTION_REFRESH",
      activeTask: "Refreshing touched-company webapp projections",
      currentCompany: null,
      metrics: {
        freeMemMb,
        resourceBand,
        batchSize: SNAPSHOT_BATCH_SIZE,
        targetedQueueSyncs: targetedSyncResult.syncedCompanies,
        dirtyCompaniesRemaining: targetedSyncResult.dirtyCompaniesRemaining,
        lifecycleMaintainedCompanies: lifecycleMaintenanceResult.repairedOrVerified,
        projectionBackfills: projectionBackfillResult.refreshedCompanies,
        missingProjectionCompaniesRemaining: projectionBackfillResult.remainingCandidates,
        didSyncQueue,
      },
    });

    const targetedProjectionResult = await refreshDirtyCompanyIntelligenceSnapshots(prisma, {
      trigger: "snapshot-worker",
      limit: SNAPSHOT_BATCH_SIZE,
    });

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
        lifecycleMaintainedCompanies: lifecycleMaintenanceResult.repairedOrVerified,
        projectionBackfills: projectionBackfillResult.refreshedCompanies,
        missingProjectionCompaniesRemaining: projectionBackfillResult.remainingCandidates,
        targetedProjectionRefreshes: targetedProjectionResult.refreshedCompanies,
        dirtyProjectionCompaniesRemaining: targetedProjectionResult.dirtyCompaniesRemaining,
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
    res.end(JSON.stringify({ runner: RUNNER, processTitle: process.title, progress }));
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
  console.log(`${RUNNER.humanName} v${APP_VERSION} active on port ${PORT} (${RUNNER.id})`);
  await updateSnapshotWorkerProgress(prisma, {
    state: "idle",
    stage: "BOOTING",
    activeTask: `Booting ${RUNNER.humanName}`,
    currentCompany: null,
  });
  void runSnapshotLoop();
});
