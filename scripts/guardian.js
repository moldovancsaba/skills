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
const { getResourceBand } = require("./lib/runtime/resource-bands");
const prisma = new PrismaClient();

// --- CONFIGURATION ---
const WORKER_SCRIPT    = path.join(__dirname, "sync.js");
const STATUS_SCRIPT    = path.join(__dirname, "status-server.js");
const SNAPSHOT_SCRIPT  = path.join(__dirname, "snapshot-worker.js");
const LOG_DIR          = path.join(__dirname, "..", "logs");
const LOG_FILE         = path.join(LOG_DIR, "guardian.log");
const HEARTBEAT_FILE   = path.join(LOG_DIR, "guardian-heartbeat.json");
const MAX_LOG_LINES    = 10_000;

const HEALTH_PORT             = 10005;
const SNAPSHOT_HEALTH_PORT    = 10007;
const STATUS_HEALTH_PORT      = 10006;
const HEALTH_PATH             = "/health";
const STUCK_MS                = 15 * 60 * 1000; // 15 min without progress = stuck
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
  const line = `[${ts()}] [${level}] ${msg}`;
  console.log(line);
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (_) {}
}

const log  = (msg) => writeLog("INFO ", msg);
const warn = (msg) => writeLog("WARN ", msg);
const err  = (msg) => writeLog("ERROR", msg);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
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
let healthCheckTimer   = null;
let heartbeatTimer     = null;
let useSafeMode        = false; // If true, tells worker to use fallback model
let resourceStats      = { freeMem: 0, totalMem: 0, loadAvg: [] };
let commandTimer       = null;
let isShuttingDown     = false;

// --- Command bridge supervision ---

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

// --- HEARTBEAT ---

/**
 * Writes the Guardian's internal state to a JSON file for external observability.
 * 
 * @param {object} [extra] - Additional metadata to include
 */
function writeHeartbeat(extra = {}) {
  const data = {
    guardianPid:   process.pid,
    workerPid:     workerProcess?.pid ?? null,
    snapshotWorkerPid: snapshotProcess?.pid ?? null,
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
    ...extra,
  };
  try {
    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(data, null, 2));
  } catch (_) {}
}

// --- HEALTH MONITORING ---

/**
 * Checks if the Ollama AI server is responsive and model is loadable.
 */
