#!/usr/bin/env node
/**
 * Watchdog for the local AI worker process.
 *
 * Launches `scripts/sync.js`, monitors health and liveness, and restarts the
 * worker when crashes, hangs, or resource failures are detected.
 */

"use strict";

const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PrismaClient } = require("@prisma/client");
const {
  applyRunnerIdentity,
  buildRunnerEnvironment,
  getRunnerDefinition,
} = require("./lib/runtime/runner-registry");
const { getResourceBand } = require("./lib/runtime/resource-bands");
const {
  MEMORY_GOVERNOR_ACTIONS,
  MEMORY_GOVERNOR_STATE_KEY,
  MEMORY_GOVERNOR_EVENTS_LIMIT,
  DEFAULT_MEMORY_GOVERNOR_POLICY,
  createMemoryGovernorObservedState,
  normalizeMemoryGovernorPolicy,
  evaluateMemoryGovernorPolicy,
  buildMemoryGovernorEvent,
} = require("./lib/runtime/memory-governor");
const {
  MANAGED_SERVICE_STATE_KEY,
  listManagedServiceDefinitions,
} = require("./lib/runtime/managed-services");
const {
  buildManagedServiceReconciliationPlan,
  collectManagedServiceObservations,
} = require("./lib/runtime/service-reconciler");
const {
  DEFAULT_LOG_MAX_BYTES,
  DEFAULT_LOG_RETENTION,
  rotateLogFile,
} = require("./lib/runtime/resource-accounting");
const RUNNER = applyRunnerIdentity("check.local.guardian");
const WORKER_RUNNER_ID = "check.local.foreground-worker";
const SNAPSHOT_RUNNER_ID = "check.local.snapshot-worker";
const STATUS_RUNNER_ID = "check.local.status-server";
const WORKER_RUNNER = getRunnerDefinition(WORKER_RUNNER_ID);
const SNAPSHOT_RUNNER = getRunnerDefinition(SNAPSHOT_RUNNER_ID);
const STATUS_RUNNER = getRunnerDefinition(STATUS_RUNNER_ID);
const prisma = new PrismaClient();

// Configuration
const WORKER_SCRIPT    = path.join(__dirname, "sync.js");
const STATUS_SCRIPT    = path.join(__dirname, "status-server.js");
const SNAPSHOT_SCRIPT  = path.join(__dirname, "snapshot-worker.js");
const LOCAL_BIN_DIR    = path.join(__dirname, "..", "bin");
const WORKER_COMMAND   = path.join(LOCAL_BIN_DIR, "check-local-foreground-worker");
const STATUS_COMMAND   = path.join(LOCAL_BIN_DIR, "check-local-status-server");
const SNAPSHOT_COMMAND = path.join(LOCAL_BIN_DIR, "check-local-snapshot-worker");
const LOG_DIR          = path.join(__dirname, "..", "logs");
const LOG_FILE         = path.join(LOG_DIR, "guardian.log");
const LAUNCHD_LOG_FILE = path.join(LOG_DIR, "guardian-launchd.log");
const HEARTBEAT_FILE   = path.join(LOG_DIR, "guardian-heartbeat.json");
const MAX_LOG_LINES    = 10_000;
const LOG_MAX_BYTES    = Number(process.env.CHECK_LOCAL_LOG_MAX_BYTES || DEFAULT_LOG_MAX_BYTES);
const LOG_RETENTION    = Number(process.env.CHECK_LOCAL_LOG_RETENTION || DEFAULT_LOG_RETENTION);

const HEALTH_PORT             = 10005;
const SNAPSHOT_HEALTH_PORT    = 10007;
const STATUS_HEALTH_PORT      = 10006;
const HEALTH_PATH             = "/health";
const STUCK_MS                = 10 * 60 * 1000; // 10 min without progress = kill and release the job
const STARTUP_GRACE_MS        = 60 * 1000;      // 1 min grace
const RESTART_BASE_MS         = 5000;
const RESTART_MAX_MS          = 60000;
const HEALTH_INTERVAL         = 30000;          // 30s check
const STATUS_HEALTH_INTERVAL  = 15000;          // 15s check

const OLLAMA_URL       = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const FALLBACK_MODEL   = "granite4:350m";
const MEM_THRESHOLD_MB = 1024; // Warn if free memory < 1GB

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

let logBuffer = [];

function ts() {
  return new Date().toISOString();
}

/**
 * Persists a log entry to both memory buffer and filesystem.
 * 
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} msg - Log message
 */
