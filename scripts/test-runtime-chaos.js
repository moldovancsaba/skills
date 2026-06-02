"use strict";

const assert = require("node:assert/strict");

const {
  detectStaleRunningJobs,
  findDecompositionAnomalies,
  buildRuntimeVerificationReport,
} = require("./lib/runtime/verification");

function main() {
  const now = new Date("2026-05-18T12:00:00.000Z").getTime();

  const staleRunningJobs = detectStaleRunningJobs([
    {
      id: "job-stale",
      status: "RUNNING",
      lastTriedAt: "2026-05-18T11:40:00.000Z",
    },
    {
      id: "job-fresh",
      status: "RUNNING",
      lastTriedAt: "2026-05-18T11:55:00.000Z",
    },
  ], now, 10 * 60 * 1000);
  assert.deepEqual(
    staleRunningJobs.map((job) => job.id),
    ["job-stale"],
    "stale-job drill must flag only RUNNING jobs beyond the no-progress timeout",
  );

  const anomalies = findDecompositionAnomalies([
    {
      id: "parent-1",
      entityType: "COMPANY",
      metadata: { decomposition: { state: "DECOMPOSED", childSignal: "decomp:parent-1" } },
    },
    {
      id: "child-1",
      entityType: "PIPELINE_SLICE",
      metadata: { parentJobId: "missing-parent", executionOptions: { selectionOffset: 0 } },
    },
    {
      id: "child-2",
      entityType: "PIPELINE_SLICE",
      metadata: { parentJobId: "parent-1", executionOptions: { selectionOffset: 1 } },
    },
    {
      id: "child-3",
      entityType: "PIPELINE_SLICE",
      metadata: { parentJobId: "parent-1", executionOptions: { selectionOffset: 1 } },
    },
    {
      id: "burst-child-1",
      entityType: "PIPELINE_SLICE",
      sourceSignal: "human-approved-burst:burst-1",
      metadata: {
        lane: "HUMAN_APPROVED_BURST_CHILD",
        parentBurstId: "burst-1",
        executionOptions: { selectionOffset: 0 },
      },
    },
  ]);
  assert.equal(
    anomalies.some((entry) => entry.type === "ORPHAN_CHILD"),
    true,
    "chaos drill must catch orphan child slices",
  );
  assert.equal(
    anomalies.some((entry) => entry.type === "DUPLICATE_CHILD_OFFSET"),
    true,
    "chaos drill must catch duplicate child offsets under one parent",
  );
  assert.equal(
    anomalies.some((entry) => entry.jobId === "burst-child-1"),
    false,
    "human-approved burst child shards must not be treated as low-memory decomposition orphans",
  );

  const mismatchReport = buildRuntimeVerificationReport({
    workerHealth: {
      progress: {
        state: "running",
        stage: "PIPELINE_QUEUE",
        activeTask: "Refresh flashcards for Alpha",
        currentCompany: "Alpha",
      },
      settings: {
        buildIdentity: {
          gitSha: "worker-sha",
          matchesOriginMain: true,
          gitDirty: false,
        },
      },
    },
    statusPayload: {
      worker: {
        stage: "IDLE",
        activeTask: "Waiting for the next planner cycle",
        currentCompany: null,
        settings: {
          buildIdentity: {
            gitSha: "status-sha",
          },
        },
      },
      backgroundWorker: {
        settings: {
          buildIdentity: {
            gitSha: "snapshot-sha",
            matchesOriginMain: true,
            gitDirty: false,
          },
        },
      },
      queue: {
        runningJobs: 2,
        totalActiveJobs: 10,
        failedJobs: 1,
        pausedJobs: 0,
      },
    },
    snapshotHealth: {
      progress: {
        state: "idle",
        stage: "PAUSED_FOREGROUND_BACKLOG",
        activeTask: "Waiting for foreground queue",
        settings: {
          buildIdentity: {
            gitSha: "snapshot-sha",
            matchesOriginMain: true,
            gitDirty: false,
          },
        },
      },
    },
    heartbeat: {
      lastHealthAt: "2026-05-18T12:00:00.000Z",
    },
    queueJobs: [
      {
        id: "job-stale",
        companyId: "company-1",
        jobType: "REFRESH_FLASHCARDS",
        entityType: "COMPANY",
        status: "RUNNING",
        lastTriedAt: "2026-05-18T11:40:00.000Z",
        metadata: {},
      },
    ],
  });

  assert.equal(mismatchReport.summary.ok, false, "mismatch drill must fail the verification report");
  assert.equal(
    mismatchReport.failingCheckIds.includes("status-worker-truth-aligned"),
    true,
    "mismatch drill must catch worker/status truth disagreement",
  );
  assert.equal(
    mismatchReport.failingCheckIds.includes("build-identity-agreement"),
    true,
    "mismatch drill must catch build identity disagreement",
  );
  assert.equal(
    mismatchReport.failingCheckIds.includes("single-running-job"),
    true,
    "mismatch drill must catch multi-running queue state",
  );

  console.log("Runtime chaos drills passed.");
}

try {
  main();
} catch (error) {
  console.error("[test-runtime-chaos] failed:", error);
  process.exit(1);
}
