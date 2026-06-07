"use strict";

const path = require("path");
const fs = require("fs");
const { PIPELINE_JOB_NO_PROGRESS_TIMEOUT_MS } = require("../../../src/lib/pipeline-queue");
const { pathToFileURL } = require("url");

let localRunnableInventoryLoader = null;

async function loadLocalRunnableInventoryModule() {
  if (localRunnableInventoryLoader) {
    return localRunnableInventoryLoader;
  }

  const modulePath = path.resolve(__dirname, "..", "..", "local-runnable-inventory.mjs");
  localRunnableInventoryLoader = import(pathToFileURL(modulePath).href);
  return localRunnableInventoryLoader;
}

async function collectLocalRunnableAudit() {
  try {
    const module = await loadLocalRunnableInventoryModule();
    const inventory = module.buildLocalRunnableInventory();
    const failures = module.validateLocalRunnableInventory(inventory);
    const laneCounts = inventory.reduce((accumulator, item) => {
      const lane = item.lane || "UNKNOWN";
      return {
        ...accumulator,
        [lane]: (accumulator[lane] || 0) + 1,
      };
    }, {});
    const forbidden = inventory
      .filter((item) => item.lane === "FORBIDDEN_BYPASS")
      .map((item) => ({ id: item.id, migrationTarget: item.migrationTarget }));
    return {
      ok: failures.length === 0 && forbidden.length === 0,
      inventoryCount: inventory.length,
      failures,
      laneCounts,
      forbidden,
      hasForbiddenBypass: forbidden.length > 0,
      isValid: failures.length === 0,
      timeoutAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      inventoryCount: 0,
      failures: [`local-runnable-inventory audit failed to run: ${error?.message || String(error)}`],
      laneCounts: {},
      forbidden: [],
      hasForbiddenBypass: false,
      isValid: false,
      timeoutAt: new Date().toISOString(),
    };
  }
}

const RUNTIME_VERIFICATION_STATE_KEY = "local_ai_runtime_verification_last_run";
const RUNTIME_VERIFICATION_INTERVAL_MS = 6 * 60 * 60 * 1000;
const WORKER_HEALTH_URL = "http://127.0.0.1:10005/health";
const STATUS_API_URL = "http://127.0.0.1:10006/api/status";
const SNAPSHOT_HEALTH_URL = "http://127.0.0.1:10007/health";
const HEARTBEAT_FILE = path.join(__dirname, "..", "..", "logs", "guardian-heartbeat.json");

function buildVerificationCheck(id, ok, summary, details = null) {
  return { id, ok: Boolean(ok), summary, details };
}

function summarizeVerificationChecks(checks = []) {
  const totalChecks = checks.length;
  const failedChecks = checks.filter((check) => !check.ok).length;
  return {
    ok: failedChecks === 0,
    totalChecks,
    passedChecks: totalChecks - failedChecks,
    failedChecks,
  };
}

function readGuardianHeartbeatFile() {
  try {
    return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "checklist-runtime-verification" } });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function detectStaleRunningJobs(jobs = [], now = Date.now(), timeoutMs = PIPELINE_JOB_NO_PROGRESS_TIMEOUT_MS) {
  return jobs.filter((job) => {
    if (job.status !== "RUNNING") return false;
    const lastTriedAt = job.lastTriedAt ? new Date(job.lastTriedAt).getTime() : 0;
    return !lastTriedAt || now - lastTriedAt > timeoutMs;
  });
}

