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
const prisma = new PrismaClient();

// --- CONFIGURATION ---
const WORKER_SCRIPT    = path.join(__dirname, "sync.js");
const STATUS_SCRIPT    = path.join(__dirname, "status-server.js");
const LOG_DIR          = path.join(__dirname, "..", "logs");
const LOG_FILE         = path.join(LOG_DIR, "guardian.log");
const HEARTBEAT_FILE   = path.join(LOG_DIR, "guardian-heartbeat.json");
const MAX_LOG_LINES    = 10_000;

const HEALTH_PORT             = 10005;
const STATUS_HEALTH_PORT      = 10006;
const HEALTH_PATH             = "/health";
const STUCK_MS                = 15 * 60 * 1000; // 15 min without progress = stuck
const STARTUP_GRACE_MS        = 60 * 1000;      // 1 min grace
const RESTART_BASE_MS         = 5000;
const RESTART_MAX_MS          = 60000;
const HEALTH_INTERVAL         = 30000;          // 30s check
const STATUS_HEALTH_INTERVAL  = 15000;          // 15s check
const SCI_AUDIT_INTERVAL      = 20 * 60 * 1000; // 20 min audit cycle

/**
 * SCI (Self-Correcting Intelligence) State
 * Tracks the autonomous audit heartbeat.
 */
let lastAuditAt = 0;

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
let commandTimer       = null;

// --- Command bridge supervision ---

/**
 * Polls the database for pending system commands issued from the web dashboard.
 */
