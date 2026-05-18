"use strict";

const MEMORY_GOVERNOR_ACTIONS = Object.freeze({
  NONE: "NONE",
  EVICT_OLLAMA_AND_WAKE: "EVICT_OLLAMA_AND_WAKE",
  EVICT_OLLAMA_AND_RESTART_WORKER: "EVICT_OLLAMA_AND_RESTART_WORKER",
});

const OLLAMA_IDLE_EVICT_MB = 700;
const OLLAMA_FORCE_EVICT_MB = 450;
const MEMORY_GOVERNOR_COOLDOWN_MS = 5 * 60 * 1000;

function isWorkerActivelyUsingModel(progress = {}) {
  if (progress.state !== "running") return false;

  const task = String(progress.activeTask || "").trim();
  const stage = String(progress.stage || "").trim();

  if (!task) return false;
  if (stage === "IDLE" || stage === "PAUSED_LOW_MEMORY") return false;
  if (/Scanning pipeline queue/i.test(task)) return false;
  if (/Waiting for the next planner cycle/i.test(task)) return false;
  if (/paused due to .*memory pressure/i.test(task)) return false;

  return true;
}

function decideMemoryGovernorAction({
  freeMemMb,
  runnerPresent,
  workerProgress = {},
}) {
  if (!runnerPresent) {
    return { action: MEMORY_GOVERNOR_ACTIONS.NONE, reason: "no-ollama-runner" };
  }

  const free = Number(freeMemMb || 0);
  const workerBusy = isWorkerActivelyUsingModel(workerProgress);

  if (free <= OLLAMA_FORCE_EVICT_MB) {
    return {
      action: workerBusy
        ? MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_RESTART_WORKER
        : MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_WAKE,
      reason: workerBusy ? "force-evict-busy-worker" : "force-evict-idle-worker",
    };
  }

  if (free <= OLLAMA_IDLE_EVICT_MB && !workerBusy) {
    return {
      action: MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_WAKE,
      reason: "idle-evict-low-memory",
    };
  }

  return { action: MEMORY_GOVERNOR_ACTIONS.NONE, reason: "memory-acceptable" };
}

module.exports = {
  MEMORY_GOVERNOR_ACTIONS,
  MEMORY_GOVERNOR_COOLDOWN_MS,
  OLLAMA_IDLE_EVICT_MB,
  OLLAMA_FORCE_EVICT_MB,
  isWorkerActivelyUsingModel,
  decideMemoryGovernorAction,
};