function findDecompositionAnomalies(jobs = []) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const childJobs = jobs.filter((job) => {
    if (String(job.entityType || "") !== "PIPELINE_SLICE") return false;
    const metadata = job?.metadata || {};
    if (typeof metadata.parentJobId === "string" && metadata.parentJobId) return true;
    if (String(job.sourceSignal || "").startsWith("decomp:")) return true;
    return metadata?.decomposition?.state === "ACTIVE_CHILD";
  });
  const parentJobs = jobs.filter((job) => job?.metadata?.decomposition?.state === "DECOMPOSED");
  const anomalies = [];

  for (const child of childJobs) {
    const parentId = child?.metadata?.parentJobId;
    if (!parentId || !byId.has(parentId)) {
      anomalies.push({
        type: "ORPHAN_CHILD",
        jobId: child.id,
        parentJobId: parentId || null,
      });
    }
  }

  for (const parent of parentJobs) {
    const expectedSignal = parent?.metadata?.decomposition?.childSignal || null;
    const activeChildren = childJobs.filter((job) => job?.metadata?.parentJobId === parent.id);
    if (activeChildren.length === 0) {
      anomalies.push({
        type: "PARENT_WITHOUT_CHILDREN",
        jobId: parent.id,
        childSignal: expectedSignal,
      });
    }
  }

  const offsetBuckets = new Map();
  for (const child of childJobs) {
    const parentId = child?.metadata?.parentJobId;
    const selectionOffset = Number(child?.metadata?.executionOptions?.selectionOffset ?? -1);
    if (!parentId || selectionOffset < 0) continue;
    const key = `${parentId}:${selectionOffset}`;
    offsetBuckets.set(key, (offsetBuckets.get(key) || 0) + 1);
  }
  for (const [key, count] of offsetBuckets.entries()) {
    if (count > 1) {
      const [parentJobId, selectionOffset] = key.split(":");
      anomalies.push({
        type: "DUPLICATE_CHILD_OFFSET",
        parentJobId,
        selectionOffset: Number(selectionOffset),
        count,
      });
    }
  }

  return anomalies;
}

function normalizeRuntimeActiveTask(stage, activeTask) {
  if (stage === "IDLE" && /Waiting for the next planner cycle/i.test(String(activeTask || ""))) {
    return null;
  }
  return activeTask || null;
}