function checkOllama() {
  const url = new URL(OLLAMA_URL);
  
  // 1. Basic connection check
  const req = http.get({ hostname: url.hostname, port: url.port, path: "/", timeout: 2000 }, (res) => {
    if (res.statusCode !== 200) {
      warn(`Ollama server returned status ${res.statusCode}`);
      return;
    }
    
    // 2. Advanced health check: check if the model is loadable
    const model = process.env.OLLAMA_MODEL || "gemma3:1b";
    const payload = JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], stream: false });
    
    const chatReq = http.request(
      new URL("/api/chat", OLLAMA_URL),
      { method: "POST", headers: { "Content-Type": "application/json" }, timeout: 5000 },
      (chatRes) => {
        let body = "";
        chatRes.on("data", (c) => body += c);
        chatRes.on("end", () => {
          if (chatRes.statusCode === 500) {
            err(`Ollama MODEL FAILURE (500): ${body.slice(0, 100)}`);
            if (!useSafeMode) {
              warn("Triggering SAFE MODE (fallback to granite4:350m)");
              useSafeMode = true;
              restartOllama(); // Attempt service reset
            }
          } else if (chatRes.statusCode === 200) {
            if (useSafeMode) log("Ollama primary model recovered. Disabling Safe Mode.");
            useSafeMode = false;
          }
        });
      }
    );
    chatReq.on("error", () => {});
    chatReq.write(payload);
    chatReq.end();
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
          const freshAt = prog.lastProgressAt || null;

          // Detect stuck: same lastProgressAt for > STUCK_MS while state is "running"
          if (prog.state === "running" && freshAt && freshAt === lastProgressAt) {
            const staleSince = Date.now() - new Date(freshAt).getTime();
            if (staleSince > STUCK_MS) {
              warn(`Worker STUCK for ${Math.round(staleSince / 60000)} min at stage=${prog.stage} company=${prog.currentCompany}. Killing.`);
              killWorker("stuck");
              return;
            }
          }

          if (freshAt) lastProgressAt = freshAt;

          log(`HEALTH OK | state=${prog.state} stage=${prog.stage} cycle=${prog.cycleCount} company=${prog.currentCompany || "-"}`);
          writeHeartbeat({ healthState: prog.state, healthStage: prog.stage });
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

          if (prog.state === "running" && freshAt && freshAt === lastSnapshotProgressAt) {
            const staleSince = Date.now() - new Date(freshAt).getTime();
            if (staleSince > STUCK_MS) {
              warn(`Snapshot worker STUCK for ${Math.round(staleSince / 60000)} min at stage=${prog.stage}. Killing.`);
              killSnapshotWorker("stuck");
              return;
            }
          }

          if (freshAt) lastSnapshotProgressAt = freshAt;

          log(`SNAPSHOT OK | state=${prog.state} stage=${prog.stage}`);
          writeHeartbeat({ snapshotState: prog.state, snapshotStage: prog.stage });
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
  const req = http.get({ hostname: "127.0.0.1", port: STATUS_HEALTH_PORT, path: "/", timeout: 5000 }, (res) => {
    if (res.statusCode !== 200) {
      warn(`Status server returned non-200 status: ${res.statusCode}.`);
    }
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

// --- PROCESS MANAGEMENT ---

/**
 * Forcefully terminates the active local AI worker.
 * Attempts SIGTERM first, followed by SIGKILL if necessary.
 * 
 * @param {string} reason - Human-readable reason for termination
 */
function killWorker(reason) {
  if (!workerProcess) return;
  warn(`Killing worker (reason: ${reason}) pid=${workerProcess.pid}`);
  try { workerProcess.kill("SIGTERM"); } catch (_) {}
  setTimeout(() => {
    try { if (workerProcess) workerProcess.kill("SIGKILL"); } catch (_) {}
  }, 5000);
}

function killSnapshotWorker(reason) {
  if (!snapshotProcess) return;
  warn(`Killing snapshot worker (reason: ${reason}) pid=${snapshotProcess.pid}`);
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

  log(`Starting local AI worker (attempt #${restartCount + 1}) | back-off=${restartMs}ms`);
  startedAt = Date.now();
  lastProgressAt = null;
  workerAlive = false;

  const node = process.execPath;  // same node binary that runs guardian.js
  const child = spawn(node, [WORKER_SCRIPT], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      USE_SAFE_MODE: useSafeMode ? "true" : "false",
      FALLBACK_MODEL: FALLBACK_MODEL,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  workerProcess = child;
  workerAlive   = true;

  child.stdout.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => log(`[WORKER] ${line}`));
  });
  child.stderr.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => err(`[WORKER] ${line}`));
  });

  child.on("exit", (code, signal) => {
    workerProcess = null;
    workerAlive   = false;
    warn(`Worker exited | code=${code} signal=${signal} restarts=${restartCount}`);
    writeHeartbeat({ exitCode: code, exitSignal: signal });
    if (isShuttingDown) {
      log("Guardian shutdown in progress. Worker restart suppressed.");
      return;
    }
    scheduleRestart();
  });

  child.on("error", (e) => {
    err(`Worker spawn error: ${e.message}`);
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
  log(`Worker PID=${child.pid}`);
}

function startSnapshotWorker() {
  if (snapshotProcess) return;

  log(`Starting snapshot worker (attempt #${snapshotRestartCount + 1}) | back-off=${snapshotRestartMs}ms`);
  snapshotStartedAt = Date.now();
  lastSnapshotProgressAt = null;
  snapshotWorkerAlive = false;

  const node = process.execPath;
  const child = spawn(node, [SNAPSHOT_SCRIPT], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  snapshotProcess = child;
  snapshotWorkerAlive = true;

  child.stdout.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => log(`[SNAPSHOT] ${line}`));
  });
  child.stderr.on("data", (d) => {
    String(d).split("\n").filter(Boolean).forEach((line) => err(`[SNAPSHOT] ${line}`));
  });

  child.on("exit", (code, signal) => {
    snapshotProcess = null;
    snapshotWorkerAlive = false;
    warn(`Snapshot worker exited | code=${code} signal=${signal} restarts=${snapshotRestartCount}`);
    writeHeartbeat({ snapshotExitCode: code, snapshotExitSignal: signal });
    if (isShuttingDown) {
      log("Guardian shutdown in progress. Snapshot worker restart suppressed.");
      return;
    }
    scheduleSnapshotRestart();
  });

  child.on("error", (e) => {
    err(`Snapshot worker spawn error: ${e.message}`);
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
  log(`Snapshot worker PID=${child.pid}`);
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

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
log("═══════════════════════════════════════════");
log("  checklist GUARDIAN STARTING");
log(`  Watching: ${WORKER_SCRIPT}`);
log(`  Log:      ${LOG_FILE}`);
log(`  PID:      ${process.pid}`);
log("═══════════════════════════════════════════");

startWorker();
startSnapshotWorker();

// Launch the status server as a sibling process (no restart logic — it's stateless)
(function launchStatusServer() {
  const node = process.execPath;
  const s = spawn(node, [STATUS_SCRIPT], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  s.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => log(`[STATUS] ${l}`)));
  s.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => warn(`[STATUS] ${l}`)));
  s.on("exit", (code) => {
    warn(`Status server exited (code=${code}). Restarting in 5s...`);
    setTimeout(launchStatusServer, 5000);
  });
  log(`Status server PID=${s.pid} → http://127.0.0.1:10006`);
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

log("[GUARDIAN] Scheduler unification active: taxonomy audits and kanban recomputes are queue-owned, not watchdog-owned.");

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
