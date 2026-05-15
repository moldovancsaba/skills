"use strict";

const { getWorkerBuildIdentity } = require("../planner/telemetry");

const SNAPSHOT_WORKER_PROGRESS_KEY = "local_ai_snapshot_worker_progress";

const snapshotWorkerState = {
  state: "idle",
  stage: "IDLE",
  activeTask: "Waiting for snapshot work",
  currentCompany: null,
  cycleCount: 0,
  lastProgressAt: null,
  metrics: {},
  settings: null,
};

async function collectSnapshotWorkerSettings() {
  return {
    supervisorContractVersion: 3,
    schedulingMode: "background-snapshot-worker",
    buildIdentity: getWorkerBuildIdentity(),
  };
}

async function updateSnapshotWorkerProgress(prisma, updates = {}) {
  Object.assign(snapshotWorkerState, updates, {
    lastProgressAt: new Date().toISOString(),
  });

  try {
    const settings = await collectSnapshotWorkerSettings();
    snapshotWorkerState.settings = settings;
    await prisma.globalSetting.upsert({
      where: { key: SNAPSHOT_WORKER_PROGRESS_KEY },
      create: { key: SNAPSHOT_WORKER_PROGRESS_KEY, value: { ...snapshotWorkerState, settings } },
      update: { value: { ...snapshotWorkerState, settings }, updatedAt: new Date() },
    });
  } catch (error) {
    console.error("[SNAPSHOT PROGRESS] Sync failed:", error.message);
  }
}

function getSnapshotWorkerProgress() {
  return { ...snapshotWorkerState };
}

module.exports = {
  SNAPSHOT_WORKER_PROGRESS_KEY,
  updateSnapshotWorkerProgress,
  getSnapshotWorkerProgress,
  collectSnapshotWorkerSettings,
};