function writeLog(level, msg) {
  const line = `[${ts()}] [${level}] [${RUNNER.processTitle}] ${msg}`;
  console.log(line);
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
  try {
    rotateLogFile(LOG_FILE, { maxBytes: LOG_MAX_BYTES, retention: LOG_RETENTION });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {}
}

const log  = (msg) => writeLog("INFO ", msg);
const warn = (msg) => writeLog("WARN ", msg);
const err  = (msg) => writeLog("ERROR", msg);

// State
let workerProcess      = null;
let snapshotProcess    = null;
let restartCount       = 0;
let snapshotRestartCount = 0;
let restartMs          = RESTART_BASE_MS;
let snapshotRestartMs  = RESTART_BASE_MS;
let workerAlive        = false;
let snapshotWorkerAlive = false;
let startedAt          = null;
let snapshotStartedAt  = null;
let lastProgressAt     = null;    // last value from /health
let lastSnapshotProgressAt = null;
let currentWorkFingerprint = null;
let currentWorkStartedAt = null;
let currentSnapshotFingerprint = null;
let currentSnapshotStartedAt = null;
let healthCheckTimer   = null;
let heartbeatTimer     = null;
let useSafeMode        = false; // If true, tells worker to use fallback model
let resourceStats      = { freeMem: 0, totalMem: 0, loadAvg: [] };
let commandTimer       = null;
let isShuttingDown     = false;
let latestWorkerProgress = null;
let lastMemoryGovernorActionAt = 0;
let lastMemoryGovernorReason = null;
let memoryGovernorPolicy = normalizeMemoryGovernorPolicy(DEFAULT_MEMORY_GOVERNOR_POLICY);
let memoryGovernorObservedState = createMemoryGovernorObservedState();
let latestMemoryGovernorEvaluation = null;
let latestManagedServicePlan = null;

// Command bridge supervision

/**
 * Polls the database for pending system commands issued from the web dashboard.
 */
async function pollCommands() {
  try {
    const commands = await prisma.systemCommand.findMany({
      where: {
        status: "PENDING",
        command: { in: ["RESTART", "PURGE_CACHE"] },
      },
      orderBy: { issuedAt: "asc" }
    });

    for (const cmd of commands) {
      log(`[BRIDGE] 📥 Received command: ${cmd.command}`);
      await prisma.systemCommand.update({
        where: { id: cmd.id },
        data: { status: "PROCESSING", updatedAt: new Date() }
      });

      try {
        await executeCommand(cmd);
        await prisma.systemCommand.update({
          where: { id: cmd.id },
          data: { status: "DONE", updatedAt: new Date() }
        });
        log(`[BRIDGE] ✅ Command ${cmd.command} executed successfully`);
      } catch (ex) {
        err(`[BRIDGE] ❌ Command ${cmd.command} failed: ${ex.message}`);
        await prisma.systemCommand.update({
          where: { id: cmd.id },
          data: { status: "FAILED", error: ex.message, updatedAt: new Date() }
        });
      }
    }
  } catch (ex) {
    // Silent fail for polling errors to avoid log spam during DB maintenance
  }
}

/**
 * Routes and executes the received system command.
 */
async function executeCommand(cmd) {
  switch (cmd.command) {
    case "RESTART":
      log(`[BRIDGE] Manual restart triggered via dashboard`);
      killWorker("dashboard-manual-restart");
      killSnapshotWorker("dashboard-manual-restart");
      break;
    case "PURGE_CACHE":
      log(`[BRIDGE] Purging local model cache`);
      killWorker("dashboard-purge-cache");
      killSnapshotWorker("dashboard-purge-cache");
      break;
    default:
      throw new Error(`Command "${cmd.command}" is not implemented in this version.`);
  }
}

// Heartbeat

/**
 * Writes the Guardian's internal state to a JSON file for external observability.
 * 
 * @param {object} [extra] - Additional metadata to include
 */
function writeHeartbeat(extra = {}) {
  const data = {
    runner: RUNNER,
    processTitle: process.title,
    guardianPid:   process.pid,
    workerPid:     workerProcess?.pid ?? null,
    snapshotWorkerPid: snapshotProcess?.pid ?? null,
    children: {
      foregroundWorker: {
        ...WORKER_RUNNER,
        pid: workerProcess?.pid ?? null,
        alive: workerAlive,
      },
      snapshotWorker: {
        ...SNAPSHOT_RUNNER,
        pid: snapshotProcess?.pid ?? null,
        alive: snapshotWorkerAlive,
      },
      statusServer: STATUS_RUNNER,
    },
    workerAlive,
    snapshotWorkerAlive,
    restartCount,
    snapshotRestartCount,
    startedAt,
    snapshotStartedAt,
    lastHealthAt:  new Date().toISOString(),
    lastProgressAt,
    lastSnapshotProgressAt,
    useSafeMode,
    resources: resourceStats,
    memoryGovernor: {
      policyVersion: memoryGovernorPolicy.version,
      lastActionAt: lastMemoryGovernorActionAt ? new Date(lastMemoryGovernorActionAt).toISOString() : null,
      lastActionReason: lastMemoryGovernorReason,
      observedTierKey: memoryGovernorObservedState.activeTierKey,
      observedTierSince: memoryGovernorObservedState.activeTierSince
        ? new Date(memoryGovernorObservedState.activeTierSince).toISOString()
        : null,
      latestEvaluation: latestMemoryGovernorEvaluation,
    },
    managedServices: latestManagedServicePlan
      ? {
          policyVersion: latestManagedServicePlan.policyVersion,
          generatedAt: latestManagedServicePlan.generatedAt,
          actions: latestManagedServicePlan.actions.map((action) => ({ type: action.type, serviceId: action.serviceId })),
          services: latestManagedServicePlan.services,
        }
      : null,
    ...extra,
  };
  try {
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

// Health monitoring

/**
 * Checks if the Ollama AI server is responsive without forcing model reload.
 */
function checkOllama() {
  const url = new URL(OLLAMA_URL);
  
  const req = http.get({ hostname: url.hostname, port: url.port, path: "/api/ps", timeout: 2000 }, (res) => {
    let body = "";
    res.on("data", (chunk) => {
      body += chunk;
    });
    res.on("end", () => {
      if (res.statusCode !== 200) {
        warn(`Ollama server returned status ${res.statusCode}`);
        return;
      }

      try {
        const payload = JSON.parse(body || "{}");
        const loadedModels = Array.isArray(payload.models) ? payload.models.length : 0;
        if (useSafeMode) {
          log("Ollama server reachable. Keeping safe-mode decision to worker/runtime behavior, not health probing.");
        }
        log(`OLLAMA OK | loadedModels=${loadedModels}`);
      } catch (error) {
        warn(`Ollama /api/ps parse error: ${error.message}`);
      }
    });
  });
  
  req.on("error", (e) => err(`Ollama server UNREACHABLE at ${OLLAMA_URL}: ${e.message}`));
  req.on("timeout", () => req.destroy());
}

/**
 * Monitors system resources and updates internal stats.
 */
function checkResources() {
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const freeMB = Math.round(freeMem / 1024 / 1024);
  
  resourceStats = {
    freeMem: freeMB,
    totalMem: Math.round(totalMem / 1024 / 1024),
    loadAvg: os.loadavg(),
    resourceBand: getResourceBand(freeMB),
  };
  
  if (freeMB < MEM_THRESHOLD_MB) {
    warn(`LOW MEMORY: ${freeMB}MB free. System may struggle.`);
  }

  try {
    const rotation = rotateLogFile(LAUNCHD_LOG_FILE, { maxBytes: LOG_MAX_BYTES, retention: LOG_RETENTION, mode: "copytruncate" });
    if (rotation.rotated) log(`[LOG ROTATION] Rotated ${LAUNCHD_LOG_FILE} to ${rotation.rotatedTo} (${Math.round(rotation.sizeBytes / (1024 * 1024))}MB).`);
  } catch (error) {
    warn(`[LOG ROTATION] Failed to rotate ${LAUNCHD_LOG_FILE}: ${error.message}`);
  }

  applyMemoryGovernor();
}

/**
 * Attempts to reset the Ollama service on macOS.
 */
function restartOllama() {
  warn("Attempting automated Ollama service reset...");
  try {
    // Force kill any running ollama processes
    execSync("pkill -9 ollama || true");
    log("Ollama processes terminated. Waiting for restart...");
    
    // Guardian doesn't restart it directly as it might be an app,
    // but clearing the process usually allows the app/service to rebound.
    // If it's a brew service:
    // execSync("brew services restart ollama || true");
  } catch (e) {
    err(`Failed to reset Ollama: ${e.message}`);
  }
}

function hasOllamaRunnerProcess() {
  try {
    const output = execSync("pgrep -f 'ollama runner --model' || true", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return output.length > 0;
  } catch (_) {
    return false;
  }
}

function evictOllamaRunner(reason) {
  warn(`[MEMORY GOVERNOR] Evicting Ollama runner (${reason}).`);
  try {
    execSync("pkill -f 'ollama runner --model' || true", { stdio: "ignore" });
    lastMemoryGovernorReason = reason;
    writeHeartbeat({ memoryGovernorReason: reason, memoryGovernorActionAt: new Date().toISOString() });
  } catch (e) {
    err(`[MEMORY GOVERNOR] Failed to evict Ollama runner: ${e.message}`);
  }
}

async function loadMemoryGovernorState() {
  try {
    const setting = await prisma.globalSetting.findUnique({
      where: { key: MEMORY_GOVERNOR_STATE_KEY },
      select: { value: true },
    });
    const value = setting?.value && typeof setting.value === "object" ? setting.value : {};
    memoryGovernorPolicy = normalizeMemoryGovernorPolicy(value.policy || DEFAULT_MEMORY_GOVERNOR_POLICY);
    memoryGovernorObservedState = createMemoryGovernorObservedState(value.observedState || {});
    lastMemoryGovernorActionAt = value.lastActionAt ? new Date(value.lastActionAt).getTime() : 0;
    lastMemoryGovernorReason = typeof value.lastActionReason === "string" ? value.lastActionReason : null;
  } catch (error) {
    warn(`[MEMORY GOVERNOR] Failed to load persisted state: ${error.message}`);
  }
}

async function persistMemoryGovernorState(event = null) {
  try {
    const existing = await prisma.globalSetting.findUnique({
      where: { key: MEMORY_GOVERNOR_STATE_KEY },
      select: { value: true },
    });
    const currentValue = existing?.value && typeof existing.value === "object" ? existing.value : {};
    const priorEvents = Array.isArray(currentValue.recentEvents) ? currentValue.recentEvents : [];
    const nextEvents = event ? [...priorEvents, event].slice(-MEMORY_GOVERNOR_EVENTS_LIMIT) : priorEvents;
    const counters = { ...(currentValue.counters && typeof currentValue.counters === "object" ? currentValue.counters : {}) };
    if (event?.action && event.action !== MEMORY_GOVERNOR_ACTIONS.NONE) {
      counters[event.action] = Number(counters[event.action] || 0) + 1;
    }

    await prisma.globalSetting.upsert({
      where: { key: MEMORY_GOVERNOR_STATE_KEY },
      create: {
        key: MEMORY_GOVERNOR_STATE_KEY,
        value: {
          policy: memoryGovernorPolicy,
          observedState: memoryGovernorObservedState,
          lastActionAt: lastMemoryGovernorActionAt ? new Date(lastMemoryGovernorActionAt).toISOString() : null,
          lastActionReason: lastMemoryGovernorReason,
          latestEvaluation: latestMemoryGovernorEvaluation,
          recentEvents: nextEvents,
          counters,
        },
      },
      update: {
        value: {
          policy: memoryGovernorPolicy,
          observedState: memoryGovernorObservedState,
          lastActionAt: lastMemoryGovernorActionAt ? new Date(lastMemoryGovernorActionAt).toISOString() : null,
          lastActionReason: lastMemoryGovernorReason,
          latestEvaluation: latestMemoryGovernorEvaluation,
          recentEvents: nextEvents,
          counters,
        },
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    warn(`[MEMORY GOVERNOR] Failed to persist state: ${error.message}`);
  }
}

function forceWorkerWake(reason) {
  const req = http.request(
    { hostname: "127.0.0.1", port: HEALTH_PORT, path: "/force", method: "POST", timeout: 3000 },
    (res) => {
      res.resume();
      log(`[MEMORY GOVERNOR] Worker wake requested (${reason}) status=${res.statusCode}.`);
    },
  );

  req.on("error", (e) => {
    warn(`[MEMORY GOVERNOR] Worker wake request failed (${reason}): ${e.message}`);
  });

  req.on("timeout", () => {
    req.destroy();
    warn(`[MEMORY GOVERNOR] Worker wake request timed out (${reason}).`);
  });

  req.end();
}

function applyMemoryGovernor() {
  if (isShuttingDown) return;

  const runnerPresent = hasOllamaRunnerProcess();
  const decision = evaluateMemoryGovernorPolicy({
    freeMemMb: resourceStats.freeMem,
    runnerPresent,
    workerProgress: latestWorkerProgress || {},
    lastActionAt: lastMemoryGovernorActionAt,
    observedState: memoryGovernorObservedState,
    policy: memoryGovernorPolicy,
  });
  memoryGovernorObservedState = decision.nextObservedState;
  latestMemoryGovernorEvaluation = {
    ts: new Date().toISOString(),
    freeMemMb: resourceStats.freeMem,
    resourceBand: resourceStats.resourceBand,
    runnerPresent,
    action: decision.action,
    reason: decision.reason,
    tierKey: decision.tierKey || null,
    gatedByCooldown: Boolean(decision.gatedByCooldown),
    gatedBySustain: Boolean(decision.gatedBySustain),
    sustainRemainingMs: Number(decision.sustainRemainingMs || 0),
    cooldownRemainingMs: Number(decision.cooldownRemainingMs || 0),
  };
  void persistMemoryGovernorState();

  if (decision.action === MEMORY_GOVERNOR_ACTIONS.NONE) return;

  lastMemoryGovernorActionAt = Date.now();
  evictOllamaRunner(decision.reason);
  const event = buildMemoryGovernorEvent({
    action: decision.action,
    reason: decision.reason,
    freeMemMb: resourceStats.freeMem,
    runnerPresent,
    workerProgress: latestWorkerProgress || {},
    policy: memoryGovernorPolicy,
    tierKey: decision.tierKey,
  });
  latestMemoryGovernorEvaluation = {
    ...latestMemoryGovernorEvaluation,
    actionTakenAt: event.ts,
  };

  if (decision.action === MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_RESTART_WORKER) {
    lastMemoryGovernorReason = decision.reason;
    void persistMemoryGovernorState(event);
    killWorker(`memory-governor:${decision.reason}`);
    return;
  }

  lastMemoryGovernorReason = decision.reason;
  void persistMemoryGovernorState(event);
  forceWorkerWake(`memory-governor:${decision.reason}`);
}

async function persistManagedServicePlan(plan) {
  await prisma.globalSetting.upsert({
    where: { key: MANAGED_SERVICE_STATE_KEY },
    create: { key: MANAGED_SERVICE_STATE_KEY, value: plan },
    update: { value: plan, updatedAt: new Date() },
  });
}

async function reconcileManagedServices() {
  try {
    const definitions = listManagedServiceDefinitions();
    const [currentState, observed] = await Promise.all([
      prisma.globalSetting.findUnique({
        where: { key: MANAGED_SERVICE_STATE_KEY },
        select: { value: true },
      }),
      collectManagedServiceObservations(definitions),
    ]);
    const plan = buildManagedServiceReconciliationPlan({
      definitions,
      observed,
      priorState: currentState?.value,
    });
    latestManagedServicePlan = plan;
    await persistManagedServicePlan(plan);

    for (const action of plan.actions) {
      if (action.serviceId === "check-local-foreground" && !workerProcess && !isShuttingDown) {
        warn("[MANAGED SERVICES] Foreground worker missing from reconciliation plan. Delegating to Guardian start path.");
        startWorker();
      } else if (action.serviceId === "check-local-snapshot" && !snapshotProcess && !isShuttingDown) {
        warn("[MANAGED SERVICES] Snapshot worker missing from reconciliation plan. Delegating to Guardian start path.");
        startSnapshotWorker();
      } else {
        log(`[MANAGED SERVICES] Planned ${action.type} for ${action.serviceId}; existing owner remains authoritative.`);
      }
    }
    writeHeartbeat();
  } catch (error) {
    warn(`[MANAGED SERVICES] Reconciliation failed: ${error.message}`);
  }
}

function reclaimPort(port) {
  try {
    execSync(`lsof -t -i :${port} | xargs kill -9 || true`, { stdio: "ignore" });
  } catch (_) {}
}

function buildWorkFingerprint(progress = {}) {
  return JSON.stringify({
    stage: progress.stage || null,
    activeTask: progress.activeTask || null,
    currentCompany: progress.currentCompany || null,
  });
}

/**
 * Performs a health scan of the local AI worker.
 * Triggers a process kill if the worker is found to be stuck or unresponsive.
 */
function pollHealth() {
  checkResources();
  checkOllama();
  if (!workerAlive) return;

  // Respect startup grace period
  if (startedAt && Date.now() - startedAt < STARTUP_GRACE_MS) return;

  const req = http.get(
    { hostname: "127.0.0.1", port: HEALTH_PORT, path: HEALTH_PATH, timeout: 8000 },
    (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          const prog = data.progress || {};
          latestWorkerProgress = prog;
          const freshAt = prog.lastProgressAt || null;
          const nextFingerprint = buildWorkFingerprint(prog);

          // Detect stuck: same lastProgressAt for > STUCK_MS while state is "running"
          if (prog.state === "running" && freshAt && freshAt === lastProgressAt) {
            const staleSince = Date.now() - new Date(freshAt).getTime();
            if (staleSince > STUCK_MS) {
              warn(`Worker STUCK for ${Math.round(staleSince / 60000)} min at stage=${prog.stage} company=${prog.currentCompany}. Killing.`);
              killWorker("stuck");
              return;
            }
          }

          if (prog.state === "running" && prog.activeTask) {
            if (nextFingerprint !== currentWorkFingerprint) {
              currentWorkFingerprint = nextFingerprint;
              currentWorkStartedAt = Date.now();
            } else if (currentWorkStartedAt && Date.now() - currentWorkStartedAt > STUCK_MS) {
              warn(
                `Worker exceeded ${Math.round(STUCK_MS / 60000)} minutes on the same task (${prog.activeTask}) for ${prog.currentCompany || "-"}. Killing.`,
              );
              killWorker("same-task-timeout");
              return;
            }
          } else {
            currentWorkFingerprint = null;
            currentWorkStartedAt = null;
          }

          if (freshAt) lastProgressAt = freshAt;

          log(`HEALTH OK | state=${prog.state} stage=${prog.stage} cycle=${prog.cycleCount} company=${prog.currentCompany || "-"}`);
          writeHeartbeat({ healthState: prog.state, healthStage: prog.stage, lastProgressAt: freshAt });
        } catch (e) {
          warn(`Health parse error: ${e.message}`);
        }
      });
    }
  );

  req.on("error", (e) => {
    warn(`Health check failed: ${e.message}`);
    writeHeartbeat({ healthError: e.message });
    // Workers that are still within grace period will have failed their first check — ignore
    if (startedAt && Date.now() - startedAt > STARTUP_GRACE_MS * 2) {
      warn(`Worker unresponsive after grace period. Killing.`);
      killWorker("unresponsive");
    }
  });

  req.on("timeout", () => {
    req.destroy();
    warn(`Health check timeout.`);
  });
}

function pollSnapshotWorkerHealth() {
  if (!snapshotWorkerAlive) return;
  if (snapshotStartedAt && Date.now() - snapshotStartedAt < STARTUP_GRACE_MS) return;

  const req = http.get(
    { hostname: "127.0.0.1", port: SNAPSHOT_HEALTH_PORT, path: HEALTH_PATH, timeout: 8000 },
    (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          const prog = data.progress || {};
          const freshAt = prog.lastProgressAt || null;
          const nextFingerprint = buildWorkFingerprint(prog);

          if (prog.state === "running" && freshAt && freshAt === lastSnapshotProgressAt) {
            const staleSince = Date.now() - new Date(freshAt).getTime();
            if (staleSince > STUCK_MS) {
              warn(`Snapshot worker STUCK for ${Math.round(staleSince / 60000)} min at stage=${prog.stage}. Killing.`);
              killSnapshotWorker("stuck");
              return;
            }
          }

          if (prog.state === "running" && prog.activeTask) {
            if (nextFingerprint !== currentSnapshotFingerprint) {
              currentSnapshotFingerprint = nextFingerprint;
              currentSnapshotStartedAt = Date.now();
            } else if (currentSnapshotStartedAt && Date.now() - currentSnapshotStartedAt > STUCK_MS) {
              warn(
                `Snapshot worker exceeded ${Math.round(STUCK_MS / 60000)} minutes on the same task (${prog.activeTask}). Killing.`,
              );
              killSnapshotWorker("same-task-timeout");
              return;
            }
          } else {
            currentSnapshotFingerprint = null;
            currentSnapshotStartedAt = null;
          }

          if (freshAt) lastSnapshotProgressAt = freshAt;

          log(`SNAPSHOT OK | state=${prog.state} stage=${prog.stage}`);
          writeHeartbeat({ snapshotState: prog.state, snapshotStage: prog.stage, lastSnapshotProgressAt: freshAt });
        } catch (e) {
          warn(`Snapshot health parse error: ${e.message}`);
        }
      });
    }
  );

  req.on("error", (e) => {
    warn(`Snapshot worker health check failed: ${e.message}`);
    writeHeartbeat({ snapshotHealthError: e.message });
    if (snapshotStartedAt && Date.now() - snapshotStartedAt > STARTUP_GRACE_MS * 2) {
      warn("Snapshot worker unresponsive after grace period. Killing.");
      killSnapshotWorker("unresponsive");
    }
  });

  req.on("timeout", () => {
    req.destroy();
    warn("Snapshot worker health check timeout.");
  });
}

/**
 * Actively probes the Status Server port to ensure the dashboard is live.
 * Restarts the status server if port 10006 is unresponsive.
 */
function checkStatusServerHealth() {
  const req = http.get({ hostname: "127.0.0.1", port: STATUS_HEALTH_PORT, path: "/health", timeout: 5000 }, (res) => {
    if (res.statusCode !== 200) {
      warn(`Status server returned non-200 status: ${res.statusCode}.`);
    }
    res.resume();
  });

  req.on("error", (e) => {
    warn(`STATUS SERVER UNREACHABLE on port ${STATUS_HEALTH_PORT}: ${e.message}. Re-igniting...`);
    // Kill existing processes on that port just in case of zombies
    try {
      execSync(`lsof -t -i :${STATUS_HEALTH_PORT} | xargs kill -9 || true`);
    } catch (_) {}
    // The launchStatusServer logic in the boot section will handle the restart via the 'exit' handler
    // but if it's already dead, we manually trigger it if needed.
  });

  req.on("timeout", () => {
    req.destroy();
    warn("Status server health check timed out.");
  });
}

// Process management

/**
 * Forcefully terminates the active local AI worker.
 * Attempts SIGTERM first, followed by SIGKILL if necessary.
 * 
 * @param {string} reason - Human-readable reason for termination
 */
function killWorker(reason) {
  if (!workerProcess) return;
  warn(`Killing worker (reason: ${reason}) pid=${workerProcess.pid}`);
  currentWorkFingerprint = null;
  currentWorkStartedAt = null;
  try { workerProcess.kill("SIGTERM"); } catch (_) {}
  setTimeout(() => {
    try { if (workerProcess) workerProcess.kill("SIGKILL"); } catch (_) {}
  }, 5000);
}

function killSnapshotWorker(reason) {
  if (!snapshotProcess) return;
  warn(`Killing snapshot worker (reason: ${reason}) pid=${snapshotProcess.pid}`);
  currentSnapshotFingerprint = null;
  currentSnapshotStartedAt = null;
  try { snapshotProcess.kill("SIGTERM"); } catch (_) {}
  setTimeout(() => {
    try { if (snapshotProcess) snapshotProcess.kill("SIGKILL"); } catch (_) {}
  }, 5000);
}

/**
 * Spawns a new local AI worker child process.
 * Configures pipes for standard out/err and initializes exit handlers.
 */
function startWorker() {
  if (workerProcess) return;

  log(`Starting ${WORKER_RUNNER.humanName} (attempt #${restartCount + 1}) | back-off=${restartMs}ms`);
  startedAt = Date.now();
  lastProgressAt = null;
  currentWorkFingerprint = null;
  currentWorkStartedAt = null;
  workerAlive = false;
  reclaimPort(HEALTH_PORT);

  const child = spawn(WORKER_COMMAND, [], {
    cwd: path.join(__dirname, ".."),
    env: buildRunnerEnvironment(WORKER_RUNNER_ID, {
      USE_SAFE_MODE: useSafeMode ? "true" : "false",
      FALLBACK_MODEL: FALLBACK_MODEL,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  workerProcess = child;
  workerAlive   = true;

  child.stdout.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => log(`[${WORKER_RUNNER.processTitle}] ${line}`));
  });
  child.stderr.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => err(`[${WORKER_RUNNER.processTitle}] ${line}`));
  });

  child.on("exit", (code, signal) => {
    workerProcess = null;
    workerAlive   = false;
    warn(`${WORKER_RUNNER.humanName} exited | code=${code} signal=${signal} restarts=${restartCount}`);
    writeHeartbeat({ exitCode: code, exitSignal: signal });
    if (isShuttingDown) {
      log("Guardian shutdown in progress. Worker restart suppressed.");
      return;
    }
    scheduleRestart();
  });

  child.on("error", (e) => {
    err(`${WORKER_RUNNER.humanName} spawn error: ${e.message}`);
    workerProcess = null;
    workerAlive   = false;
    if (isShuttingDown) {
      log("Guardian shutdown in progress. Spawn recovery suppressed.");
      return;
    }
    scheduleRestart();
  });

  restartCount++;
  writeHeartbeat();
  log(`${WORKER_RUNNER.humanName} PID=${child.pid}`);
}