function buildRuntimeVerificationReport({
  workerHealth,
  statusPayload,
  snapshotHealth,
  heartbeat,
  queueJobs = [],
  localRunnableInventory = {
    isValid: true,
    hasForbiddenBypass: false,
    failures: [],
    forbidden: [],
    inventoryCount: 0,
  },
}) {
  const checks = [];
  const workerProgress = workerHealth?.progress || {};
  const workerBuild = workerHealth?.settings?.buildIdentity || {};
  const statusWorker = statusPayload?.worker || {};
  const statusGuardian = statusPayload?.guardian || {};
  const statusQueue = statusPayload?.queue || {};
  const snapshotProgress = snapshotHealth?.progress || {};
  const snapshotBuild = snapshotProgress?.settings?.buildIdentity || statusPayload?.backgroundWorker?.settings?.buildIdentity || {};
  const statusBuild = statusWorker?.settings?.buildIdentity || {};
  const now = Date.now();
  const staleRunningJobs = detectStaleRunningJobs(queueJobs, now);
  const decompositionAnomalies = findDecompositionAnomalies(queueJobs);
  const normalizedWorkerTask = normalizeRuntimeActiveTask(workerProgress?.stage, workerProgress?.activeTask);
  const normalizedStatusTask = normalizeRuntimeActiveTask(statusWorker?.stage, statusWorker?.activeTask);

  checks.push(
    buildVerificationCheck(
      "worker-health-reachable",
      Boolean(workerHealth?.progress),
      "Foreground worker health endpoint returned structured progress.",
      workerHealth ? { hasProgress: Boolean(workerHealth.progress) } : null,
    ),
  );

  checks.push(
    buildVerificationCheck(
      "snapshot-health-reachable",
      Boolean(snapshotHealth?.progress),
      "Snapshot worker health endpoint returned structured progress.",
      snapshotHealth ? { hasProgress: Boolean(snapshotHealth.progress) } : null,
    ),
  );

  checks.push(
    buildVerificationCheck(
      "status-endpoint-reachable",
      Boolean(statusPayload?.worker && statusPayload?.queue),
      "Status server returned worker and queue payloads.",
      statusPayload ? { hasWorker: Boolean(statusPayload.worker), hasQueue: Boolean(statusPayload.queue) } : null,
    ),
  );

  checks.push(
    buildVerificationCheck(
      "worker-build-clean",
      workerBuild.matchesOriginMain === true && workerBuild.gitDirty === false,
      "Foreground worker build identity matches origin/main and is clean.",
      workerBuild,
    ),
  );

  checks.push(
    buildVerificationCheck(
      "snapshot-build-clean",
      snapshotBuild.matchesOriginMain === true && snapshotBuild.gitDirty === false,
      "Snapshot worker build identity matches origin/main and is clean.",
      snapshotBuild,
    ),
  );

  checks.push(
    buildVerificationCheck(
      "build-identity-agreement",
      Boolean(workerBuild?.gitSha)
        && workerBuild?.gitSha === snapshotBuild?.gitSha
        && workerBuild?.gitSha === statusBuild?.gitSha,
      "Foreground worker, snapshot worker, and status payload agree on the runtime build identity.",
      {
        workerGitSha: workerBuild?.gitSha || null,
        snapshotGitSha: snapshotBuild?.gitSha || null,
        statusGitSha: statusBuild?.gitSha || null,
      },
    ),
  );

  checks.push(
    buildVerificationCheck(
      "status-worker-truth-aligned",
      statusWorker?.stage === workerProgress?.stage
        && normalizedStatusTask === normalizedWorkerTask
        && (statusWorker?.currentCompany || null) === (workerProgress?.currentCompany || null)
        && (statusWorker?.currentJobId || null) === (workerProgress?.currentJobId || null)
        && (statusWorker?.currentJobType || null) === (workerProgress?.currentJobType || null),
      "Status server agrees with foreground worker stage, active task, company, and current queue job.",
      {
        workerStage: workerProgress?.stage || null,
        workerTask: normalizedWorkerTask,
        workerCompany: workerProgress?.currentCompany || null,
        statusStage: statusWorker?.stage || null,
        statusTask: normalizedStatusTask,
        statusCompany: statusWorker?.currentCompany || null,
        workerJobId: workerProgress?.currentJobId || null,
        workerJobType: workerProgress?.currentJobType || null,
        statusJobId: statusWorker?.currentJobId || null,
        statusJobType: statusWorker?.currentJobType || null,
      },
    ),
  );

  checks.push(
    buildVerificationCheck(
      "single-running-job",
      Number(statusQueue?.runningJobs || 0) <= 1,
      "At most one foreground queue job is marked RUNNING.",
      { runningJobs: Number(statusQueue?.runningJobs || 0) },
    ),
  );

  checks.push(
    buildVerificationCheck(
      "no-stale-running-jobs",
      staleRunningJobs.length === 0,
      "No RUNNING jobs exceed the no-progress timeout budget.",
      staleRunningJobs.map((job) => ({
        id: job.id,
        jobType: job.jobType,
        companyId: job.companyId,
        lastTriedAt: job.lastTriedAt || null,
      })),
    ),
  );

  checks.push(
    buildVerificationCheck(
      "decomposition-consistency",
      decompositionAnomalies.length === 0,
      "Decomposed parent/child job topology is internally consistent.",
      decompositionAnomalies,
    ),
  );

  checks.push(
    buildVerificationCheck(
      "heartbeat-fresh",
      Boolean(heartbeat?.lastHealthAt || statusGuardian?.lastHealthAt),
      "Guardian heartbeat is present.",
      {
        directHeartbeatAt: heartbeat?.lastHealthAt || null,
        statusHeartbeatAt: statusGuardian?.lastHealthAt || null,
        memoryGovernor: heartbeat?.memoryGovernor || statusGuardian?.memoryGovernor || null,
      },
    ),
  );

  checks.push(
    buildVerificationCheck(
      "local-runnable-inventory-valid",
      localRunnableInventory?.isValid === true,
      "All local runnables must pass lane contract checks.",
      {
        inventoryCount: localRunnableInventory?.inventoryCount || 0,
        failures: localRunnableInventory?.failures || [],
      },
    ),
  );

  checks.push(
    buildVerificationCheck(
      "local-runnable-no-forbidden-bypass",
      localRunnableInventory?.hasForbiddenBypass === false,
      "No local runnables may remain in forbidden bypass mode.",
      {
        forbiddenCount: localRunnableInventory?.forbidden?.length || 0,
        forbidden: localRunnableInventory?.forbidden || [],
      },
    ),
  );

  const summary = summarizeVerificationChecks(checks);
  return {
    mode: "live",
    ts: new Date().toISOString(),
    summary,
    failingCheckIds: checks.filter((check) => !check.ok).map((check) => check.id),
    checks,
    snapshot: {
      worker: {
        state: workerProgress?.state || null,
        stage: workerProgress?.stage || null,
        activeTask: workerProgress?.activeTask || null,
        currentCompany: workerProgress?.currentCompany || null,
        currentJobId: workerProgress?.currentJobId || null,
        currentJobType: workerProgress?.currentJobType || null,
      },
      backgroundWorker: {
        state: snapshotProgress?.state || null,
        stage: snapshotProgress?.stage || null,
        activeTask: snapshotProgress?.activeTask || null,
      },
      queue: {
        runningJobs: Number(statusQueue?.runningJobs || 0),
        totalActiveJobs: Number(statusQueue?.totalActiveJobs || 0),
        failedJobs: Number(statusQueue?.failedJobs || 0),
        pausedJobs: Number(statusQueue?.pausedJobs || 0),
      },
    },
  };
}

