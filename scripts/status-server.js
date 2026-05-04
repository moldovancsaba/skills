/**
 * trinity COMMAND CENTER
 * v0.13.0 — "2026 Clean" Edition
 * 
 * A high-performance, standalone monitoring dashboard.
 * Implements the 2026 Unified Design Language (Mantine-spec).
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

function readHeartbeat() {
  try { return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf8")); }
  catch { return null; }
}

function readLogTail(n = 80) {
  try {
    return fs.readFileSync(LOG_FILE, "utf8")
      .split("\n").filter(Boolean).slice(-n);
  } catch { return []; }
}

async function getGlobalInventory() {
  const [s, f, fc, tc] = await Promise.all([
    prisma.source.count(),
    prisma.uploadedSourceFile.count(),
    prisma.flashcard.count(),
    prisma.nBAItem.count(),
  ]);
  return { sources: s, files: f, flashcards: fc, taskcards: tc };
}

// --- API ENDPOINTS ---

async function handleApi(req, res) {
  const [setting, heartbeat, inventory] = await Promise.all([
    prisma.globalSetting.findUnique({ where: { key: "core_synthesis_progress" } }),
    Promise.resolve(readHeartbeat()),
    getGlobalInventory()
  ]);
  
  const logTail = readLogTail(80);
  let worker = { online: false };
  if (setting) {
    const data = setting.value;
    const lastUpdate = new Date(setting.updatedAt).getTime();
    worker = { online: (Date.now() - lastUpdate) < 5 * 60 * 1000, ...data };
  }

  const payload = {
    ts: new Date().toISOString(),
    worker,
    guardian: heartbeat,
    logTail,
    inventory,
    activeTask: worker.activeTask,
    activeModel: worker.activeModel,
    lastLatency: worker.metrics?.lastLatency
  };

  res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function handleSaveSettings(req, res) {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const s = JSON.parse(body);
      await prisma.globalSetting.upsert({
        where: { key: "core_synthesis_physics" },
        update: { value: s, updatedAt: new Date() },
        create: { key: "core_synthesis_physics", value: s }
      });
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false }));
    }
  });
}

async function handleReanimate(res) {
  try {
    const signalPath = path.join(__dirname, "..", "logs", "restart.signal");
    fs.writeFileSync(signalPath, JSON.stringify({ ts: new Date().toISOString(), requestedBy: "dashboard" }));
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ success: true, message: "Restart signal sent to Guardian." }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: e.message }));
  }
}

// --- HTML VIEW (2026 CLEAN) ---

const HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <title>trinity Command — Clean</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    
    :root {
      /* 2026 Design Tokens (Mantine Core) */
      --mantine-font-family: 'Inter', sans-serif;
      --mantine-primary-color: #228be6;
      --mantine-primary-color-light: rgba(34, 139, 230, 0.1);
      
      /* Dark Theme */
      --bg: #101113;
      --surface: #1A1B1E;
      --card-bg: #25262B;
      --border: #373A40;
      --text: #ffffff;
      --text-dimmed: #909296;
      --green: #40c057;
      --amber: #fab005;
      --red: #fa5252;
      --shadow: 0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.12);
    }

    [data-theme="light"] {
      --bg: #f8f9fa;
      --surface: #ffffff;
      --card-bg: #ffffff;
      --border: #dee2e6;
      --text: #000000;
      --text-dimmed: #868e96;
      --shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; transition: background 0.2s, color 0.1s; }
    body { background: var(--bg); color: var(--text); font-family: var(--mantine-font-family); height: 100vh; overflow: hidden; }
    
    .app-layout { display: flex; height: 100vh; }

    /* Navigation */
    .navbar {
      width: 260px; background: var(--surface); border-right: 1px solid var(--border);
      display: flex; flex-direction: column; padding: 20px; flex-shrink: 0;
    }
    .navbar-header { margin-bottom: 40px; display: flex; align-items: center; justify-content: space-between; }
    .brand { font-size: 18px; font-weight: 900; letter-spacing: -1px; }
    .brand span { color: var(--mantine-primary-color); }

    .nav-item {
      display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 8px;
      color: var(--text-dimmed); font-weight: 600; cursor: pointer; margin-bottom: 4px;
    }
    .nav-item:hover { background: var(--mantine-primary-color-light); color: var(--mantine-primary-color); }
    .nav-item.active { background: var(--mantine-primary-color); color: #fff; }
    .nav-item svg { width: 20px; height: 20px; }

    /* Main Area */
    .main { flex: 1; overflow-y: auto; padding: 40px; }
    .container { max-width: 1100px; margin: 0 auto; }

    /* HUD */
    .hud-card {
      background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px;
      padding: 32px; margin-bottom: 24px; box-shadow: var(--shadow);
    }
    .label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-dimmed); margin-bottom: 8px; letter-spacing: 1px; }
    .value-hero { font-size: 48px; font-weight: 900; letter-spacing: -2px; line-height: 1; }
    .value-sub { font-size: 18px; font-weight: 700; color: var(--text); line-height: 1.4; margin-top: 12px; }

    /* Status Bar */
    .status-badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 6px;
      font-size: 12px; font-weight: 800; background: var(--mantine-primary-color-light); color: var(--mantine-primary-color);
    }
    .status-badge.online { background: rgba(64, 192, 87, 0.1); color: var(--green); }
    .status-badge.offline { background: rgba(250, 82, 82, 0.1); color: var(--red); }

    /* Grid */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 24px; box-shadow: var(--shadow); }
    .card-title { font-size: 14px; font-weight: 700; margin-bottom: 20px; }

    /* Logs */
    .log-stream {
      background: #000; border-radius: 8px; padding: 16px; height: 350px; overflow-y: auto;
      font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #adb5bd; line-height: 1.6;
    }
    [data-theme="light"] .log-stream { background: #f1f3f5; color: #495057; border: 1px solid var(--border); }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; height: 40px; padding: 0 20px;
      border-radius: 8px; border: none; background: var(--mantine-primary-color); color: #fff;
      font-weight: 700; font-size: 14px; cursor: pointer; transition: 0.2s;
    }
    .btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-outline:hover { background: var(--mantine-primary-color-light); border-color: var(--mantine-primary-color); color: var(--mantine-primary-color); }

    /* Toggle */
    .theme-toggle {
      width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .theme-toggle:hover { background: var(--mantine-primary-color-light); }
  </style>
</head>
<body>
  <div class="app-layout">
    <aside class="navbar">
      <div class="navbar-header">
        <div class="brand">trinity <span>OS</span></div>
        <div class="theme-toggle" onclick="toggleTheme()" title="Toggle Light/Dark Mode">
          <svg id="theme-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path></svg>
        </div>
      </div>

      <nav style="flex: 1">
        <div id="nav-dashboard" class="nav-item active" onclick="showPage('dashboard')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          <span>Dashboard</span>
        </div>
        <div id="nav-settings" class="nav-item" onclick="showPage('settings')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Settings</span>
        </div>
      </nav>

      <div style="padding-top: 20px; border-top: 1px solid var(--border)">
        <div class="label" style="margin-bottom: 12px">Engine Pulse</div>
        <div id="worker-status-badge" class="status-badge offline">OFFLINE</div>
        
        <div class="label" style="margin-top: 20px; margin-bottom: 12px">Guardian Watchdog</div>
        <div id="guardian-status-badge" class="status-badge offline" style="background: rgba(34, 139, 230, 0.1); color: var(--mantine-primary-color)">ACTIVE</div>

        <button class="btn-outline" style="width: 100%; margin-top: 16px; font-size: 12px; height: 34px" onclick="reanimate()">⚡ Restart Engine</button>
      </div>
    </aside>

    <main class="main">
      <div id="view-dashboard" class="container">
        <section class="hud-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start">
            <div>
              <div class="label">Strategic Target</div>
              <div id="hero-company" class="value-hero">Idle Rotation</div>
              <div id="hero-model" style="color: var(--mantine-primary-color); font-family: 'JetBrains Mono'; font-size: 13px; font-weight: 700; margin-top: 12px">OLLAMA_STANDBY</div>
            </div>
            <div style="text-align: right">
              <div class="label">Operation Stage</div>
              <div id="hero-stage" class="status-badge" style="font-size: 16px; padding: 10px 20px">IDLE</div>
            </div>
          </div>
          <div style="margin-top: 32px; border-top: 1px solid var(--border); padding-top: 24px">
            <div class="label">Active Task</div>
            <div id="hero-task" class="value-sub">Scanning for high-impact tactical cards...</div>
          </div>
        </section>

        <section class="grid">
          <div class="card">
            <div class="card-title">Inventory Overview</div>
            <div style="display: flex; gap: 32px">
              <div><div class="label">Data Ingested</div><div id="stat-data" style="font-size: 28px; font-weight: 900">0</div></div>
              <div><div class="label">Intel Cards</div><div id="stat-cards" style="font-size: 28px; font-weight: 900">0</div></div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Synthesis Pulse</div>
            <div style="height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; margin-bottom: 12px">
              <div id="pulse-fill" style="width: 0%; height: 100%; background: var(--green); transition: width 1s"></div>
            </div>
            <div id="pulse-desc" style="font-size: 12px; color: var(--text-dimmed)">Waiting for worker heartbeat...</div>
          </div>
        </section>

        <section class="card">
          <div class="card-title">Live Diagnostics Stream</div>
          <div id="log-stream" class="log-stream"></div>
        </section>
      </div>

      <div id="view-settings" class="container" style="display: none">
        <section class="card" style="max-width: 600px">
          <div class="card-title">Engine Parameters</div>
          <form id="settings-form" onsubmit="saveSettings(event)">
            <div style="margin-bottom: 24px">
              <label class="label">Sync Gap</label>
              <input type="range" name="gap" min="60000" max="3600000" step="60000" value="600000" oninput="this.nextElementSibling.innerText = Math.round(this.value/60000)+'m'" style="width: 100%; height: 6px; appearance: none; background: var(--border); border-radius: 99px">
              <div style="margin-top: 8px; color: var(--mantine-primary-color); font-weight: 700">10m</div>
            </div>
            <div style="margin-bottom: 24px">
              <label class="label">ICE Floor</label>
              <input type="range" name="ice" min="0" max="100" value="50" oninput="this.nextElementSibling.innerText = this.value" style="width: 100%; height: 6px; appearance: none; background: var(--border); border-radius: 99px">
              <div style="margin-top: 8px; color: var(--mantine-primary-color); font-weight: 700">50</div>
            </div>
            <div style="margin-bottom: 32px">
              <label class="label">Confidence</label>
              <input type="range" name="conf" min="0" max="100" value="40" oninput="this.nextElementSibling.innerText = this.value+'%'" style="width: 100%; height: 6px; appearance: none; background: var(--border); border-radius: 99px">
              <div style="margin-top: 8px; color: var(--mantine-primary-color); font-weight: 700">40%</div>
            </div>
            <button type="submit" class="btn">Apply Changes</button>
          </form>
        </section>
      </div>
    </main>
  </div>

  <script>
    function toggleTheme() {
      const b = document.body.parentElement;
      const theme = b.getAttribute("data-theme") === "dark" ? "light" : "dark";
      b.setAttribute("data-theme", theme);
      localStorage.setItem("trinity-theme", theme);
    }

    if (localStorage.getItem("trinity-theme") === "light") {
      document.body.parentElement.setAttribute("data-theme", "light");
    }

    function showPage(p) {
      document.getElementById("view-dashboard").style.display = p==='dashboard'?'block':'none';
      document.getElementById("view-settings").style.display = p==='settings'?'block':'none';
      document.getElementById("nav-dashboard").classList.toggle("active", p==='dashboard');
      document.getElementById("nav-settings").classList.toggle("active", p==='settings');
    }

    async function saveSettings(e) {
      e.preventDefault();
      const f = e.target;
      const s = { companyCycleCooldownMs: parseInt(f.gap.value), taskMinIceScore: parseInt(f.ice.value), flashcardMinConfidence: parseInt(f.conf.value) };
      const b = f.querySelector('button'); b.innerText = "Saving...";
      try { await fetch("/api/settings", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(s) }); b.innerText = "Saved!"; setTimeout(()=>b.innerText="Apply Changes", 2000); }
      catch { b.innerText="Error"; }
    }

    async function reanimate() {
      try { await fetch("/api/reanimate", { method: "POST" }); refresh(); } catch(e){}
    }

    function render(data) {
      const { worker, guardian, inventory, logTail } = data;
      const badge = document.getElementById("worker-status-badge");
      badge.className = "status-badge " + (worker.online ? "online" : "offline");
      badge.innerText = worker.online ? "RUNNING" : "OFFLINE";

      const gBadge = document.getElementById("guardian-status-badge");
      const gOnline = guardian && (Date.now() - new Date(guardian.lastHealthAt).getTime() < 60000);
      gBadge.className = "status-badge " + (gOnline ? "online" : "offline");
      gBadge.innerText = gOnline ? "MONITORING" : "UNREACHABLE";
      
      document.getElementById("hero-company").innerText = worker.currentCompany || "Idle Rotation";
      document.getElementById("hero-model").innerText = (worker.activeModel || "OLLAMA_STANDBY").toUpperCase();
      document.getElementById("hero-task").innerText = worker.activeTask || "Scanning for high-impact tactical cards...";
      
      const stage = worker.online ? (worker.stage || "IDLE") : "IDLE";
      const sp = document.getElementById("hero-stage");
      sp.innerText = stage;
      sp.className = "status-badge " + (worker.online ? "online" : "offline");

      document.getElementById("stat-data").innerText = (inventory.sources || 0) + (inventory.files || 0);
      document.getElementById("stat-cards").innerText = (inventory.flashcards || 0) + (inventory.taskcards || 0);

      const stageProgress = { IDLE:100, SCHEDULING:10, ORBITING:20, SCRUBBING:40, WRITING:65, JUDGING:85, ASCENDING:95 };
      document.getElementById("pulse-fill").style.width = (stageProgress[stage] || 0) + "%";
      document.getElementById("pulse-desc").innerText = worker.online ? "Engine performing " + stage + " operations..." : "Worker offline. Check guardian logs.";

      const ls = document.getElementById("log-stream");
      ls.innerHTML = logTail.map(function(l) { return "<div style='margin-bottom:4px'>" + l.replace(/</g,'&lt;') + "</div>"; }).join("");
      ls.scrollTop = ls.scrollHeight;
    }

    async function refresh() {
      try { const res = await fetch("/api/status"); const data = await res.json(); render(data); }
      catch(e) {}
    }
    setInterval(refresh, 5000); refresh();
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/status")) return handleApi(req, res);
  if (req.url === "/api/settings" && req.method === "POST") return handleSaveSettings(req, res);
  if (req.url === "/api/reanimate" && req.method === "POST") return handleReanimate(res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
});

server.listen(STATUS_PORT, "127.0.0.1", () => {
  console.log(`[STATUS] checklist Command Center running at http://127.0.0.1:${STATUS_PORT}`);
});
