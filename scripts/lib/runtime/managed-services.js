"use strict";

const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");
const BIN_DIR = path.join(ROOT, "bin");
const HEALTH_TIMEOUT_MS = 2500;

const SERVICE_CRITICALITY = Object.freeze({
  CRITICAL: "critical",
  DEGRADED_OK: "degraded-ok",
  OPTIONAL: "optional",
});

const SERVICE_STATES = Object.freeze({
  UNKNOWN: "unknown",
  STARTING: "starting",
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  DOWN: "down",
  BLOCKED: "blocked",
  RECOVERING: "recovering",
  RESTART_LIMITED: "restart-limited",
});

const MANAGED_SERVICE_STATE_KEY = "local_ai_managed_service_state";
const MANAGED_SERVICE_EVENT_LIMIT = 100;
const MANAGED_SERVICE_POLICY_VERSION = 1;

function buildLocalUrl(port, pathname = "/health") {
  return `http://127.0.0.1:${port}${pathname}`;
}

const MANAGED_SERVICE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "check-local-guardian",
    displayName: "CHECK Local Guardian",
    processTitle: "check-local-guardian",
    command: [path.join(BIN_DIR, "check-local-guardian")],
    cwd: ROOT,
    health: { type: "process", timeoutMs: HEALTH_TIMEOUT_MS },
    dependencies: [],
    criticality: SERVICE_CRITICALITY.CRITICAL,
    restart: { enabled: false, minDelayMs: 5000, maxDelayMs: 60000, maxRestartsPerHour: 1 },
    memoryBudgetMb: 160,
    degradation: {
      incidentCode: "GUARDIAN_DOWN",
      operatorAction: "Restart the launchd/terminal Guardian supervisor.",
    },
  }),
  Object.freeze({
    id: "check-local-foreground",
    displayName: "CHECK Local Foreground Worker",
    processTitle: "check-local-foreground",
    command: [path.join(BIN_DIR, "check-local-foreground-worker")],
    cwd: ROOT,
    health: { type: "http", url: buildLocalUrl(10005), timeoutMs: HEALTH_TIMEOUT_MS },
    ports: [10005],
    dependencies: ["check-local-guardian", "ollama"],
    criticality: SERVICE_CRITICALITY.CRITICAL,
    restart: { enabled: true, minDelayMs: 5000, maxDelayMs: 60000, maxRestartsPerHour: 12 },
    memoryBudgetMb: 256,
    degradation: {
      incidentCode: "FOREGROUND_WORKER_DOWN",
      queuePolicy: "pause-playlist-lane",
      operatorAction: "Allow Guardian to restart the foreground worker or use Runtime Console restart.",
    },
  }),
  Object.freeze({
    id: "check-local-snapshot",
    displayName: "CHECK Local Snapshot Worker",
    processTitle: "check-local-snapshot",
    command: [path.join(BIN_DIR, "check-local-snapshot-worker")],
    cwd: ROOT,
    health: { type: "http", url: buildLocalUrl(10007), timeoutMs: HEALTH_TIMEOUT_MS },
    ports: [10007],
    dependencies: ["check-local-guardian"],
    criticality: SERVICE_CRITICALITY.DEGRADED_OK,
    restart: { enabled: true, minDelayMs: 5000, maxDelayMs: 60000, maxRestartsPerHour: 8 },
    memoryBudgetMb: 192,
    degradation: {
      incidentCode: "SNAPSHOT_WORKER_DOWN",
      operatorAction: "Restart snapshot worker after foreground backlog or memory pressure clears.",
    },
  }),
  Object.freeze({
    id: "check-local-status",
    displayName: "CHECK Local Status Server",
    processTitle: "check-local-status",
    command: [path.join(BIN_DIR, "check-local-status-server")],
    cwd: ROOT,
    health: { type: "http", url: buildLocalUrl(10006), timeoutMs: HEALTH_TIMEOUT_MS },
    ports: [10006],
    dependencies: ["check-local-guardian"],
    criticality: SERVICE_CRITICALITY.CRITICAL,
    restart: { enabled: true, minDelayMs: 5000, maxDelayMs: 60000, maxRestartsPerHour: 12 },
    memoryBudgetMb: 512,
    degradation: {
      incidentCode: "STATUS_SERVER_DOWN",
      operatorAction: "Allow Guardian to restart status server.",
    },
  }),
  Object.freeze({
    id: "destination-daemon",
    displayName: "Destination Mission Daemon",
    processTitle: "check-destination-daemon",
    command: ["npm", "run", "dev"],
    cwd: ROOT,
    health: { type: "http", url: buildLocalUrl(3000, "/api/destination-missions/daemon/health"), timeoutMs: HEALTH_TIMEOUT_MS },
    ports: [3000],
    dependencies: ["check-local-guardian"],
    criticality: SERVICE_CRITICALITY.DEGRADED_OK,
    restart: { enabled: true, minDelayMs: 30000, maxDelayMs: 300000, maxRestartsPerHour: 4 },
    memoryBudgetMb: 1024,
    degradation: {
      incidentCode: "DESTINATION_DAEMON_DOWN",
      queuePolicy: "cool-down-destination-daemon-jobs",
      operatorAction: "Start the managed webapp/destination daemon endpoint or leave queue breaker active.",
    },
  }),
  Object.freeze({
    id: "ollama",
    displayName: "Ollama Runtime",
    processTitle: "ollama",
    command: ["ollama", "serve"],
    cwd: ROOT,
    health: { type: "http", url: "http://127.0.0.1:11434/api/ps", timeoutMs: HEALTH_TIMEOUT_MS },
    ports: [11434],
    dependencies: [],
    criticality: SERVICE_CRITICALITY.CRITICAL,
    restart: { enabled: false, minDelayMs: 10000, maxDelayMs: 120000, maxRestartsPerHour: 6 },
    memoryBudgetMb: 4096,
    degradation: {
      incidentCode: "OLLAMA_DOWN",
      queuePolicy: "pause-model-heavy-jobs",
      operatorAction: "Start Ollama or allow the configured platform service to recover.",
    },
  }),
]);

