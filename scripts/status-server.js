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
      --sidebar-bg:#0c0c0e;
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
      height: 100vh;
      overflow: hidden;
    }

    .app-container {
      display: flex;
      height: 100vh;
      width: 100vw;
    }

    /* ── Sidebar ── */
    .sidebar {
      width: 300px;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      flex-shrink: 0;
      z-index: 50;
    }
    .sidebar.collapsed { width: 68px; }

    .sidebar-header {
      padding: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      overflow: hidden;
      white-space: nowrap;
    }
    .sidebar.collapsed .sidebar-header { padding: 24px 20px; }

    .logo-dot {
      width: 12px; height: 12px; border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 12px var(--green);
      flex-shrink: 0;
    }
    .logo-dot.offline { background: var(--red); box-shadow: 0 0 12px var(--red); animation: none; }
    .logo-dot.online { animation: pulse 2s infinite; }

    .sidebar-title {
      font-size: 16px; font-weight: 800; letter-spacing: -0.5px;
      transition: opacity 0.2s;
    }
    .sidebar.collapsed .sidebar-title,
    .sidebar.collapsed .sidebar-subtitle { opacity: 0; pointer-events: none; }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      scrollbar-width: none;
    }
    .sidebar.collapsed .sidebar-content { padding: 24px 0; display: flex; flex-direction: column; align-items: center; }

    .sidebar-section { margin-bottom: 32px; }
    .sidebar.collapsed .sidebar-section { width: 100%; display: flex; flex-direction: column; align-items: center; }

    .sidebar-label {
      font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
      text-transform: uppercase; color: var(--muted); margin-bottom: 16px;
    }
    .sidebar.collapsed .sidebar-label { display: none; }

    /* ── Main Content ── */
    .main-content {
      flex: 1;
      overflow-y: auto;
      padding: 32px;
      background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.05), transparent 400px),
                  radial-gradient(circle at bottom left, rgba(217, 70, 239, 0.03), transparent 400px);
    }

    /* ── Header Dot Animation ── */
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.5; transform: scale(0.9); }
    }

    /* ── Grid ── */
    .grid { display: grid; gap: 20px; }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); }
    .grid-3 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }

    /* ── Card ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.2);
    }
    .card-title {
      font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
      text-transform: uppercase; color: var(--muted); margin-bottom: 18px;
    }

    /* ── Status badge ── */
    .badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 12px; border-radius: 99px; font-size: 11px;
      font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;
    }
    .badge.online  { background: rgba(34,197,94,.1); color: var(--green); border: 1px solid rgba(34,197,94,.2); }
    .badge.offline { background: rgba(239,68,68,.1); color: var(--red);   border: 1px solid rgba(239,68,68,.2); }
    .badge.idle    { background: rgba(245,158,11,.1); color: var(--amber); border: 1px solid rgba(245,158,11,.2); }
    .badge.running { background: rgba(34,197,94,.1); color: var(--green); border: 1px solid rgba(34,197,94,.2); }

    /* ── Stage pill ── */
    .stage-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 16px; border-radius: 99px;
      font-size: 13px; font-weight: 800; letter-spacing: 0.5px;
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

    .stat-value { font-size: 32px; font-weight: 950; letter-spacing: -1.5px; line-height: 1; margin-bottom: 4px; }
    .stat-label { font-size: 12px; color: var(--muted); }

    /* ── Progress ── */
    .progress-bar {
      height: 4px; background: var(--border); border-radius: 99px;
      overflow: hidden; margin: 16px 0;
    }
    .progress-fill {
      height: 100%; border-radius: 99px; background: var(--green);
      transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* ── Log ── */
    .log-container {
      background: #050505; border: 1px solid var(--border);
      border-radius: 12px; padding: 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px; line-height: 1.8;
      height: 500px; overflow-y: auto;
      color: #71717a;
      mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
    }
    .log-line { white-space: pre-wrap; word-break: break-all; margin-bottom: 2px; }
    .log-line.INFO  { color: #52525b; }
    .log-line.WORKER-INFO  { color: #a1a1aa; }
    .log-line.WARN  { color: var(--amber); }
    .log-line.ERROR { color: var(--red); font-weight: 700; }
    .log-line.HEALTH { color: var(--green); opacity: 0.8; }
    .log-line.SYNTHESIS { color: var(--blue); }
    .log-line.DEBUG { color: #3f3f46; }

    /* ── Sidebar Items ── */
    .setting-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 0; border-bottom: 1px solid var(--border);
      font-size: 12px;
    }
    .setting-row:last-child { border-bottom: none; }
    .setting-key { color: var(--muted); }
    .setting-val { font-weight: 600; font-family: 'JetBrains Mono', monospace; }

    .sidebar-footer {
      padding: 24px;
      border-top: 1px solid var(--border);
      font-size: 10px;
      color: var(--muted);
      overflow: hidden;
    }

    .collapse-btn {
      position: absolute;
      right: -12px; top: 76px;
      width: 24px; height: 24px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--muted);
      z-index: 100;
      transition: all 0.2s;
    }
    .collapse-btn:hover { color: var(--text); border-color: var(--muted); }

    .btn {
      background: rgba(245,158,11,0.1);
      border: 1px solid rgba(245,158,11,0.2);
      color: var(--amber);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
      margin-top: 12px;
    }
    .btn:hover { background: var(--amber); color: var(--bg); }
    .btn:disabled { opacity: 0.3; cursor: not-allowed; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--zinc); }

    /* Responsive adjustments */
    @media (max-width: 900px) {
      .sidebar { position: absolute; height: 100%; left: 0; transform: translateX(-100%); transition: transform 0.3s; }
      .sidebar.open { transform: translateX(0); }
    }
  </style>
</head>
<body>
  <div class="app-container">
    <aside id="sidebar" class="sidebar">
      <div class="collapse-btn" onclick="toggleSidebar()">
        <svg id="collapse-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </div>
      
      <div class="sidebar-header">
        <div class="logo-dot" id="header-dot"></div>
        <div>
          <div class="sidebar-title">Trinity Control</div>
          <div class="sidebar-subtitle" style="font-size:10px; color:var(--muted)">Sovereign Mode v0.11.4</div>
        </div>
      </div>

      <div class="sidebar-content">
        <div class="sidebar-section">
          <div class="sidebar-label">Worker Status</div>
          <div id="worker-badge">
            <span class="badge offline"><span class="badge-dot" style="background:var(--red)"></span>Offline</span>
          </div>
          <div id="defib-group" style="display:none">
            <button id="defib-btn" class="btn" onclick="reanimate()">⚡ Defibrillate</button>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label">Configuration</div>
          <div id="settings-list">
            <span style="color:var(--muted);font-size:11px">Awaiting engine...</span>
          </div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-label">Telemetry</div>
          <div class="setting-row">
             <span class="setting-key">Last Sync</span>
             <span class="setting-val" id="last-updated">—</span>
          </div>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-subtitle">© 2026 Sovereign Squad</div>
        <div style="margin-top:4px">Privacy-first AI Architecture</div>
      </div>
    </aside>

    <main class="main-content">
      <!-- Top Row: Engine Intent -->
      <section class="grid grid-3" style="margin-bottom:32px">
        <div class="card">
          <div class="card-title">Active Intelligence Stage</div>
          <div id="stage-pill" class="stage-pill IDLE">IDLE</div>
        </div>
        <div class="card">
          <div class="card-title">Strategic Target</div>
          <div id="current-company" class="stat-value" style="font-size:20px; font-weight:800">—</div>
          <div id="pass-label" class="stat-label"></div>
        </div>
        <div class="card">
          <div class="card-title">Completed Cycles</div>
          <div id="cycle-count" class="stat-value">0</div>
          <div class="stat-label">since engine start</div>
        </div>
      </section>

      <!-- Middle Row: Synthesis Pulse & Hardware -->
      <section class="grid grid-2" style="margin-bottom:32px">
        <div class="card">
          <div class="card-title">Synthesis Pulse</div>
          <div id="last-progress" style="font-size:12px;color:var(--muted);margin-bottom:12px">Last activity: —</div>
          <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
          <div style="margin-top:14px;font-size:12px;color:var(--text);font-weight:500" id="stage-description">Waiting for engine heartbeat...</div>
        </div>
        <div class="card">
          <div class="card-title">Guardian Oversight</div>
          <div id="guardian-status" style="font-size:12px;color:var(--muted)">Connecting watchdog registry...</div>
        </div>
      </section>

      <!-- Bottom Row: High-Frequency Logs -->
      <section class="card">
        <div class="card-title">Nuclear Stream (Live Logs)</div>
        <div class="log-container" id="log-container"></div>
      </section>
    </main>
  </div>

  <script>
    const STAGE_DESC = {
      IDLE:        "Engine is cooling down between strategy cycles.",
      SCHEDULING:  "Analyzing global signals to prioritize next target.",
      ORBITING:    "Establish context for target company database.",
      SCRUBBING:   "Drafter mapping raw evidence to atomic insights.",
      WRITING:     "Writer synthesizing findings into ICE-scored cards.",
      JUDGING:     "Judge auditing quality floor and card provenance.",
      ASCENDING:   "Promoting findings to Next-Best-Action recommendations.",
      MAINTENANCE: "Reindexing knowledge base and pruning stale data.",
    };

    function toggleSidebar() {
      const sb = document.getElementById("sidebar");
      const icon = document.getElementById("collapse-icon");
      sb.classList.toggle("collapsed");
      const isCollapsed = sb.classList.contains("collapsed");
      localStorage.setItem("sidebarCollapsed", isCollapsed);
      
      icon.style.transform = isCollapsed ? "rotate(180deg)" : "rotate(0deg)";
    }

    // Restore state
    if (localStorage.getItem("sidebarCollapsed") === "true") {
      document.getElementById("sidebar").classList.add("collapsed");
      document.getElementById("collapse-icon").style.transform = "rotate(180deg)";
    }

    function classifyLog(line) {
      if (line.includes("HEALTH OK"))      return "HEALTH";
      if (line.includes("[DEBUG]"))         return "DEBUG";
      if (line.includes("[SYNTHESIS]"))     return "SYNTHESIS";
      if (line.includes("[MAINTENANCE]"))   return "MAINTENANCE";
      if (line.includes("[WORKER]"))        return "WORKER-INFO";
      if (line.includes("[WARN"))           return "WARN";
      if (line.includes("[ERROR"))          return "ERROR";
      return "INFO";
    }

    function fmtMs(ms) {
      if (ms >= 60000) return (ms / 60000).toFixed(0) + "m";
      return (ms / 1000).toFixed(0) + "s";
    }

    function timeSince(iso) {
      if (!iso) return "—";
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60000) return Math.round(diff / 1000) + "s ago";
      if (diff < 3600000) return Math.round(diff / 60000) + "m ago";
      return Math.round(diff / 3600000) + "h ago";
    }

    function render(data) {
      const { worker, guardian, logTail } = data;

      // Header dot
      const dot = document.getElementById("header-dot");
      dot.className = "logo-dot " + (worker.online ? "online" : "offline");

      // Worker badge
      const wb = document.getElementById("worker-badge");
      if (worker.online) {
        const cls = (worker.state === "idle" || !worker.state) ? "idle" : "running";
        wb.innerHTML = \`<span class="badge \${cls}">\${worker.state?.toUpperCase() || "ONLINE"}</span>\`;
      } else {
        wb.innerHTML = '<span class="badge offline">OFFLINE</span>';
      }

      // Stage pill
      const stage = worker.online ? (worker.stage || "IDLE") : "IDLE";
      const sp = document.getElementById("stage-pill");
      sp.className = "stage-pill " + stage;
      sp.textContent = stage;

      // Company + pass
      document.getElementById("current-company").textContent = worker.currentCompany || "—";
      document.getElementById("pass-label").textContent = worker.pass ? "Processing Pass " + worker.pass + "/3" : "";

      // Cycle
      document.getElementById("cycle-count").textContent = worker.cycleCount ?? 0;

      // Progress bar
      const stageProgress = { IDLE:100, SCHEDULING:5, ORBITING:15, SCRUBBING:40, WRITING:65, JUDGING:80, ASCENDING:95, MAINTENANCE:98 };
      const pct = stageProgress[stage] ?? 0;
      const pf = document.getElementById("progress-fill");
      pf.style.width = pct + "%";
      pf.style.background = \`var(--\${stage.toLowerCase()} || var(--green))\`;

      // Last progress
      document.getElementById("last-progress").textContent =
        "Latest Heartbeat: " + timeSince(worker.lastProgressAt);

      // Show/Hide Defib
      document.getElementById("defib-group").style.display =
        (worker.online && worker.state === "idle") ? "block" : "none";

      // Stage description
      document.getElementById("stage-description").textContent =
        STAGE_DESC[stage] || "Awaiting target assignment...";

      // Guardian
      const gs = document.getElementById("guardian-status");
      if (guardian) {
        const alive = guardian.workerAlive;
        const uptime = timeSince(new Date(guardian.startedAt).toISOString());
        gs.innerHTML = \`
          <div class="setting-row"><span class="setting-key">Guardian PID</span><span class="setting-val">\${guardian.guardianPid}</span></div>
          <div class="setting-row"><span class="setting-key">Worker Health</span><span class="setting-val \${alive ? "guardian-ok" : "guardian-bad"}" style="font-weight:800">\${alive ? "PERFECT" : "CRITICAL"}</span></div>
          <div class="setting-row"><span class="setting-key">Auto-Restarts</span><span class="setting-val">\${guardian.restartCount}</span></div>
          <div class="setting-row"><span class="setting-key">Engine Age</span><span class="setting-val">\${uptime.replace('ago', '')}</span></div>
          <div class="setting-row"><span class="setting-key">Last Check</span><span class="setting-val">\${timeSince(guardian.lastHealthAt)}</span></div>
        \`;
      } else {
        gs.innerHTML = '<span style="color:var(--red); font-weight:700">WATCHDOG DISCONNECTED</span>';
      }

      // Settings
      const settings = worker.settings || {};
      const sl = document.getElementById("settings-list");
      if (Object.keys(settings).length) {
        sl.innerHTML = [
          ["Sync Gap",        fmtMs(settings.companyCycleCooldownMs)],
          ["AI Model",         settings.failsafeModel || "local-specialized"],
          ["ICE Floor",        settings.taskMinIceScore],
          ["Confidence",       settings.flashcardMinConfidence + "%"],
          ["Research",         worker.researchEnabled ? "ENABLED" : "OFF"],
          ["Timeout",          fmtMs(settings.ollamaTimeoutMs)],
        ].map(([k, v]) =>
          \`<div class="setting-row"><span class="setting-key">\${k}</span><span class="setting-val">\${v ?? "—"}</span></div>\`
        ).join("");
      } else if (worker.online) {
          sl.innerHTML = '<span style="color:var(--muted); font-size:11px">Fetching engine parameters...</span>';
      } else {
        sl.innerHTML = '<span style="color:var(--muted);font-size:11px">Engine Offline</span>';
      }

      // Log
      const lc = document.getElementById("log-container");
      const wasAtBottom = lc.scrollHeight - lc.scrollTop - lc.clientHeight < 50;
      lc.innerHTML = logTail.map(line => {
        const cls = classifyLog(line);
        return \`<div class="log-line \${cls}">\${line.replace(/</g, "&lt;")}</div>\`;
      }).join("");
      if (wasAtBottom) lc.scrollTop = lc.scrollHeight;

      // Timestamp
      document.getElementById("last-updated").textContent = new Date().toLocaleTimeString();
    }

    async function reanimate() {
      const btn = document.getElementById("defib-btn");
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "⚡ Shocking...";
      try {
        await fetch("/api/reanimate", { method: "POST" });
        setTimeout(() => {
          btn.textContent = "⚡ Defibrillate";
          btn.disabled = false;
          refresh();
        }, 2000);
      } catch (e) {
        btn.textContent = "⚡ Defibrillate";
        btn.disabled = false;
      }
    }

    async function refresh() {
      try {
        const res = await fetch("/api/status");
        const data = await res.json();
        render(data);
      } catch (e) {
        console.error("Pulse fetch failed:", e);
      }
    }

    refresh();
    setInterval(refresh, 8000); // 8s refresh
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
  if (req.url === "/api/reanimate" && req.method === "POST") {
    handleReanimate(res);
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
