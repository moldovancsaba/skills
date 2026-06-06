"use strict";

const { execFile } = require("child_process");
const os = require("os");
const { promisify } = require("util");
const {
  getFreeMemoryMb,
  getResourceBand,
  RESOURCE_BANDS,
} = require("./resource-bands");
const { collectMacMemoryAccounting } = require("./resource-accounting");

const execFileAsync = promisify(execFile);

const PROCESS_CLASSES = Object.freeze({
  CHECK_CRITICAL: "CHECK_CRITICAL",
  CHECK_OPTIONAL: "CHECK_OPTIONAL",
  DEV_SERVER: "DEV_SERVER",
  OLLAMA: "OLLAMA",
  DATABASE: "DATABASE",
  EXTERNAL: "EXTERNAL",
  UNKNOWN: "UNKNOWN",
});

const ACTION_TYPES = Object.freeze({
  NONE: "NONE",
  OBSERVE: "OBSERVE",
  UNLOAD_IDLE_OLLAMA_MODELS: "UNLOAD_IDLE_OLLAMA_MODELS",
  REVIEW_LARGE_EXTERNAL_PROCESS: "REVIEW_LARGE_EXTERNAL_PROCESS",
  PAUSE_BACKGROUND_WORK: "PAUSE_BACKGROUND_WORK",
  PARK_DEGRADED_QUEUE_WORK: "PARK_DEGRADED_QUEUE_WORK",
});

const CHECK_CRITICAL_TITLES = new Set([
  "check-local-guardian",
  "check-local-foreground",
  "check-local-snapshot",
  "check-local-status",
]);

function parsePsLine(line) {
  const match = String(line || "").match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
  if (!match) return null;
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    rssMb: Math.round(Number(match[3] || 0) / 1024),
    command: match[4].trim(),
    args: match[5].trim(),
  };
}

function parsePsOutput(output) {
  return String(output || "")
    .split("\n")
    .slice(1)
    .map(parsePsLine)
    .filter(Boolean);
}

function classifyProcess(processInfo) {
  const args = String(processInfo?.args || "");
  const command = String(processInfo?.command || "");
  const haystack = `${command} ${args}`.toLowerCase();
  const title = args.split(/\s+/)[0] || command;

  if (CHECK_CRITICAL_TITLES.has(title) || Array.from(CHECK_CRITICAL_TITLES).some((value) => haystack.includes(value))) {
    return {
      class: PROCESS_CLASSES.CHECK_CRITICAL,
      safeToStop: false,
      reason: "CHECK critical runner required for local 24/7 operations.",
    };
  }

  if (haystack.includes("check-local-lifecycle")) {
    return {
      class: PROCESS_CLASSES.CHECK_OPTIONAL,
      safeToStop: false,
      reason: "CHECK one-shot runner; observe before intervention.",
    };
  }

  if (/\bollama\b/.test(haystack)) {
    return {
      class: PROCESS_CLASSES.OLLAMA,
      safeToStop: false,
      reason: "Ollama process requires generation-safe model unload policy before stop actions.",
    };
  }

  if (/\bmongod\b|\bpostgres\b|\bprisma\b/.test(haystack)) {
    return {
      class: PROCESS_CLASSES.DATABASE,
      safeToStop: false,
      reason: "Database/runtime persistence process must not be stopped by memory steward.",
    };
  }

  if (/\bnext\b|\bturbo\b|\bvite\b|\bwebpack\b|\bnpm run dev\b/.test(haystack)) {
    return {
      class: PROCESS_CLASSES.DEV_SERVER,
      safeToStop: true,
      reason: "Development server process; eligible only for manual cleanup outside active delivery.",
    };
  }

  if (command && !haystack.includes("node")) {
    return {
      class: PROCESS_CLASSES.EXTERNAL,
      safeToStop: false,
      reason: "External process; memory steward can report but not mutate it.",
    };
  }

  return {
    class: PROCESS_CLASSES.UNKNOWN,
    safeToStop: false,
    reason: "Unknown process ownership; blocked from automatic cleanup.",
  };
}

function buildProcessInventory(processes) {
  const items = processes
    .filter((processInfo) => Number.isFinite(processInfo.pid) && processInfo.pid > 0)
    .map((processInfo) => {
      const classification = classifyProcess(processInfo);
      return {
        ...processInfo,
        ...classification,
      };
    })
    .sort((left, right) => Number(right.rssMb || 0) - Number(left.rssMb || 0));

  const groups = items.reduce((acc, item) => {
    const existing = acc.get(item.class) || {
      class: item.class,
      count: 0,
      rssMb: 0,
      safeToStopCount: 0,
    };
    existing.count += 1;
    existing.rssMb += Number(item.rssMb || 0);
    if (item.safeToStop) existing.safeToStopCount += 1;
    acc.set(item.class, existing);
    return acc;
  }, new Map());

  return {
    items,
    groups: Array.from(groups.values()).sort((left, right) => right.rssMb - left.rssMb),
  };
}

