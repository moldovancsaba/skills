"use strict";

const DEFAULT_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const RUNNER_DEFINITIONS = Object.freeze({
  "check.local.guardian": Object.freeze({
    id: "check.local.guardian",
    humanName: "CHECK Local Guardian",
    processTitle: "check-local-guardian",
    kind: "continuous",
    owner: "local",
    description: "Keeps CHECK local background services alive and restarts unhealthy workers.",
  }),
  "check.local.foreground-worker": Object.freeze({
    id: "check.local.foreground-worker",
    humanName: "CHECK Local Foreground Worker",
    processTitle: "check-local-foreground",
    kind: "continuous",
    owner: "local",
    description: "Runs the queue-owned local intelligence mutation lane.",
  }),
  "check.local.snapshot-worker": Object.freeze({
    id: "check.local.snapshot-worker",
    humanName: "CHECK Local Snapshot Worker",
    processTitle: "check-local-snapshot",
    kind: "continuous",
    owner: "local",
    description: "Maintains lifecycle topology, projections, snapshots, and runtime verification.",
  }),
  "check.local.status-server": Object.freeze({
    id: "check.local.status-server",
    humanName: "CHECK Local Status Server",
    processTitle: "check-local-status",
    kind: "continuous",
    owner: "local",
    description: "Serves the local operator status surface for CHECK Local.",
  }),
  "check.local.lifecycle-maintenance": Object.freeze({
    id: "check.local.lifecycle-maintenance",
    humanName: "CHECK Local Lifecycle Maintenance",
    processTitle: "check-local-lifecycle",
    kind: "one-shot",
    owner: "local",
    description: "Repairs unit jobs, destination missions, daemon lanes, and lifecycle topology.",
  }),
  "check.local.lifecycle-verifier": Object.freeze({
    id: "check.local.lifecycle-verifier",
    humanName: "CHECK Local Lifecycle Verifier",
    processTitle: "check-local-verify",
    kind: "one-shot",
    owner: "local",
    description: "Verifies that units, blocks, mission definitions, and daemon lanes are coherent.",
  }),
});

function getRunnerDefinition(runnerId) {
  const definition = RUNNER_DEFINITIONS[runnerId];
  if (!definition) {
    throw new Error(`Unknown CHECK runner id: ${runnerId}`);
  }
  return definition;
}

function listRunnerDefinitions() {
  return Object.values(RUNNER_DEFINITIONS).map((definition) => ({ ...definition }));
}

function applyRunnerIdentity(runnerId) {
  const definition = getRunnerDefinition(runnerId);
  process.title = definition.processTitle;
  process.env.CHECK_RUNNER_ID = definition.id;
  process.env.CHECK_RUNNER_NAME = definition.humanName;
  process.env.CHECK_RUNNER_KIND = definition.kind;
  process.env.CHECK_RUNNER_DESCRIPTION = definition.description;
  return definition;
}

function buildRunnerEnvironment(runnerId, overrides = {}) {
  const definition = getRunnerDefinition(runnerId);
  return {
    ...process.env,
    PATH: process.env.PATH || DEFAULT_PATH,
    CHECK_RUNNER_ID: definition.id,
    CHECK_RUNNER_NAME: definition.humanName,
    CHECK_RUNNER_KIND: definition.kind,
    CHECK_RUNNER_DESCRIPTION: definition.description,
    ...overrides,
  };
}

module.exports = {
  DEFAULT_PATH,
  RUNNER_DEFINITIONS,
  applyRunnerIdentity,
  buildRunnerEnvironment,
  getRunnerDefinition,
  listRunnerDefinitions,
};
