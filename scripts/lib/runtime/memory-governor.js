"use strict";

const MEMORY_GOVERNOR_ACTIONS = Object.freeze({
  NONE: "NONE",
  EVICT_OLLAMA_AND_WAKE: "EVICT_OLLAMA_AND_WAKE",
  EVICT_OLLAMA_AND_RESTART_WORKER: "EVICT_OLLAMA_AND_RESTART_WORKER",
});

const MEMORY_GOVERNOR_POLICY_VERSION = 1;
const MEMORY_GOVERNOR_STATE_KEY = "local_ai_memory_governor_state";
const MEMORY_GOVERNOR_EVENTS_LIMIT = 20;

const DEFAULT_MEMORY_GOVERNOR_POLICY = Object.freeze({
  version: MEMORY_GOVERNOR_POLICY_VERSION,
  cooldownMs: 5 * 60 * 1000,
  protectedProcesses: ["guardian", "sync", "status-server"],
  semiProtectedProcesses: ["snapshot-worker"],
  evictableProcesses: ["ollama-runner"],
  tiers: [
    {
      key: "idle-evict-low-memory",
      maxFreeMemMb: 700,
      sustainMs: 60 * 1000,
      requiresRunnerPresent: true,
      requiresWorkerBusy: false,
      action: MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_WAKE,
    },
    {
      key: "force-evict-busy-worker",
      maxFreeMemMb: 450,
      sustainMs: 20 * 1000,
      requiresRunnerPresent: true,
      requiresWorkerBusy: true,
      action: MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_RESTART_WORKER,
    },
    {
      key: "force-evict-idle-worker",
      maxFreeMemMb: 450,
      sustainMs: 20 * 1000,
      requiresRunnerPresent: true,
      requiresWorkerBusy: false,
      action: MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_WAKE,
    },
  ],
});

function clonePolicy(policy = DEFAULT_MEMORY_GOVERNOR_POLICY) {
  return {
    ...policy,
    protectedProcesses: [...(policy.protectedProcesses || [])],
    semiProtectedProcesses: [...(policy.semiProtectedProcesses || [])],
    evictableProcesses: [...(policy.evictableProcesses || [])],
    tiers: [...(policy.tiers || [])].map((tier) => ({ ...tier })),
  };
}

function normalizeMemoryGovernorPolicy(raw = {}) {
  const base = clonePolicy(DEFAULT_MEMORY_GOVERNOR_POLICY);
  const incoming = raw && typeof raw === "object" ? raw : {};
  const normalized = {
    version: Number.isFinite(incoming.version) ? Number(incoming.version) : base.version,
    cooldownMs: Number.isFinite(incoming.cooldownMs) ? Number(incoming.cooldownMs) : base.cooldownMs,
    protectedProcesses: Array.isArray(incoming.protectedProcesses) ? incoming.protectedProcesses.map(String) : base.protectedProcesses,
    semiProtectedProcesses: Array.isArray(incoming.semiProtectedProcesses) ? incoming.semiProtectedProcesses.map(String) : base.semiProtectedProcesses,
    evictableProcesses: Array.isArray(incoming.evictableProcesses) ? incoming.evictableProcesses.map(String) : base.evictableProcesses,
    tiers: Array.isArray(incoming.tiers) && incoming.tiers.length > 0
      ? incoming.tiers
          .map((tier) => normalizeMemoryGovernorTier(tier))
          .filter(Boolean)
      : base.tiers,
  };

  if (normalized.tiers.length === 0) {
    normalized.tiers = base.tiers;
  }

  return normalized;
}

function normalizeMemoryGovernorTier(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = typeof raw.key === "string" && raw.key.trim() ? raw.key.trim() : null;
  const action = typeof raw.action === "string" ? raw.action : MEMORY_GOVERNOR_ACTIONS.NONE;
  const maxFreeMemMb = Number.isFinite(raw.maxFreeMemMb) ? Number(raw.maxFreeMemMb) : null;
  const sustainMs = Number.isFinite(raw.sustainMs) ? Number(raw.sustainMs) : 0;
  if (!key || !maxFreeMemMb) return null;

  return {
    key,
    maxFreeMemMb,
    sustainMs,
    requiresRunnerPresent: raw.requiresRunnerPresent !== false,
    requiresWorkerBusy: raw.requiresWorkerBusy === true,
    action,
  };
}

function createMemoryGovernorObservedState(raw = {}) {
  return {
    activeTierKey: typeof raw.activeTierKey === "string" ? raw.activeTierKey : null,
    activeTierSince: Number.isFinite(raw.activeTierSince) ? Number(raw.activeTierSince) : null,
  };
}

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