function buildMemoryPlan(input) {
  const freeMemMb = Number(input?.freeMemMb || 0);
  const resourceBand = input?.resourceBand || getResourceBand(freeMemMb);
  const processItems = Array.isArray(input?.processes) ? input.processes : [];
  const worker = input?.worker || {};
  const queue = input?.queue || {};
  const actions = [];
  const activeWorker = worker.state === "running" && worker.stage === "PIPELINE_QUEUE";
  const activeQueueWork = activeWorker || Number(queue.runningJobs || 0) > 0;
  const ollamaProcesses = processItems.filter((item) => item.class === PROCESS_CLASSES.OLLAMA);
  const largeExternal = processItems.filter((item) => item.class === PROCESS_CLASSES.EXTERNAL && Number(item.rssMb || 0) >= 1024);

  if (resourceBand === RESOURCE_BANDS.HEALTHY) {
    actions.push({
      type: ACTION_TYPES.OBSERVE,
      priority: 10,
      allowed: true,
      reason: "Memory band is healthy; no cleanup action is required.",
    });
  }

  if (resourceBand === RESOURCE_BANDS.CONSTRAINED || resourceBand === RESOURCE_BANDS.DEGRADED || resourceBand === RESOURCE_BANDS.CRITICAL) {
    actions.push({
      type: ACTION_TYPES.PAUSE_BACKGROUND_WORK,
      priority: 30,
      allowed: true,
      reason: "Prefer pausing bounded background work before touching foreground queue execution.",
    });
  }

  if (ollamaProcesses.length > 0) {
    actions.push({
      type: ACTION_TYPES.UNLOAD_IDLE_OLLAMA_MODELS,
      priority: activeQueueWork ? 90 : 40,
      allowed: !activeQueueWork,
      reason: activeQueueWork
        ? "Blocked while foreground queue work is active or still marked running."
        : "Ollama is present and no active foreground queue work was reported.",
      targets: ollamaProcesses.map((item) => ({ pid: item.pid, rssMb: item.rssMb })),
    });
  }

  if (largeExternal.length > 0) {
    actions.push({
      type: ACTION_TYPES.REVIEW_LARGE_EXTERNAL_PROCESS,
      priority: 50,
      allowed: false,
      reason: "Large external processes can explain pressure, but automatic cleanup is blocked.",
      targets: largeExternal.slice(0, 5).map((item) => ({ pid: item.pid, rssMb: item.rssMb, command: item.command })),
    });
  }

  if (resourceBand === RESOURCE_BANDS.CRITICAL && Number(queue.runningJobs || 0) > 0) {
    actions.push({
      type: ACTION_TYPES.PARK_DEGRADED_QUEUE_WORK,
      priority: 80,
      allowed: false,
      reason: "Critical memory with running queue work requires operator confirmation through job action controls.",
    });
  }

  return {
    policyVersion: 1,
    resourceBand,
    freeMemMb,
    generatedAt: new Date().toISOString(),
    activeWorker,
    activeQueueWork,
    actions: actions.sort((left, right) => left.priority - right.priority),
  };
}

async function collectProcessInventory() {
  const { stdout } = await execFileAsync("ps", ["-axo", "pid,ppid,rss,comm,args"], {
    timeout: 3000,
    maxBuffer: 1024 * 1024,
  });
  return buildProcessInventory(parsePsOutput(stdout));
}

async function collectMemoryStewardSnapshot(input = {}) {
  const freeMemMb = getFreeMemoryMb(os);
  const resourceBand = getResourceBand(freeMemMb);
  const [inventory, osAccounting] = await Promise.all([
    collectProcessInventory(),
    collectMacMemoryAccounting().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })),
  ]);
  const plan = buildMemoryPlan({
    freeMemMb,
    resourceBand,
    processes: inventory.items,
    worker: input.worker,
    queue: input.queue,
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    freeMemMb,
    totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
    resourceBand,
    osAccounting,
    runtimeGuard: {
      freeMemMb,
      resourceBand,
      explanation: "Runtime guard uses immediately free memory; osAccounting includes reclaimable macOS memory separately.",
    },
    inventory,
    plan,
  };
}

module.exports = {
  ACTION_TYPES,
  PROCESS_CLASSES,
  buildMemoryPlan,
  buildProcessInventory,
  classifyProcess,
  collectMemoryStewardSnapshot,
  parsePsOutput,
};
