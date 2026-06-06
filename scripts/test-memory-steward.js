"use strict";

const assert = require("node:assert/strict");
const {
  ACTION_TYPES,
  PROCESS_CLASSES,
  buildMemoryPlan,
  buildProcessInventory,
  classifyProcess,
  parsePsOutput,
} = require("./lib/runtime/memory-steward");
const { RESOURCE_BANDS } = require("./lib/runtime/resource-bands");

async function main() {
  const parsed = parsePsOutput(`
  PID  PPID    RSS COMM             ARGS
  101     1 204800 /usr/local/bin/node check-local-foreground /Users/Shared/Projects/checklist/scripts/sync.js
  202     1 512000 /opt/homebrew/bin/ollama ollama serve
  303     1  32768 /usr/bin/make     make dev
  404     1 1572864 /Applications/Browser.app/Contents/MacOS/Browser Browser --type=renderer
`);

  assert.equal(parsed.length, 4, "ps output parser must preserve process rows");
  assert.equal(parsed[0].pid, 101, "ps parser must read pid");
  assert.equal(parsed[0].rssMb, 200, "ps parser must convert rss kb to mb");

  assert.equal(
    classifyProcess(parsed[0]).class,
    PROCESS_CLASSES.CHECK_CRITICAL,
    "foreground runner must classify as CHECK critical",
  );
  assert.equal(
    classifyProcess(parsed[1]).class,
    PROCESS_CLASSES.OLLAMA,
    "ollama process must classify explicitly",
  );
  assert.equal(
    classifyProcess({
      pid: 505,
      ppid: 1,
      rssMb: 128,
      command: "/opt/homebrew/bin/node",
      args: "node ./node_modules/.bin/next dev",
    }).class,
    PROCESS_CLASSES.DEV_SERVER,
    "dev server process must classify explicitly",
  );

  const inventory = buildProcessInventory(parsed);
  assert.equal(inventory.items[0].pid, 404, "inventory must sort by largest rss first");
  assert.equal(
    inventory.groups.find((group) => group.class === PROCESS_CLASSES.OLLAMA)?.rssMb,
    500,
    "inventory must aggregate rss by process class",
  );

  const healthyPlan = buildMemoryPlan({
    freeMemMb: 4096,
    resourceBand: RESOURCE_BANDS.HEALTHY,
    processes: inventory.items,
    worker: { state: "idle", stage: "IDLE" },
    queue: { runningJobs: 0 },
  });
  assert.equal(
    healthyPlan.actions[0].type,
    ACTION_TYPES.OBSERVE,
    "healthy memory should choose observation first",
  );

  const criticalPlan = buildMemoryPlan({
    freeMemMb: 192,
    resourceBand: RESOURCE_BANDS.CRITICAL,
    processes: inventory.items,
    worker: { state: "running", stage: "PIPELINE_QUEUE" },
    queue: { runningJobs: 1 },
  });
  const unloadOllama = criticalPlan.actions.find((action) => action.type === ACTION_TYPES.UNLOAD_IDLE_OLLAMA_MODELS);
  const parkQueue = criticalPlan.actions.find((action) => action.type === ACTION_TYPES.PARK_DEGRADED_QUEUE_WORK);
  assert.equal(unloadOllama?.allowed, false, "ollama unload must be blocked while foreground queue work is active");
  assert.equal(parkQueue?.allowed, false, "parking queue work must require operator confirmation");

  const staleHeartbeatPlan = buildMemoryPlan({
    freeMemMb: 740,
    resourceBand: RESOURCE_BANDS.DEGRADED,
    processes: inventory.items,
    worker: { state: "idle", stage: "IDLE" },
    queue: { runningJobs: 1 },
  });
  assert.equal(
    staleHeartbeatPlan.actions.find((action) => action.type === ACTION_TYPES.UNLOAD_IDLE_OLLAMA_MODELS)?.allowed,
    false,
    "persisted running queue jobs must block ollama unload even when the worker heartbeat looks idle",
  );

  console.log("memory steward contracts passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
