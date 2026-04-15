/**
 * SOVEREIGN STATUS SERVER
 * v0.11.4-STABLE
 * 
 * A standalone local-only monitoring dashboard for the Trinity Synthesis Worker.
 * Exposes a real-time HTTP interface for observing health, logs, and guardian status.
 * Runs on http://127.0.0.1:10006 — decoupled from the main web application.
 */

"use strict";

const http = require("http");
const fs   = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const STATUS_PORT      = 10006;
const LOG_FILE         = path.join(__dirname, "..", "logs", "guardian.log");
const HEARTBEAT_FILE   = path.join(__dirname, "..", "logs", "guardian-heartbeat.json");

// --- DATA FETCHERS ---

/**
 * Reads the latest heartbeat snapshot from the Guardian filesystem log.
 */
function readHeartbeat() {
  try { return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf8")); }
  catch { return null; }
}

/**
 * Extracts the last N lines from the Guardian log file.
 */
function readLogTail(n = 120) {
  try {
    return fs.readFileSync(LOG_FILE, "utf8")
      .split("\n").filter(Boolean).slice(-n);
  } catch { return []; }
}

// --- API ENDPOINTS ---

/**
 * Handles the GET /api/status request.
 * Aggregates worker health from DB, guardian heartbeats, and logs.
 */
async function handleApi(res) {
  const [setting, heartbeat] = await Promise.all([
    prisma.globalSetting.findUnique({ where: { key: "core_synthesis_progress" } }),
    Promise.resolve(readHeartbeat()),
  ]);
  const logTail = readLogTail(120);

  let worker = { online: false };
  if (setting) {
    const data = setting.value;
    const lastUpdate = new Date(setting.updatedAt).getTime();
    const isStale = (Date.now() - lastUpdate) > 10 * 60 * 1000;
    
    worker = {
      online: !isStale,
      ...data
    };
  }

  const payload = {
    ts: new Date().toISOString(),
    worker,
    guardian: heartbeat,
    logTail,
  };

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

/**
 * Handles the POST /api/reanimate request.
 * Signals a reanimation request by updating the database.
 */
async function handleReanimate(res) {
  try {
    const signal = {
      timestamp: new Date().toISOString(),
      requestedBy: "StatusServer"
    };

    await prisma.globalSetting.upsert({
      where: { key: "core_synthesis_reanimate_requested_at" },
      create: { key: "core_synthesis_reanimate_requested_at", value: signal },
      update: { value: signal, updatedAt: new Date() }
    });

    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ success: true, message: "Defibrillator engaged via DB pulse." }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
}

// ---------------------------------------------------------------------------
// HTML dashboard
// ---------------------------------------------------------------------------

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sovereign Trinity — Local AI Status</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #09090b;
      --surface:   #111113;
      --border:    rgba(255,255,255,0.08);
      --text:      #e4e4e7;
      --muted:     #71717a;
      --green:     #22c55e;
      --amber:     #f59e0b;
      --blue:      #3b82f6;
      --violet:    #8b5cf6;
      --fuchsia:   #d946ef;
      --cyan:      #06b6d4;
      --red:       #ef4444;
      --indigo:    #6366f1;
      --zinc:      #52525b;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      min-height: 100vh;
      padding: 24px;
    }

    /* ── Header ── */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
      animation: pulse 2s infinite;
    }
    .logo-dot.offline { background: var(--red); box-shadow: 0 0 8px var(--red); animation: none; }
    .logo h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
    .logo span { font-size: 11px; color: var(--muted); font-weight: 400; margin-left: 4px; }

    .refresh-info { font-size: 11px; color: var(--muted); }
    #last-updated { color: var(--text); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    /* ── Grid ── */
    .grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
    .grid-4 { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }

    /* ── Card ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .card-title {
      font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
      text-transform: uppercase; color: var(--muted); margin-bottom: 14px;
    }

    /* ── Status badge ── */
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 99px; font-size: 11px;
      font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
    }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; }
    .badge.online  { background: rgba(34,197,94,.12); color: var(--green); border: 1px solid rgba(34,197,94,.25); }
    .badge.offline { background: rgba(239,68,68,.12); color: var(--red);   border: 1px solid rgba(239,68,68,.25); }
    .badge.idle    { background: rgba(245,158,11,.12); color: var(--amber); border: 1px solid rgba(245,158,11,.25); }
    .badge.running { background: rgba(34,197,94,.12); color: var(--green); border: 1px solid rgba(34,197,94,.25); }

    /* ── Stage pill ── */
    .stage-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 99px;
      font-size: 11px; font-weight: 700; letter-spacing: 1px;
      text-transform: uppercase; border: 1px solid var(--border);
    }
    .stage-pill.IDLE       { color: var(--amber);   border-color: rgba(245,158,11,.3);  background: rgba(245,158,11,.08); }
    .stage-pill.SCHEDULING { color: var(--blue);    border-color: rgba(59,130,246,.3);  background: rgba(59,130,246,.08); }
    .stage-pill.ORBITING   { color: var(--indigo);  border-color: rgba(99,102,241,.3);  background: rgba(99,102,241,.08); }
    .stage-pill.SCRUBBING  { color: var(--cyan);    border-color: rgba(6,182,212,.3);   background: rgba(6,182,212,.08); }
    .stage-pill.WRITING    { color: var(--green);   border-color: rgba(34,197,94,.3);   background: rgba(34,197,94,.08); }
    .stage-pill.JUDGING    { color: var(--violet);  border-color: rgba(139,92,246,.3);  background: rgba(139,92,246,.08); }
    .stage-pill.ASCENDING  { color: var(--fuchsia); border-color: rgba(217,70,239,.3);  background: rgba(217,70,239,.08); }
    .stage-pill.MAINTENANCE{ color: var(--zinc);    border-color: rgba(82,82,91,.3);    background: rgba(82,82,91,.08); }

    /* ── Stat ── */
    .stat-value { font-size: 28px; font-weight: 900; letter-spacing: -1px; line-height: 1; }
    .stat-label { font-size: 11px; color: var(--muted); margin-top: 4px; }

    /* ── Progress bar ── */
    .progress-bar {
      height: 3px; background: var(--border); border-radius: 99px;
      overflow: hidden; margin-top: 10px;
    }
    .progress-fill {
      height: 100%; border-radius: 99px;
      background: var(--green);
      transition: width 0.5s ease;
    }
    .progress-fill.IDLE       { background: var(--amber); }
    .progress-fill.SCRUBBING  { background: var(--cyan); }
    .progress-fill.WRITING    { background: var(--green); }
    .progress-fill.JUDGING    { background: var(--violet); }
    .progress-fill.ASCENDING  { background: var(--fuchsia); }

    /* ── Log ── */
    .log-container {
      background: #050505; border: 1px solid var(--border);
      border-radius: 8px; padding: 14px 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px; line-height: 1.7;
      max-height: 440px; overflow-y: auto;
      color: #a1a1aa;
    }
    .log-line { white-space: pre-wrap; word-break: break-all; }
    .log-line.INFO  { color: #71717a; }
    .log-line.WORKER-INFO  { color: #a1a1aa; }
    .log-line.WARN  { color: var(--amber); }
    .log-line.ERROR { color: var(--red); }
    .log-line.HEALTH { color: var(--green); opacity: 0.7; }
    .log-line.SYNTHESIS { color: var(--blue); }
    .log-line.DEBUG { color: #52525b; }
    .log-line.MAINTENANCE { color: var(--cyan); opacity: 0.8; }

    /* ── Setting row ── */
    .setting-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 7px 0; border-bottom: 1px solid var(--border);
      font-size: 12px;
    }
    .setting-row:last-child { border-bottom: none; }
    .setting-key { color: var(--muted); }
    .setting-val { font-weight: 600; font-family: 'JetBrains Mono', monospace; font-size: 11px; }

    /* ── Guardian status ── */
    .guardian-ok  { color: var(--green); }
    .guardian-bad { color: var(--red); }

    .btn {
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--amber);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover { background: var(--amber); color: var(--bg); border-color: var(--amber); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    section { margin-bottom: 20px; }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <div class="logo-dot" id="header-dot"></div>
      <h1>Sovereign Trinity <span>— Local AI Status</span></h1>
    </div>
    <div class="refresh-info">Auto-refresh 10s &nbsp;|&nbsp; Last update: <span id="last-updated">—</span></div>
  </header>

  <!-- Row 1: Key metrics -->
  <section class="grid grid-4" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title">Worker</div>
      <div id="worker-badge"><span class="badge offline"><span class="badge-dot" style="background:var(--red)"></span>Offline</span></div>
    </div>
    <div class="card">
      <div class="card-title">Stage</div>
      <div id="stage-pill" class="stage-pill IDLE">IDLE</div>
    </div>
    <div class="card">
      <div class="card-title">Current Company</div>
      <div id="current-company" class="stat-value" style="font-size:18px">—</div>
      <div id="pass-label" class="stat-label"></div>
    </div>
    <div class="card">
      <div class="card-title">Cycles Completed</div>
      <div id="cycle-count" class="stat-value">0</div>
      <div class="stat-label">since last restart</div>
    </div>
  </section>

  <!-- Row 2: Progress + Guardian -->
  <section class="grid grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        Synthesis Progress
        <div id="defib-group" style="display:none">
          <button id="defib-btn" class="btn" onclick="reanimate()">⚡ Defibrillate</button>
        </div>
      </div>
      <div id="last-progress" style="font-size:12px;color:var(--muted);margin-bottom:10px">Last activity: —</div>
      <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
      <div style="margin-top:14px;font-size:11px;color:var(--muted)" id="stage-description">Waiting for worker...</div>
    </div>
    <div class="card">
      <div class="card-title">Guardian Watchdog</div>
      <div id="guardian-status" style="font-size:12px;color:var(--muted)">Reading...</div>
    </div>
  </section>

  <!-- Row 3: Settings + Log -->
  <section class="grid grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-title">Worker Configuration</div>
      <div id="settings-list"></div>
    </div>
    <div class="card">
      <div class="card-title">Live Log (last 120 lines)</div>
      <div class="log-container" id="log-container"></div>
    </div>
  </section>

  <script>
    const STAGE_DESC = {
      IDLE:        "Worker is resting between cycles.",
      SCHEDULING:  "Selecting the next company to process.",
      ORBITING:    "Entering orbit — entering company context.",
      SCRUBBING:   "Drafter reading raw sources → generating Flashcard DRAFTs.",
      WRITING:     "Writer refining DRAFT cards → promoting to CHECKED.",
      JUDGING:     "Judge auditing CHECKED cards → VERIFIED or demoted to DRAFT.",
      ASCENDING:   "VERIFIED Flashcards → generating NBA TaskCard DRAFTs.",
      MAINTENANCE: "Ageing cards (ACTIVE→EXPIRED→STALE→ARCHIVED).",
    };

    function classifyLog(line) {
      if (line.includes("HEALTH OK"))      return "HEALTH";
      if (line.includes("[DEBUG]"))         return "DEBUG";
      if (line.includes("[SYNTHESIS]"))     return "SYNTHESIS";
      if (line.includes("[MAINTENANCE]"))   return "MAINTENANCE";
      if (line.includes("[WORKER]"))        return "WORKER-INFO";
      if (line.includes("[WARN"))           return "WARN";
      if (line.includes("[ERROR"))          return "ERROR";
      if (line.includes("INFO"))            return "INFO";
      return "INFO";
    }

    function fmtMs(ms) {
      if (ms >= 60000) return (ms / 60000).toFixed(0) + " min";
      return (ms / 1000).toFixed(0) + " s";
    }

    function timeSince(iso) {
      if (!iso) return "—";
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60000) return Math.round(diff / 1000) + "s ago";
      if (diff < 3600000) return Math.round(diff / 60000) + " min ago";
      return Math.round(diff / 3600000) + "h ago";
    }

    function render(data) {
      const { worker, guardian, logTail } = data;

      // Header dot
      const dot = document.getElementById("header-dot");
      dot.className = "logo-dot" + (worker.online ? "" : " offline");

      // Worker badge
      const wb = document.getElementById("worker-badge");
      if (worker.online) {
        const cls = worker.state === "idle" ? "idle" : "running";
        wb.innerHTML = \`<span class="badge \${cls}"><span class="badge-dot" style="background:currentColor"></span>\${worker.state?.toUpperCase() || "ONLINE"}</span>\`;
      } else {
        wb.innerHTML = '<span class="badge offline"><span class="badge-dot" style="background:var(--red)"></span>OFFLINE</span>';
      }

      // Stage pill
      const stage = worker.online ? (worker.stage || "IDLE") : "IDLE";
      const sp = document.getElementById("stage-pill");
      sp.className = "stage-pill " + stage;
      sp.textContent = stage;

      // Company + pass
      document.getElementById("current-company").textContent = worker.currentCompany || "—";
      document.getElementById("pass-label").textContent = worker.pass ? "Pass " + worker.pass + " / 3" : "";

      // Cycle
      document.getElementById("cycle-count").textContent = worker.cycleCount ?? 0;

      // Progress bar (rough: idle=100%, other stages mapped)
      const stageProgress = { IDLE:100, SCHEDULING:5, ORBITING:15, SCRUBBING:35, WRITING:60, JUDGING:75, ASCENDING:90, MAINTENANCE:95 };
      const pct = stageProgress[stage] ?? 0;
      const pf = document.getElementById("progress-fill");
      pf.style.width = pct + "%";
      pf.className = "progress-fill " + stage;

      // Last progress
      document.getElementById("last-progress").textContent =
        "Last activity: " + timeSince(worker.lastProgressAt);

      // Stage description
      document.getElementById("stage-description").textContent =
        STAGE_DESC[stage] || "";

      // Guardian
      const gs = document.getElementById("guardian-status");
      if (guardian) {
        const alive = guardian.workerAlive;
        gs.innerHTML = \`
          <div class="setting-row"><span class="setting-key">Guardian PID</span><span class="setting-val">\${guardian.guardianPid}</span></div>
          <div class="setting-row"><span class="setting-key">Worker PID</span><span class="setting-val">\${guardian.workerPid ?? "—"}</span></div>
          <div class="setting-row"><span class="setting-key">Worker alive</span><span class="setting-val \${alive ? "guardian-ok" : "guardian-bad"}">\${alive ? "✓ YES" : "✗ NO"}</span></div>
          <div class="setting-row"><span class="setting-key">Restart count</span><span class="setting-val">\${guardian.restartCount}</span></div>
          <div class="setting-row"><span class="setting-key">Last health check</span><span class="setting-val">\${timeSince(guardian.lastHealthAt)}</span></div>
          <div class="setting-row"><span class="setting-key">Last progress</span><span class="setting-val">\${timeSince(guardian.lastProgressAt)}</span></div>
        \`;
      } else {
        gs.innerHTML = '<span style="color:var(--red)">Guardian heartbeat file not found. Is guardian.js running?</span>';
      }

      // Settings
      const settings = worker.settings || {};
      const sl = document.getElementById("settings-list");
      if (Object.keys(settings).length) {
        sl.innerHTML = [
          ["Cycle interval",        fmtMs(settings.companyCycleCooldownMs)],
          ["Ollama timeout",         fmtMs(settings.ollamaTimeoutMs)],
          ["Failsafe model",         settings.failsafeModel],
          ["Min confidence",         settings.flashcardMinConfidence + "%"],
          ["Min impact",             settings.flashcardMinImpact],
          ["Min weight",             settings.flashcardMinWeight],
          ["Min ICE score",          settings.taskMinIceScore],
          ["Research enabled",       worker.researchEnabled ? "✓ YES" : "✗ NO"],
          ["Stuck threshold",        fmtMs(settings.stuckRunningMs)],
        ].map(([k, v]) =>
          \`<div class="setting-row"><span class="setting-key">\${k}</span><span class="setting-val">\${v ?? "—"}</span></div>\`
        ).join("");
      } else {
        sl.innerHTML = '<span style="color:var(--muted);font-size:12px">Worker offline — no settings available.</span>';
      }

      // Log
      const lc = document.getElementById("log-container");
      const wasAtBottom = lc.scrollHeight - lc.scrollTop - lc.clientHeight < 40;
      lc.innerHTML = logTail.map(line => {
        const cls = classifyLog(line);
        return \`<div class="log-line \${cls}">\${line.replace(/</g, "&lt;")}</div>\`;
      }).join("");
      if (wasAtBottom) lc.scrollTop = lc.scrollHeight;

      // Timestamp
      document.getElementById("last-updated").textContent = new Date().toLocaleTimeString();
    }

    async function refresh() {
      try {
        const res = await fetch("/api/status");
        const data = await res.json();
        render(data);
      } catch (e) {
        console.error("Status fetch failed:", e);
      }
    }

    refresh();
    setInterval(refresh, 10_000);
  </script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  if (req.url === "/api/status") {
    handleApi(res);
    return;
  }

  // Serve dashboard
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
});

server.listen(STATUS_PORT, "127.0.0.1", () => {
  console.log(`[STATUS] Sovereign Status Server (Sovereign mode) running at http://127.0.0.1:${STATUS_PORT}`);
  console.log(`[STATUS] Open your browser → http://127.0.0.1:${STATUS_PORT}`);
  console.log(`[STATUS] Data source: MongoDB Atlas (decoupled)`);
});