function startSnapshotWorker() {
  if (snapshotProcess) return;

  log(`Starting ${SNAPSHOT_RUNNER.humanName} (attempt #${snapshotRestartCount + 1}) | back-off=${snapshotRestartMs}ms`);
  snapshotStartedAt = Date.now();
  lastSnapshotProgressAt = null;
  currentSnapshotFingerprint = null;
  currentSnapshotStartedAt = null;
  snapshotWorkerAlive = false;
  reclaimPort(SNAPSHOT_HEALTH_PORT);

  const child = spawn(SNAPSHOT_COMMAND, [], {
    cwd: path.join(__dirname, ".."),
    env: buildRunnerEnvironment(SNAPSHOT_RUNNER_ID),
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  snapshotProcess = child;
  snapshotWorkerAlive = true;

  child.stdout.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => log(`[${SNAPSHOT_RUNNER.processTitle}] ${line}`));
  });
  child.stderr.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => err(`[${SNAPSHOT_RUNNER.processTitle}] ${line}`));
  });

  child.on("exit", (code, signal) => {
    snapshotProcess = null;
    snapshotWorkerAlive = false;
    warn(`${SNAPSHOT_RUNNER.humanName} exited | code=${code} signal=${signal} restarts=${snapshotRestartCount}`);
    writeHeartbeat({ snapshotExitCode: code, snapshotExitSignal: signal });
    if (isShuttingDown) {
      log("Guardian shutdown in progress. Snapshot worker restart suppressed.");
      return;
    }
    scheduleSnapshotRestart();
  });

  child.on("error", (e) => {
    err(`${SNAPSHOT_RUNNER.humanName} spawn error: ${e.message}`);
    snapshotProcess = null;
    snapshotWorkerAlive = false;
    if (isShuttingDown) {
      log("Guardian shutdown in progress. Snapshot worker spawn recovery suppressed.");
      return;
    }
    scheduleSnapshotRestart();
  });

  snapshotRestartCount++;
  writeHeartbeat();
  log(`${SNAPSHOT_RUNNER.humanName} PID=${child.pid}`);
}

