"use strict";

const http = require("http");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  MANAGED_SERVICE_EVENT_LIMIT,
  MANAGED_SERVICE_POLICY_VERSION,
  SERVICE_CRITICALITY,
  SERVICE_STATES,
  listManagedServiceDefinitions,
  topologicalSortServices,
} = require("./managed-services");

const execFileAsync = promisify(execFile);
const RESTART_WINDOW_MS = 60 * 60 * 1000;

function normalizePriorManagedServiceState(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    policyVersion: Number(source.policyVersion || MANAGED_SERVICE_POLICY_VERSION),
    services: source.services && typeof source.services === "object" && !Array.isArray(source.services) ? source.services : {},
    recentEvents: Array.isArray(source.recentEvents) ? source.recentEvents.filter((event) => event && typeof event === "object") : [],
  };
}

function serviceStateForDefinition(definition, patch = {}) {
  return {
    serviceId: definition.id,
    displayName: definition.displayName,
    criticality: definition.criticality,
    state: SERVICE_STATES.UNKNOWN,
    pid: null,
    blockedBy: [],
    lastHealthyAt: null,
    lastCheckedAt: null,
    lastRestartAt: null,
    restartHistory: [],
    restartCountWindow: 0,
    lastError: null,
    incidentCode: definition.degradation?.incidentCode || null,
    operatorAction: definition.degradation?.operatorAction || null,
    ...patch,
  };
}

function buildRestartWindow(priorState, nowMs) {
  return (Array.isArray(priorState?.restartHistory) ? priorState.restartHistory : [])
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value) && nowMs - value <= RESTART_WINDOW_MS);
}

function canRestartService(definition, priorState, now = new Date()) {
  if (!definition.restart?.enabled) return { allowed: false, reason: "restart-disabled", restartHistory: [] };
  const nowMs = now.getTime();
  const restartHistory = buildRestartWindow(priorState, nowMs);
  const lastRestartMs = priorState?.lastRestartAt ? new Date(priorState.lastRestartAt).getTime() : 0;
  const minDelayMs = Number(definition.restart.minDelayMs || 0);
  if (lastRestartMs && nowMs - lastRestartMs < minDelayMs) {
    return { allowed: false, reason: "restart-backoff", restartHistory };
  }
  if (restartHistory.length >= Number(definition.restart.maxRestartsPerHour || 1)) {
    return { allowed: false, reason: "restart-limit", restartHistory };
  }
  return { allowed: true, reason: "restart-allowed", restartHistory };
}

function buildManagedServiceReconciliationPlan(input = {}) {
  const definitions = topologicalSortServices(input.definitions || listManagedServiceDefinitions());
  const prior = normalizePriorManagedServiceState(input.priorState);
  const observed = input.observed && typeof input.observed === "object" ? input.observed : {};
  const now = input.now instanceof Date ? input.now : new Date();
  const nextServices = {};
  const actions = [];
  const events = [];

  for (const definition of definitions) {
    const priorState = prior.services[definition.id] || {};
    const observedState = observed[definition.id] || {};
    const dependencyStates = (definition.dependencies || []).map((dependencyId) => nextServices[dependencyId]).filter(Boolean);
    const blockedBy = dependencyStates
      .filter((state) => state.state !== SERVICE_STATES.HEALTHY && state.criticality === SERVICE_CRITICALITY.CRITICAL)
      .map((state) => state.serviceId);
    const base = serviceStateForDefinition(definition, {
      ...priorState,
      serviceId: definition.id,
      displayName: definition.displayName,
      criticality: definition.criticality,
      lastCheckedAt: now.toISOString(),
      blockedBy,
      pid: observedState.pid ?? priorState.pid ?? null,
    });

    if (blockedBy.length > 0) {
      nextServices[definition.id] = {
        ...base,
        state: SERVICE_STATES.BLOCKED,
        lastError: `Blocked by unhealthy dependency: ${blockedBy.join(", ")}`,
      };
      continue;
    }

    if (observedState.healthy) {
      nextServices[definition.id] = {
        ...base,
        state: SERVICE_STATES.HEALTHY,
        pid: observedState.pid ?? null,
        lastHealthyAt: now.toISOString(),
        lastError: null,
      };
      continue;
    }

    const restartDecision = canRestartService(definition, priorState, now);
    if (restartDecision.allowed) {
      const restartHistory = [...restartDecision.restartHistory, now.getTime()].map((value) => new Date(value).toISOString());
      nextServices[definition.id] = {
        ...base,
        state: SERVICE_STATES.RECOVERING,
        lastRestartAt: now.toISOString(),
        restartHistory,
        restartCountWindow: restartHistory.length,
        lastError: observedState.error || "Service is unhealthy; restart scheduled.",
      };
      actions.push({ type: "START_OR_RESTART", serviceId: definition.id, definition });
      events.push({
        ts: now.toISOString(),
        serviceId: definition.id,
        action: "START_OR_RESTART",
        reason: observedState.error || "unhealthy",
      });
      continue;
    }

    nextServices[definition.id] = {
      ...base,
      state: restartDecision.reason === "restart-limit" ? SERVICE_STATES.RESTART_LIMITED : SERVICE_STATES.DOWN,
      restartHistory: restartDecision.restartHistory.map((value) => new Date(value).toISOString()),
      restartCountWindow: restartDecision.restartHistory.length,
      lastError: observedState.error || restartDecision.reason,
    };
  }

  return {
    policyVersion: MANAGED_SERVICE_POLICY_VERSION,
    generatedAt: now.toISOString(),
    services: nextServices,
    actions,
    recentEvents: [...prior.recentEvents, ...events].slice(-MANAGED_SERVICE_EVENT_LIMIT),
  };
}

function httpHealth(url, timeoutMs) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve({ healthy: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode });
      },
    );
    req.on("error", (error) => resolve({ healthy: false, error: error.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ healthy: false, error: `Timed out after ${timeoutMs}ms` });
    });
  });
}

async function collectManagedServiceObservations(definitions = listManagedServiceDefinitions()) {
  const observations = {};
  let psRows = [];
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid,comm,args"], { timeout: 3000, maxBuffer: 1024 * 1024 });
    psRows = String(stdout || "").split("\n").slice(1);
  } catch {
    psRows = [];
  }

  await Promise.all(definitions.map(async (definition) => {
    const processMatch = psRows.find((line) => definition.processTitle && line.includes(definition.processTitle));
    const pid = processMatch ? Number(String(processMatch).trim().split(/\s+/)[0]) : null;
    if (definition.health.type === "http") {
      const health = await httpHealth(definition.health.url, definition.health.timeoutMs);
      observations[definition.id] = {
        healthy: Boolean(health.healthy),
        pid,
        statusCode: health.statusCode || null,
        error: health.error || null,
      };
      return;
    }
    observations[definition.id] = {
      healthy: Boolean(pid),
      pid,
      error: pid ? null : "process not found",
    };
  }));

  return observations;
}

module.exports = {
  RESTART_WINDOW_MS,
  buildManagedServiceReconciliationPlan,
  canRestartService,
  collectManagedServiceObservations,
  normalizePriorManagedServiceState,
  serviceStateForDefinition,
};