async function pollCommands() {
  try {
    const commands = await prisma.systemCommand.findMany({
      where: { status: "PENDING" },
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
      break;
    case "PURGE_CACHE":
      log(`[BRIDGE] Purging local model cache`);
      killWorker("dashboard-purge-cache");
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
 * Performs a health scan of the trinity Worker.
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
 * Forcefully terminates the active trinity Worker.
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
 * Spawns a new trinity Worker child process.
 * Configures pipes for standard out/err and initializes exit handlers.
 */
function startWorker() {
  if (workerProcess) return;

  log(`Starting trinity Worker (attempt #${restartCount + 1}) | back-off=${restartMs}ms`);
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
log("  checklist GUARDIAN STARTING");
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

// Periodic status server health poll
setInterval(checkStatusServerHealth, STATUS_HEALTH_INTERVAL);

/**
 * Checks for a restart signal file from the status server.
 */
function checkRestartSignal() {
  const signalPath = path.join(__dirname, "..", "logs", "restart.signal");
  if (fs.existsSync(signalPath)) {
    warn("RESTART SIGNAL DETECTED. Re-igniting trinity engine...");
    try { fs.unlinkSync(signalPath); } catch (_) {}
    killWorker("Manual restart requested via dashboard");
  }
}

// Watch for restart signals every 5s
setInterval(checkRestartSignal, 5000);

/**
 * SCI (Self-Correcting Intelligence) Loop
 * Periodically audits the entire intelligence inventory for architectural purity.
 */
async function runSCIAudit() {
  log("─────────────────────────────────────────────────────────────────────────");
  log("  SCI HEARTBEAT: Starting Intelligence Taxonomy Audit...");
  log("─────────────────────────────────────────────────────────────────────────");
  
  const { exec } = require("child_process");
  const node = process.execPath;
  const auditScript = path.join(__dirname, "sci-audit.js");
  
  exec(`${node} ${auditScript}`, (error, stdout, stderr) => {
    if (error) {
      err(`[SCI] Audit failed: ${error.message}`);
      return;
    }
    if (stderr) warn(`[SCI] Audit warnings: ${stderr}`);
    if (stdout) {
      const lines = stdout.split("\n").filter(Boolean);
      lines.forEach(l => log(`[SCI] ${l}`));
    }
    log(`[SCI] Audit cycle completed at ${new Date().toISOString()}`);
  });
}

// Trigger SCI Audit every 20 minutes
setInterval(runSCIAudit, SCI_AUDIT_INTERVAL);
// Also trigger one 30 seconds after boot to ensure early health
setTimeout(runSCIAudit, 30000);

// Periodic heartbeat even when idle
heartbeatTimer = setInterval(() => writeHeartbeat(), 15_000);

// Periodic command bridge check
commandTimer = setInterval(pollCommands, 20_000); 

// Periodic Kanban Orchestration
const KANBAN_RECOMPUTE_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Periodic Intelligence Audit (SCI Layer §M4.1)
// Runs every 20 minutes. Audits a batch of cards for taxonomy purity.
const AUDIT_INTERVAL = 20 * 60 * 1000; 

async function auditIntelligenceJob() {
  try {
    const { auditCardTaxonomy } = require("./lib/auditor");
    const { reorganizeCard } = require("./lib/reorganizer");
    const companies = await prisma.company.findMany({ select: { id: true, name: true } });

    log(`[AUDITOR] Starting Tri-Layer taxonomy audit for ${companies.length} company/companies...`);

    for (const company of companies) {
      // Audit a batch of 5 cards per type per run to avoid OOM or timeout
      const flashcards = await prisma.flashcard.findMany({
        where: { companyId: company.id, activityState: "ACTIVE", lastAuditedAt: null },
        take: 5
      });
      const goalcards = await prisma.goalcard.findMany({
        where: { companyId: company.id, activityState: "ACTIVE", lastAuditedAt: null },
        take: 5
      });
      const taskcards = await prisma.nBAItem.findMany({
        where: { companyId: company.id, status: "PENDING", lastAuditedAt: null },
        take: 5
      });

      const allCards = [
        ...flashcards.map(c => ({ ...c, layer: "KNOWLEDGE" })),
        ...goalcards.map(c => ({ ...c, layer: "GOAL" })),
        ...taskcards.map(c => ({ ...c, layer: "TASK" }))
      ];

      for (const card of allCards) {
        log(`[AUDITOR] Auditing ${card.layer} card: ${card.title.slice(0, 40)}...`);
        const result = await auditCardTaxonomy(prisma, company, card, card.layer);
        
        if (result && result.isMismatch && result.confidence >= 7) {
          warn(`[AUDITOR] 🚩 MISMATCH FOUND: Card ${card.id} should be ${result.suggestedLayer} (Reason: ${result.reasoning})`);
          await reorganizeCard(prisma, card, card.layer, result.suggestedLayer);
        }

        // Update lastAuditedAt to prevent re-auditing same items in next run
        const now = new Date();
        if (card.layer === "KNOWLEDGE") await prisma.flashcard.update({ where: { id: card.id }, data: { lastAuditedAt: now } });
        if (card.layer === "GOAL") await prisma.goalcard.update({ where: { id: card.id }, data: { lastAuditedAt: now } });
        if (card.layer === "TASK") await prisma.nBAItem.update({ where: { id: card.id }, data: { lastAuditedAt: now } });
      }
    }
    log(`[AUDITOR] Taxonomy audit job complete.`);
  } catch (e) {
    err(`[AUDITOR] Audit job failed: ${e.message}`);
  }
}

async function recomputeAllKanbanBoards() {
  try {
    const { recomputeFrontier } = require("./lib/frontier");
    const companies = await prisma.company.findMany({ select: { id: true, name: true } });
    log(`[KANBAN] Recomputing tactical boards for ${companies.length} company/companies...`);
    for (const company of companies) {
      await recomputeFrontier(prisma, company);
    }
    log(`[KANBAN] Tactical board recompute complete.`);
  } catch (e) {
    err(`[KANBAN] Recompute failed: ${e.message}`);
  }
}

setInterval(recomputeAllKanbanBoards, KANBAN_RECOMPUTE_INTERVAL);
setInterval(auditIntelligenceJob, AUDIT_INTERVAL);

// Also run once at startup after a short grace period
setTimeout(recomputeAllKanbanBoards, 30_000);
setTimeout(auditIntelligenceJob, 60_000);

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