async function collectRuntimeVerificationInputs(prisma) {
  const [workerHealth, statusPayload, snapshotHealth, heartbeat, queueJobs, localRunnableInventory] = await Promise.all([
    fetchJson(WORKER_HEALTH_URL),
    fetchJson(STATUS_API_URL),
    fetchJson(SNAPSHOT_HEALTH_URL),
    Promise.resolve(readGuardianHeartbeatFile()),
    prisma.pipelineJob.findMany({
      where: { status: { in: ["ACTIVE", "RUNNING", "FAILED", "PAUSED"] } },
      select: {
        id: true,
        companyId: true,
        jobType: true,
        entityType: true,
        status: true,
        lastTriedAt: true,
        metadata: true,
      },
    }),
    collectLocalRunnableAudit(),
  ]);

  return {
    workerHealth,
    statusPayload,
    snapshotHealth,
    heartbeat,
    queueJobs,
    localRunnableInventory,
  };
}

async function persistRuntimeVerificationReport(prisma, report) {
  await prisma.globalSetting.upsert({
    where: { key: RUNTIME_VERIFICATION_STATE_KEY },
    create: { key: RUNTIME_VERIFICATION_STATE_KEY, value: report },
    update: { value: report, updatedAt: new Date() },
  });
}

async function runRuntimeVerification(prisma, options = {}) {
  const inputs = await collectRuntimeVerificationInputs(prisma);
  const report = buildRuntimeVerificationReport(inputs);
  report.mode = typeof options.mode === "string" ? options.mode : report.mode;
  report.trigger = typeof options.trigger === "string" ? options.trigger : "manual";
  await persistRuntimeVerificationReport(prisma, report);
  return report;
}

async function runRuntimeVerificationIfDue(prisma, options = {}) {
  const intervalMs = Number.isFinite(options.intervalMs) ? Number(options.intervalMs) : RUNTIME_VERIFICATION_INTERVAL_MS;
  const existing = await prisma.globalSetting.findUnique({
    where: { key: RUNTIME_VERIFICATION_STATE_KEY },
    select: { value: true, updatedAt: true },
  });
  const lastRunAt = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
  if (lastRunAt > 0 && Date.now() - lastRunAt < intervalMs) {
    return null;
  }
  return runRuntimeVerification(prisma, options);
}

module.exports = {
  RUNTIME_VERIFICATION_STATE_KEY,
  RUNTIME_VERIFICATION_INTERVAL_MS,
  detectStaleRunningJobs,
  findDecompositionAnomalies,
  buildRuntimeVerificationReport,
  collectRuntimeVerificationInputs,
  persistRuntimeVerificationReport,
  runRuntimeVerification,
  runRuntimeVerificationIfDue,
};