function findMatchingPolicyTier({
  freeMemMb,
  runnerPresent,
  workerBusy,
  policy = DEFAULT_MEMORY_GOVERNOR_POLICY,
}) {
  for (const tier of policy.tiers) {
    if (freeMemMb > tier.maxFreeMemMb) continue;
    if (tier.requiresRunnerPresent && !runnerPresent) continue;
    if (tier.requiresWorkerBusy && !workerBusy) continue;
    if (!tier.requiresWorkerBusy && workerBusy && tier.key === "idle-evict-low-memory") continue;
    return tier;
  }
  return null;
}

function evaluateMemoryGovernorPolicy({
  freeMemMb,
  runnerPresent,
  workerProgress = {},
  lastActionAt = 0,
  observedState = createMemoryGovernorObservedState(),
  now = Date.now(),
  policy = DEFAULT_MEMORY_GOVERNOR_POLICY,
}) {
  const normalizedPolicy = normalizeMemoryGovernorPolicy(policy);
  const free = Number(freeMemMb || 0);
  const workerBusy = isWorkerActivelyUsingModel(workerProgress);
  const match = findMatchingPolicyTier({
    freeMemMb: free,
    runnerPresent,
    workerBusy,
    policy: normalizedPolicy,
  });

  if (!match) {
    return {
      action: MEMORY_GOVERNOR_ACTIONS.NONE,
      reason: runnerPresent ? "memory-acceptable" : "no-ollama-runner",
      tierKey: null,
      policy: normalizedPolicy,
      nextObservedState: createMemoryGovernorObservedState(),
      gatedByCooldown: false,
      gatedBySustain: false,
      sustainRemainingMs: 0,
    };
  }

  const nextObservedState = createMemoryGovernorObservedState(observedState);
  if (nextObservedState.activeTierKey !== match.key) {
    nextObservedState.activeTierKey = match.key;
    nextObservedState.activeTierSince = now;
  }

  const sustainedForMs = nextObservedState.activeTierSince ? now - nextObservedState.activeTierSince : 0;
  const sustainRemainingMs = Math.max(0, match.sustainMs - sustainedForMs);
  if (sustainRemainingMs > 0) {
    return {
      action: MEMORY_GOVERNOR_ACTIONS.NONE,
      reason: `awaiting-sustain:${match.key}`,
      tierKey: match.key,
      policy: normalizedPolicy,
      nextObservedState,
      gatedByCooldown: false,
      gatedBySustain: true,
      sustainRemainingMs,
    };
  }

  const cooldownRemainingMs = Math.max(0, normalizedPolicy.cooldownMs - Math.max(0, now - Number(lastActionAt || 0)));
  if (cooldownRemainingMs > 0) {
    return {
      action: MEMORY_GOVERNOR_ACTIONS.NONE,
      reason: `cooldown:${match.key}`,
      tierKey: match.key,
      policy: normalizedPolicy,
      nextObservedState,
      gatedByCooldown: true,
      gatedBySustain: false,
      cooldownRemainingMs,
      sustainRemainingMs: 0,
    };
  }

  return {
    action: match.action,
    reason: match.key,
    tierKey: match.key,
    policy: normalizedPolicy,
    nextObservedState,
    gatedByCooldown: false,
    gatedBySustain: false,
    sustainRemainingMs: 0,
  };
}

function buildMemoryGovernorEvent({
  action,
  reason,
  freeMemMb,
  runnerPresent,
  workerProgress = {},
  policy,
  tierKey = null,
}) {
  return {
    ts: new Date().toISOString(),
    action,
    reason,
    tierKey,
    freeMemMb: Number(freeMemMb || 0),
    runnerPresent: Boolean(runnerPresent),
    workerState: workerProgress?.state || null,
    workerStage: workerProgress?.stage || null,
    workerTask: workerProgress?.activeTask || null,
    currentCompany: workerProgress?.currentCompany || null,
    policyVersion: policy?.version ?? MEMORY_GOVERNOR_POLICY_VERSION,
  };
}

module.exports = {
  MEMORY_GOVERNOR_ACTIONS,
  MEMORY_GOVERNOR_POLICY_VERSION,
  MEMORY_GOVERNOR_STATE_KEY,
  MEMORY_GOVERNOR_EVENTS_LIMIT,
  DEFAULT_MEMORY_GOVERNOR_POLICY,
  createMemoryGovernorObservedState,
  normalizeMemoryGovernorPolicy,
  isWorkerActivelyUsingModel,
  evaluateMemoryGovernorPolicy,
  buildMemoryGovernorEvent,
};
