const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const {
  PLANNER_LANE_ORDER,
  PLANNER_LANE_TARGETS,
  PLANNER_MIN_FLASHCARDS,
} = require("../../../src/lib/planner-contract");

const PLANNER_TELEMETRY_KEY = "planner_telemetry_events";
const PLANNER_TELEMETRY_MAX_EVENTS = 200;
const TELEMETRY_LOG_PATH = path.join(__dirname, "..", "..", "logs", "telemetry.ndjson");

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "..", "package.json"), "utf8"),
    );
    return String(packageJson.version || "unknown");
  } catch {
    return "unknown";
  }
}

function readGitValue(command) {
  try {
    return execSync(command, {
      cwd: path.join(__dirname, "..", "..", ".."),
      stdio: ["ignore", "pipe", "ignore"],
    }).toString("utf8").trim();
  } catch {
    return null;
  }
}

function getWorkerBuildIdentity() {
  return {
    appVersion: readPackageVersion(),
    gitSha: readGitValue("git rev-parse HEAD"),
    gitBranch: readGitValue("git rev-parse --abbrev-ref HEAD"),
    checkoutPath: path.join(__dirname, "..", "..", ".."),
    generatedAt: new Date().toISOString(),
  };
}

function serializePlannerEvent(event = {}) {
  return {
    id: String(event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    eventType: String(event.eventType || "UNKNOWN"),
    companyId: event.companyId ? String(event.companyId) : null,
    entityType: event.entityType ? String(event.entityType) : null,
    entityId: event.entityId ? String(event.entityId) : null,
    reason: event.reason ? String(event.reason) : null,
    details: event.details && typeof event.details === "object" ? event.details : {},
    createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
  };
}

function appendPlannerTelemetryLog(event) {
  try {
    fs.mkdirSync(path.dirname(TELEMETRY_LOG_PATH), { recursive: true });
    fs.appendFileSync(TELEMETRY_LOG_PATH, `${JSON.stringify(event)}\n`);
  } catch {
    // File logging is best-effort only.
  }
}

async function recordPlannerTelemetry(prisma, event) {
  const serialized = serializePlannerEvent(event);
  appendPlannerTelemetryLog(serialized);

  const existing = await prisma.globalSetting.findUnique({ where: { key: PLANNER_TELEMETRY_KEY } });
  const currentEvents = Array.isArray(existing?.value) ? existing.value : [];
  const nextEvents = [...currentEvents, serialized].slice(-PLANNER_TELEMETRY_MAX_EVENTS);

  await prisma.globalSetting.upsert({
    where: { key: PLANNER_TELEMETRY_KEY },
    create: { key: PLANNER_TELEMETRY_KEY, value: nextEvents },
    update: { value: nextEvents },
  });

  return serialized;
}

async function listPlannerTelemetry(prisma, { companyId = null, limit = 20, eventTypes = null } = {}) {
  const existing = await prisma.globalSetting.findUnique({ where: { key: PLANNER_TELEMETRY_KEY } });
  const events = Array.isArray(existing?.value) ? existing.value.map(serializePlannerEvent) : [];
  return events
    .filter((event) => (!companyId || event.companyId === companyId))
    .filter((event) => (!eventTypes || eventTypes.includes(event.eventType)))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, limit);
}

function buildPlannerStateSnapshot(signals = {}) {
  const laneCounts = signals.laneCounts || {};
  const unmetLaneTargets = PLANNER_LANE_ORDER
    .map((lane) => ({
      lane,
      current: Number(laneCounts[lane] || 0),
      target: Number(PLANNER_LANE_TARGETS[lane] || 0),
    }))
    .filter((item) => item.current < item.target);

  return {
    operatingMode: signals.mode || "UNKNOWN",
    datacardCount: Number(signals.datacardCount || 0),
    flashcardCount: Number(signals.flashcardCount || 0),
    unmetFlashcardTarget: Math.max(0, PLANNER_MIN_FLASHCARDS - Number(signals.flashcardCount || 0)),
    unmetLaneTargets,
    activeManualCooldownCount: Number(signals.activeManualCooldownCount || 0),
  };
}

function buildPlannerEventSummary(events = []) {
  const timeoutEvents = events.filter((event) => event.eventType === "TIMEOUT");
  const qualityCeilingEvents = events.filter((event) => event.eventType === "QUALITY_CEILING_APPLIED");
  const manualCooldownEvents = events.filter((event) => event.eventType === "MANUAL_COOLDOWN_BLOCK");

  return {
    timeoutEvents,
    qualityCeilingEvents,
    manualCooldownEvents,
    timeoutCount: timeoutEvents.length,
    qualityCeilingCount: qualityCeilingEvents.length,
    manualCooldownBlockCount: manualCooldownEvents.length,
  };
}

module.exports = {
  PLANNER_TELEMETRY_KEY,
  getWorkerBuildIdentity,
  recordPlannerTelemetry,
  listPlannerTelemetry,
  buildPlannerStateSnapshot,
  buildPlannerEventSummary,
};