function cloneDefinition(definition) {
  return {
    ...definition,
    command: [...definition.command],
    health: { ...definition.health },
    ports: Array.isArray(definition.ports) ? [...definition.ports] : [],
    dependencies: [...definition.dependencies],
    restart: { ...definition.restart },
    degradation: { ...definition.degradation },
  };
}

function listManagedServiceDefinitions() {
  return MANAGED_SERVICE_DEFINITIONS.map(cloneDefinition);
}

function getManagedServiceDefinition(serviceId) {
  const definition = MANAGED_SERVICE_DEFINITIONS.find((service) => service.id === serviceId);
  return definition ? cloneDefinition(definition) : null;
}

function topologicalSortServices(definitions) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const visited = new Set();
  const visiting = new Set();
  const sorted = [];

  function visit(definition) {
    if (visited.has(definition.id)) return;
    if (visiting.has(definition.id)) throw new Error(`Managed service dependency cycle includes ${definition.id}`);
    visiting.add(definition.id);
    for (const dependencyId of definition.dependencies || []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) throw new Error(`Managed service ${definition.id} depends on unknown service ${dependencyId}`);
      visit(dependency);
    }
    visiting.delete(definition.id);
    visited.add(definition.id);
    sorted.push(definition);
  }

  for (const definition of [...definitions].sort((left, right) => left.id.localeCompare(right.id))) {
    visit(definition);
  }

  return sorted;
}

function validateManagedServiceManifest(definitions = listManagedServiceDefinitions()) {
  const errors = [];
  const ids = new Set();
  const ports = new Map();

  for (const definition of definitions) {
    if (!definition.id) errors.push("Managed service id is required.");
    if (ids.has(definition.id)) errors.push(`Duplicate managed service id: ${definition.id}`);
    ids.add(definition.id);
    if (!Array.isArray(definition.command) || definition.command.length === 0) errors.push(`${definition.id} command must be a non-empty array.`);
    if (!definition.cwd) errors.push(`${definition.id} cwd is required.`);
    if (!definition.health || !definition.health.type) errors.push(`${definition.id} health config is required.`);
    if (definition.health?.type === "http" && !definition.health.url) errors.push(`${definition.id} http health requires a url.`);
    if (!Number.isFinite(definition.health?.timeoutMs) || definition.health.timeoutMs <= 0) errors.push(`${definition.id} health timeout must be positive.`);
    for (const port of definition.ports || []) {
      if (ports.has(port)) errors.push(`Port ${port} is declared by both ${ports.get(port)} and ${definition.id}.`);
      ports.set(port, definition.id);
    }
  }

  for (const definition of definitions) {
    for (const dependencyId of definition.dependencies || []) {
      if (!ids.has(dependencyId)) errors.push(`${definition.id} depends on unknown service ${dependencyId}.`);
    }
  }

  let dependencyOrder = [];
  try {
    dependencyOrder = topologicalSortServices(definitions).map((definition) => definition.id);
  } catch (error) {
    errors.push(error.message);
  }

  return {
    ok: errors.length === 0,
    policyVersion: MANAGED_SERVICE_POLICY_VERSION,
    errors,
    serviceCount: definitions.length,
    dependencyOrder,
  };
}

module.exports = {
  MANAGED_SERVICE_DEFINITIONS,
  MANAGED_SERVICE_EVENT_LIMIT,
  MANAGED_SERVICE_POLICY_VERSION,
  MANAGED_SERVICE_STATE_KEY,
  SERVICE_CRITICALITY,
  SERVICE_STATES,
  getManagedServiceDefinition,
  listManagedServiceDefinitions,
  topologicalSortServices,
  validateManagedServiceManifest,
};