/**
 * Schedules a worker restart with exponential back-off logic.
 */
function scheduleRestart() {
  if (isShuttingDown) {
    log("Guardian shutdown in progress. Scheduled restart skipped.");
    return;
  }
  const delay = restartMs;
  restartMs = Math.min(restartMs * 2, RESTART_MAX_MS);
  warn(`Scheduling restart in ${Math.round(delay / 1000)}s...`);
  setTimeout(() => {
    restartMs = RESTART_BASE_MS; // reset back-off on successful launch
    startWorker();
  }, delay);
}

function scheduleSnapshotRestart() {
  if (isShuttingDown) {
    log("Guardian shutdown in progress. Snapshot restart skipped.");
    return;
  }
  const delay = snapshotRestartMs;
  snapshotRestartMs = Math.min(snapshotRestartMs * 2, RESTART_MAX_MS);
  warn(`Scheduling snapshot worker restart in ${Math.round(delay / 1000)}s...`);
  setTimeout(() => {
    snapshotRestartMs = RESTART_BASE_MS;
    startSnapshotWorker();
  }, delay);
}

// Boot
async function bootGuardian() {
  log("═══════════════════════════════════════════");
  log(`  ${RUNNER.humanName.toUpperCase()} STARTING`);
  log(`  Runner:   ${RUNNER.id}`);
  log(`  Process:  ${RUNNER.processTitle}`);
  log(`  Watching: ${WORKER_SCRIPT}`);
  log(`  Snapshot: ${SNAPSHOT_SCRIPT}`);
  log(`  Status:   ${STATUS_SCRIPT}`);
  log(`  Log:      ${LOG_FILE}`);
  log(`  PID:      ${process.pid}`);
  log("═══════════════════════════════════════════");

  await loadMemoryGovernorState();

  startWorker();
  startSnapshotWorker();

  // Launch the status server as a sibling process (no restart logic — it's stateless)
  (function launchStatusServer() {
  reclaimPort(STATUS_HEALTH_PORT);
  const s = spawn(STATUS_COMMAND, [], {
    cwd: path.join(__dirname, ".."),
    env: buildRunnerEnvironment(STATUS_RUNNER_ID),
    stdio: ["ignore", "pipe", "pipe"],
  });
  s.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => log(`[${STATUS_RUNNER.processTitle}] ${l}`)));
  s.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => warn(`[${STATUS_RUNNER.processTitle}] ${l}`)));
  s.on("exit", (code) => {
    warn(`${STATUS_RUNNER.humanName} exited (code=${code}). Restarting in 5s...`);
    setTimeout(launchStatusServer, 5000);
  });
  log(`${STATUS_RUNNER.humanName} PID=${s.pid} -> http://127.0.0.1:10006`);
  })();

  // Periodic health poll
  healthCheckTimer = setInterval(pollHealth, HEALTH_INTERVAL);
  setInterval(pollSnapshotWorkerHealth, HEALTH_INTERVAL);

  // Periodic status server health poll
  setInterval(checkStatusServerHealth, STATUS_HEALTH_INTERVAL);

