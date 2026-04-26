const { PrismaClient } = require("@prisma/client");
const http = require("http");
const { getHumanMemoryPrompt } = require("./lib/memory");
const { getWorkerConfig } = require("./lib/shared");
const { OLLAMA_MODEL } = require("./lib/core");
const packageJson = require("../package.json");
const APP_VERSION = packageJson.version;

const prisma = new PrismaClient();
const PORT = 10005;

const DEFAULT_LOOP_INTERVAL = 600000;      // 10 minutes default
const DEFAULT_IDLE_INTERVAL = 300000;      // 5 minutes default

/**
 * SOVEREIGN TRINITY ORCHESTRATOR
 * v0.11.4-STABLE
 * 
 * Main entry point for the background AI synthesis loop.
 * Orchestrates the recurring execution of the Trinity pipeline and serves health metrics.
 */
const { runSynthesisCycle, getSynthesisProgress, collectGlobalWorkerSettings, syncSynthesisStateToDb, synthesisState } = require("./lib/synthesis");
const { scrubDatabaseElemental } = require("./lib/maintenance");

// --- CONTINUOUS HEARTBEAT ---
// Updates the "Last Activity" timestamp and syncs to DB for the Cloud Dashboard.
setInterval(async () => {
  if (synthesisState) {
    synthesisState.lastProgressAt = new Date().toISOString();
    await syncSynthesisStateToDb(prisma);
  }
}, 60000);

let lastCycleStartTime = 0;
const FAILSAFE_INTERVAL = 3600000; // 1 Hour Failsafe
const IDLE_INTERVAL = 300000;     // 5 Minute Idle Gap
const POLLING_INTERVAL = 30000;   // 30 Seconds DB Check

let isRunning = false;

/**
 * Main worker loop. Executes the synthesis cycle and handles the 'Sovereign' command-and-control polling.
 */
async function runWorkerLoop() {
  if (isRunning) return;
  isRunning = true;
  
  try {
    console.log(`[SYNTHESIS] Initiating Elemental Cycle...`);
    lastCycleStartTime = Date.now();
    
    // Elemental Database Scrub (Limited batch per cycle)
    synthesisState.stage = "MAINTENANCE";
    await syncSynthesisStateToDb(prisma);
    await scrubDatabaseElemental(prisma);
    
    const result = await runSynthesisCycle(prisma);
    await syncSynthesisStateToDb(prisma); // Post-cycle sync
    
    const cycleDuration = Date.now() - lastCycleStartTime;
    const isFastCycle = cycleDuration < FAILSAFE_INTERVAL;
    
    // Logic: If fast cycle, wait 5 mins. If slow (>1h), proceed to failsafe check immediately.
    const cooldown = isFastCycle ? IDLE_INTERVAL : 0;
    const cooldownMins = cooldown / 60000;
    
    if (cooldown > 0) {
      console.log(`[SYNTHESIS] Elemental Cycle Complete (${result.operations} ops). Resting 5-min idle...`);
    } else {
      console.log(`[SYNTHESIS] Long Cycle Detected (>1h). Re-evaluating failsafe immediately.`);
    }
    
    // --- IDLE WATCHER LOOP (The Failsafe Watchdog) ---
    // We poll for manual reanimates OR reaches the 1-hour failsafe threshold
    const wakeUpAt = lastCycleStartTime + Math.max(FAILSAFE_INTERVAL, Date.now() + cooldown);
    
    // Wait until either IDLE cooldown ends OR 1-hour Failsafe threshold is reached
    const targetWakeTime = isFastCycle ? (Date.now() + IDLE_INTERVAL) : (lastCycleStartTime + FAILSAFE_INTERVAL);

    while (Date.now() < targetWakeTime) {
      // 1. Check for Manual Reanimate Signal
      const reanimateSignal = await prisma.globalSetting.findUnique({ where: { key: "core_synthesis_reanimate_requested_at" } });
      if (reanimateSignal) {
        const signalTime = new Date(reanimateSignal.value.timestamp).getTime();
        if (signalTime > lastCycleStartTime) {
          console.log(`[DEFIBRILLATOR] Manual reanimation pulse detected. Waking up...`);
          break; 
        }
      }

      // 2. Failsafe Check (Paranoia Layer)
      if (Date.now() - lastCycleStartTime >= FAILSAFE_INTERVAL) {
        console.log(`[WATCHDOG] 1-Hour Failsafe Interval reached. Forcing loop start.`);
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }

    isRunning = false;
    runWorkerLoop();
  } catch (err) {
    console.error(`[CRITICAL] Worker Loop Failure:`, err);
    isRunning = false;
    setTimeout(runWorkerLoop, 60000); // Retry in 1 min on crash
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    // Contract v1 Health Response for mvp-factory-control
    const progress = getSynthesisProgress();
    const settings = await collectGlobalWorkerSettings(prisma);

    const health = {
      researchEnabled: process.env.CHECKLIST_RESEARCH_ENABLED === "true",
      progress: {
        state: progress.state,
        stage: progress.stage,
        pass: progress.pass,
        lastProgressAt: progress.lastProgressAt,
        currentCompany: progress.currentCompany,
        cycleCount: progress.cycleCount,
        enrichmentModeFlashcards: progress.enrichmentModeFlashcards,
        enrichmentModeTasks: progress.enrichmentModeTasks
      },
      settings
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(health));
  } else if (req.url === "/force" && req.method === "POST") {
    console.log("[BRIDGE] Force Trigger Received.");
    runSynthesisCycle(prisma); // Run out of band
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ACCEPTED" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`Sovereign Trinity Worker v${APP_VERSION} Active on Port ${PORT}`);
  runWorkerLoop();
});
