#!/usr/bin/env node
/**
 * SOVEREIGN GUARDIAN
 * v0.11.4-STABLE
 * 
 * A production-grade watchdog for the Trinity Synthesis Worker (scripts/sync.js).
 * Responsibilities:
 *   - Launches sync.js as a child process.
 *   - Monitors it via the /health endpoint (Port 10005).
 *   - Detects crashes, hangs (stuck in a stage for > STUCK_MS), and exits.
 *   - Auto-restarts with exponential back-off (max 5 min).
 *   - Logs everything to logs/guardian.log with timestamps.
 */

"use strict";

const { spawn, execSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// --- CONFIGURATION ---
const WORKER_SCRIPT    = path.join(__dirname, "sync.js");
const STATUS_SCRIPT    = path.join(__dirname, "status-server.js");
const LOG_DIR          = path.join(__dirname, "..", "logs");
const LOG_FILE         = path.join(LOG_DIR, "guardian.log");
const HEARTBEAT_FILE   = path.join(LOG_DIR, "guardian-heartbeat.json");
const MAX_LOG_LINES    = 10_000;

const HEALTH_PORT      = 10005;
const HEALTH_PATH      = "/health";
const HEALTH_INTERVAL  = 30_000;   // 30s between health polls
const STUCK_MS         = 20 * 60 * 1000;  // 20 min with no lastProgressAt change = stuck
const STARTUP_GRACE_MS = 60_000;   // give the worker 60s to boot before checking health

const RESTART_BASE_MS  = 5_000;    // 5s initial back-off
const RESTART_MAX_MS   = 5 * 60 * 1000; // 5 min max back-off
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
let restartCount       = 0;
let restartMs          = RESTART_BASE_MS;
let workerAlive        = false;
let startedAt          = null;
let lastProgressAt     = null;    // last value from /health
let healthCheckTimer   = null;
let heartbeatTimer     = null;
let useSafeMode        = false; // If true, tells worker to use fallback model
let resourceStats      = { freeMem: 0, totalMem: 0, loadAvg: [] };

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
    workerAlive,
    restartCount,
    startedAt,
    lastHealthAt:  new Date().toISOString(),
    lastProgressAt,
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
    loadAvg: os.loadavg()
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
 * Performs a health scan of the Trinity Worker.
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

// --- PROCESS MANAGEMENT ---

/**
 * Forcefully terminates the active Trinity Worker.
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

/**
 * Spawns a new Trinity Worker child process.
 * Configures pipes for standard out/err and initializes exit handlers.
 */
function startWorker() {
  if (workerProcess) return;

  log(`Starting Trinity Worker (attempt #${restartCount + 1}) | back-off=${restartMs}ms`);
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
    scheduleRestart();
  });

  child.on("error", (e) => {
    err(`Worker spawn error: ${e.message}`);
    workerProcess = null;
    workerAlive   = false;
    scheduleRestart();
  });

  restartCount++;
  writeHeartbeat();
  log(`Worker PID=${child.pid}`);
}

/**
 * Schedules a worker restart with exponential back-off logic.
 */
function scheduleRestart() {
  const delay = restartMs;
  restartMs = Math.min(restartMs * 2, RESTART_MAX_MS);
  warn(`Scheduling restart in ${Math.round(delay / 1000)}s...`);
  setTimeout(() => {
    restartMs = RESTART_BASE_MS; // reset back-off on successful launch
    startWorker();
  }, delay);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
log("═══════════════════════════════════════════");
log("  SOVEREIGN GUARDIAN STARTING");
log(`  Watching: ${WORKER_SCRIPT}`);
log(`  Log:      ${LOG_FILE}`);
log(`  PID:      ${process.pid}`);
log("═══════════════════════════════════════════");

startWorker();

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

// Periodic heartbeat even when idle
heartbeatTimer = setInterval(() => writeHeartbeat(), 15_000);

// Graceful self-shutdown
process.on("SIGTERM", () => {
  log("Guardian received SIGTERM. Shutting down worker.");
  killWorker("guardian-shutdown");
  setTimeout(() => process.exit(0), 6000);
});

process.on("SIGINT", () => {
  log("Guardian received SIGINT. Shutting down worker.");
  killWorker("guardian-shutdown");
  setTimeout(() => process.exit(0), 6000);
});

process.on("uncaughtException", (e) => {
  err(`Guardian uncaught exception: ${e.stack}`);
});