/**
 * Checks for a restart signal file from the status server.
 */
function checkRestartSignal() {
  const signalPath = path.join(__dirname, "..", "logs", "restart.signal");
  if (fs.existsSync(signalPath)) {
    warn("RESTART SIGNAL DETECTED. Restarting the local AI worker...");
    try { fs.unlinkSync(signalPath); } catch (_) {}
    killWorker("Manual restart requested via dashboard");
  }
}

  // Watch for restart signals every 5s
  setInterval(checkRestartSignal, 5000);

  log("[GUARDIAN] SCI sidecar audits disabled in watchdog mode; queue worker is the only mutation authority.");

  // Periodic heartbeat even when idle
  heartbeatTimer = setInterval(() => writeHeartbeat(), 15_000);

  // Periodic command bridge check
  commandTimer = setInterval(pollCommands, 20_000); 
  setInterval(reconcileManagedServices, HEALTH_INTERVAL);

  log("[GUARDIAN] Scheduler unification active: taxonomy audits and kanban recomputes are queue-owned, not watchdog-owned.");

  // Prime truth surfaces immediately instead of waiting for the first interval.
  checkResources();
  await reconcileManagedServices();
  writeHeartbeat();
  setTimeout(pollHealth, 1_000);
  setTimeout(pollSnapshotWorkerHealth, 1_500);
  setTimeout(checkStatusServerHealth, 2_000);
}

// Graceful self-shutdown
process.on("SIGTERM", () => {
  isShuttingDown = true;
  log("Guardian received SIGTERM. Shutting down worker.");
  killWorker("guardian-shutdown");
  killSnapshotWorker("guardian-shutdown");
  setTimeout(() => process.exit(0), 6000);
});

process.on("SIGINT", () => {
  isShuttingDown = true;
  log("Guardian received SIGINT. Shutting down worker.");
  killWorker("guardian-shutdown");
  killSnapshotWorker("guardian-shutdown");
  setTimeout(() => process.exit(0), 6000);
});

process.on("uncaughtException", (e) => {
  err(`Guardian uncaught exception: ${e.stack}`);
});

bootGuardian().catch((error) => {
  err(`Guardian boot failure: ${error.stack || error.message || error}`);
  process.exit(1);
});
