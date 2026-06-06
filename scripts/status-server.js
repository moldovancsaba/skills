/**
 * checklist Local AI Command Center
 *
 * Standalone monitoring surface for the local AI runtime, queue, and
 * supervisor processes.
 */

"use strict";

const http = require("http");
const fs   = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { execFile } = require("child_process");
const {
  applyRunnerIdentity,
  listRunnerDefinitions,
} = require("./lib/runtime/runner-registry");
const { collectMemoryStewardSnapshot } = require("./lib/runtime/memory-steward");
const {
  MANAGED_SERVICE_STATE_KEY,
  listManagedServiceDefinitions,
  validateManagedServiceManifest,
} = require("./lib/runtime/managed-services");
const { collectManagedServiceObservations, buildManagedServiceReconciliationPlan } = require("./lib/runtime/service-reconciler");
const { reduceRuntimeHealth } = require("./lib/runtime/health-model");
const { buildLogPressure, DEFAULT_LOG_MAX_BYTES } = require("./lib/runtime/resource-accounting");
const RUNNER = applyRunnerIdentity("check.local.status-server");
const prisma = new PrismaClient();

const STATUS_PORT      = 10006;
const LOG_FILE         = path.join(__dirname, "..", "logs", "guardian.log");
const HEARTBEAT_FILE   = path.join(__dirname, "..", "logs", "guardian-heartbeat.json");
const INVENTORY_HISTORY_KEY = "local_ai_inventory_history";
const INVENTORY_HISTORY_LIMIT = 168;
const RUNTIME_VERIFICATION_STATE_KEY = "local_ai_runtime_verification_last_run";
const PIPELINE_TOPOLOGY_STATE_KEY = "local_ai_pipeline_topology_state";
const PROJECTION_REFRESH_STATE_KEY = "local_ai_webapp_projection_refresh_state";
const OPPORTUNITYCARD_REPAIR_STATE_KEY = "opportunitycard_score_contract_repair_v1";
const RUNTIME_ACTION_LOG_KEY = "local_ai_runtime_action_log";
const RUNTIME_ACTION_LOG_LIMIT = 100;
const QUEUE_CIRCUIT_BREAKER_STATE_KEY = "local_ai_queue_circuit_breakers";
const WEBAPP_PROJECTION_VERSION = 1;
const QUEUE_COLUMN_RANK = Object.freeze({ NOW: 0, SOON: 1, LATER: 2, PARKED: 3 });
const STATUS_CACHE_TTL_MS = 5000;
const LOG_PRESSURE_FILES = [
  path.join(__dirname, "..", "logs", "guardian.log"),
  path.join(__dirname, "..", "logs", "guardian-launchd.log"),
  path.join(__dirname, "..", "logs", "destination-daemon-launchd.log"),
  path.join(__dirname, "..", "logs", "destination-daemon-launchd-error.log"),
];
let statusPayloadCache = null;
let statusPayloadGeneratedAt = 0;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeActionLog(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Array.isArray(value.events) ? value.events.filter((event) => event && typeof event === "object") : [];
}

async function recordRuntimeActionEvent(event) {
  const now = new Date();
  const current = await prisma.globalSetting.findUnique({ where: { key: RUNTIME_ACTION_LOG_KEY } });
  const events = [
    {
      id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
      createdAt: now.toISOString(),
      actor: "local-status-server",
      ...event,
    },
    ...normalizeActionLog(current?.value),
  ].slice(0, RUNTIME_ACTION_LOG_LIMIT);

  await prisma.globalSetting.upsert({
    where: { key: RUNTIME_ACTION_LOG_KEY },
    create: { key: RUNTIME_ACTION_LOG_KEY, value: { events } },
    update: { value: { events }, updatedAt: now },
  });
}

function normalizeQueueCircuitBreakerState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { active: [], recentEvents: [] };
  return {
    active: Array.isArray(value.active) ? value.active.filter((entry) => entry && typeof entry === "object") : [],
    recentEvents: Array.isArray(value.recentEvents) ? value.recentEvents.filter((entry) => entry && typeof entry === "object") : [],
  };
}

function getJobMetadata(job) {
  return isPlainObject(job?.metadata) ? job.metadata : {};
}

function summarizePipelineJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    companyId: job.companyId,
    jobType: job.jobType,
    entityType: job.entityType,
    entityId: job.entityId,
    status: job.status,
    queueColumn: job.queueColumn,
    controlMode: job.controlMode,
    attemptCount: job.attemptCount,
    scheduledAt: job.scheduledAt ? new Date(job.scheduledAt).toISOString() : null,
    lastTriedAt: job.lastTriedAt ? new Date(job.lastTriedAt).toISOString() : null,
    lastError: job.lastError || null,
    reason: job.reason || null,
  };
}

function parsePlaylistAnchor(value) {
  if (typeof value !== "string") return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function normalizeQueueJob(job, companyNames, entityLabels) {
  const metadata = getJobMetadata(job);
  const executionOptions = isPlainObject(metadata.executionOptions) ? metadata.executionOptions : {};
  const decomposition = isPlainObject(metadata.decomposition) ? metadata.decomposition : {};
  const playlist = isPlainObject(metadata.playlist) ? metadata.playlist : {};
  const executionProfile = typeof executionOptions.profile === "string" ? executionOptions.profile : "full";
  const decompositionState = typeof decomposition.state === "string" ? decomposition.state : null;
  const isChildSlice = String(job.entityType || "").toUpperCase() === "PIPELINE_SLICE";
  const isDecomposedParent = decompositionState === "DECOMPOSED";
  const parentJobId = typeof metadata.parentJobId === "string" ? metadata.parentJobId : null;
  const lastError = typeof job.lastError === "string" ? job.lastError : "";
  const reason = typeof job.reason === "string" ? job.reason : "";
  const lowMemoryDeferred =
    /\bLOW_MEMORY_SKIP\b/i.test(lastError)
    || /memory pressure/i.test(lastError)
    || /memory pressure/i.test(reason)
    || /deferred/i.test(reason);

  return {
    ...job,
    metadata,
    playlist,
    playlistAnchorAt: typeof playlist.anchorAt === "string" ? playlist.anchorAt : null,
    playlistAnchorTimestamp: parsePlaylistAnchor(playlist.anchorAt),
    playlistIndex: Number.isFinite(playlist.playlistIndex) ? playlist.playlistIndex : null,
    playlistLaneKey: typeof playlist.laneKey === "string" ? playlist.laneKey : null,
    companyName: companyNames.get(job.companyId) || job.companyId,
    entityLabel: job.entityId ? entityLabels.get(job.entityId) || job.entityId : null,
    executionProfile,
    decompositionState,
    isChildSlice,
    isDecomposedParent,
    parentJobId,
    lowMemoryDeferred,
  };
}

function sortQueueJobs(left, right) {
  const leftRunning = left.status === "RUNNING" ? 1 : 0;
  const rightRunning = right.status === "RUNNING" ? 1 : 0;
  if (leftRunning !== rightRunning) return rightRunning - leftRunning;

  const leftManualGuided = left.controlMode === "HUMAN_GUIDED" ? 1 : 0;
  const rightManualGuided = right.controlMode === "HUMAN_GUIDED" ? 1 : 0;
  if (leftManualGuided !== rightManualGuided) return rightManualGuided - leftManualGuided;

  const leftRank = QUEUE_COLUMN_RANK[left.queueColumn] ?? 99;
  const rightRank = QUEUE_COLUMN_RANK[right.queueColumn] ?? 99;
  if (leftRank !== rightRank) return leftRank - rightRank;

  const leftAnchor = Number.isFinite(left.playlistAnchorTimestamp) ? left.playlistAnchorTimestamp : Number.POSITIVE_INFINITY;
  const rightAnchor = Number.isFinite(right.playlistAnchorTimestamp) ? right.playlistAnchorTimestamp : Number.POSITIVE_INFINITY;
  if (leftAnchor !== rightAnchor) return leftAnchor - rightAnchor;

  if ((left.playlistIndex ?? Number.POSITIVE_INFINITY) !== (right.playlistIndex ?? Number.POSITIVE_INFINITY)) {
    return (left.playlistIndex ?? Number.POSITIVE_INFINITY) - (right.playlistIndex ?? Number.POSITIVE_INFINITY);
  }

  const leftPriority = Number(left.priorityScore || 0);
  const rightPriority = Number(right.priorityScore || 0);
  if (leftPriority !== rightPriority) return rightPriority - leftPriority;

  return new Date(left.updatedAt || 0).getTime() - new Date(right.updatedAt || 0).getTime();
}

function buildSourceLabel(source) {
  const provenance = typeof source?.provenance === "string" ? source.provenance.trim() : "";
  if (provenance) return provenance;
  const content = typeof source?.content === "string" ? source.content.replace(/\s+/g, " ").trim() : "";
  if (!content) return source?.publicId ? `Source #${source.publicId}` : "Datacard";
  return content.length > 96 ? `${content.slice(0, 96).trimEnd()}...` : content;
}

async function getGlobalQueueSnapshot() {
  const jobs = await prisma.pipelineJob.findMany({
    where: { status: { in: ["ACTIVE", "RUNNING", "FAILED", "PAUSED"] } },
    select: {
      id: true,
      companyId: true,
      jobType: true,
      controlMode: true,
      entityType: true,
      entityId: true,
      status: true,
      queueColumn: true,
      priorityScore: true,
      reason: true,
      sourceSignal: true,
      lastError: true,
      attemptCount: true,
      createdAt: true,
      updatedAt: true,
      lastTriedAt: true,
      lastCompletedAt: true,
      metadata: true,
    },
    take: 200,
  });

  const activeJobs = jobs.filter((job) => job.status === "ACTIVE" || job.status === "RUNNING");
  const failedJobs = jobs.filter((job) => job.status === "FAILED");
  const pausedJobs = jobs.filter((job) => job.status === "PAUSED");
  const companyIds = Array.from(new Set(jobs.map((job) => job.companyId).filter(Boolean)));
  const companies = companyIds.length
    ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
    : [];
  const companyNames = new Map(companies.map((company) => [company.id, company.name]));

  const entityIdsByKind = {
    flashcard: new Set(),
    task: new Set(),
    goal: new Set(),
    source: new Set(),
    file: new Set(),
  };

  for (const job of jobs) {
    const entityType = String(job.entityType || "").toUpperCase();
    const entityId = job.entityId;
    if (!entityId) continue;
    if (entityType === "FLASHCARD") entityIdsByKind.flashcard.add(entityId);
    else if (entityType === "CHECKLIST_TASK" || entityType === "TASK" || entityType === "CHECKLIST") entityIdsByKind.task.add(entityId);
    else if (entityType === "GOALCARD" || entityType === "GOAL") entityIdsByKind.goal.add(entityId);
    else if (entityType === "SOURCE" || entityType === "DATACARD") entityIdsByKind.source.add(entityId);
    else if (entityType === "FILE" || entityType === "UPLOADED_SOURCE_FILE") entityIdsByKind.file.add(entityId);
  }

  const [flashcards, tasks, goals, sources, files] = await Promise.all([
    entityIdsByKind.flashcard.size
      ? prisma.flashcard.findMany({ where: { id: { in: Array.from(entityIdsByKind.flashcard) } }, select: { id: true, title: true, publicId: true } })
      : [],
    entityIdsByKind.task.size
      ? prisma.checklistTask.findMany({ where: { id: { in: Array.from(entityIdsByKind.task) } }, select: { id: true, title: true, publicId: true, kanbanColumn: true } })
      : [],
    entityIdsByKind.goal.size
      ? prisma.goalcard.findMany({ where: { id: { in: Array.from(entityIdsByKind.goal) } }, select: { id: true, title: true, publicId: true } })
      : [],
    entityIdsByKind.source.size
      ? prisma.source.findMany({ where: { id: { in: Array.from(entityIdsByKind.source) } }, select: { id: true, publicId: true, provenance: true, content: true } })
      : [],
    entityIdsByKind.file.size
      ? prisma.uploadedSourceFile.findMany({ where: { id: { in: Array.from(entityIdsByKind.file) } }, select: { id: true, publicId: true, name: true } })
      : [],
  ]);

  const entityLabels = new Map();
  for (const card of flashcards) entityLabels.set(card.id, card.title || (card.publicId ? `Flashcard #${card.publicId}` : "Flashcard"));
  for (const task of tasks) entityLabels.set(task.id, task.title || (task.publicId ? `Task #${task.publicId}` : "Task"));
  for (const goal of goals) entityLabels.set(goal.id, goal.title || (goal.publicId ? `Goal #${goal.publicId}` : "Goal"));
  for (const source of sources) entityLabels.set(source.id, buildSourceLabel(source));
  for (const file of files) entityLabels.set(file.id, file.name || (file.publicId ? `File #${file.publicId}` : "File"));

  const normalizedActiveJobs = activeJobs
    .map((job) => normalizeQueueJob(job, companyNames, entityLabels))
    .sort(sortQueueJobs);
  const normalizedPausedJobs = pausedJobs
    .map((job) => normalizeQueueJob(job, companyNames, entityLabels))
    .sort(sortQueueJobs);
  const normalizedFailedJobs = failedJobs
    .map((job) => normalizeQueueJob(job, companyNames, entityLabels))
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());

  const currentJob = normalizedActiveJobs[0] || null;
  const nextJobs = currentJob
    ? normalizedActiveJobs.filter((job) => job.id !== currentJob.id).slice(0, 20)
    : normalizedActiveJobs.slice(0, 20);

  const hardeningJobs = [...normalizedActiveJobs, ...normalizedPausedJobs, ...normalizedFailedJobs];
  const hardeningSummary = {
    degradedJobs: hardeningJobs.filter((job) => job.executionProfile === "degraded").length,
    minimalJobs: hardeningJobs.filter((job) => job.executionProfile === "minimal").length,
    decomposedParentJobs: normalizedPausedJobs.filter((job) => job.isDecomposedParent).length,
    activeChildSlices: normalizedActiveJobs.filter((job) => job.isChildSlice).length,
    lowMemoryDeferredJobs: hardeningJobs.filter((job) => job.lowMemoryDeferred).length,
    starvedJobs: hardeningJobs.filter((job) => Number(job.attemptCount || 0) >= 3).length,
  };
  const recentDeferredJobs = [...normalizedPausedJobs, ...normalizedActiveJobs, ...normalizedFailedJobs]
    .filter((job) => job.lowMemoryDeferred || job.isDecomposedParent || job.isChildSlice)
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
    .slice(0, 8);

  const companyQueueDepth = Array.from(
    normalizedActiveJobs.reduce((acc, job) => {
      const key = `${job.companyId}::${job.companyName}`;
      const existing = acc.get(key) || { companyId: job.companyId, companyName: job.companyName, activeJobs: 0, runningJobs: 0, topPriority: 0 };
      existing.activeJobs += 1;
      if (job.status === "RUNNING") existing.runningJobs += 1;
      existing.topPriority = Math.max(existing.topPriority, Number(job.priorityScore || 0));
      acc.set(key, existing);
      return acc;
    }, new Map()).values(),
  ).sort((left, right) => {
    if (left.runningJobs !== right.runningJobs) return right.runningJobs - left.runningJobs;
    if (left.activeJobs !== right.activeJobs) return right.activeJobs - left.activeJobs;
    return right.topPriority - left.topPriority;
  });

  return {
    currentJob,
    nextJobs,
    activeJobs: normalizedActiveJobs.slice(0, 21),
    totalActiveJobs: normalizedActiveJobs.length,
    runningJobs: normalizedActiveJobs.filter((job) => job.status === "RUNNING").length,
    failedJobs: normalizedFailedJobs.length,
    pausedJobs: normalizedPausedJobs.length,
    companyQueueDepth: companyQueueDepth.slice(0, 12),
    hardening: hardeningSummary,
    pausedParents: normalizedPausedJobs.filter((job) => job.isDecomposedParent).slice(0, 8),
    recentDeferredJobs,
    recentFailedJobs: normalizedFailedJobs.slice(0, 8),
  };
}

// Data fetchers

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
  const [s, f, fc, gc, tc] = await Promise.all([
    prisma.source.count(),
    prisma.uploadedSourceFile.count(),
    prisma.flashcard.count(),
    prisma.goalcard.count(),
    prisma.checklistTask.count(),
  ]);
  return { sources: s, files: f, flashcards: fc, goalcards: gc, taskcards: tc, datacards: s + f, totalCards: fc + gc + tc };
}

function getHourBucketStart(value = new Date()) {
  const date = new Date(value);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function normalizeInventoryHistory(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.points)) return value.points;
  return [];
}

function buildInventoryHistoryPoint(inventory, now = new Date()) {
  const bucketStart = getHourBucketStart(now);
  return {
    bucketStart,
    capturedAt: now.toISOString(),
    datacards: Number(inventory.datacards ?? 0),
    flashcards: Number(inventory.flashcards ?? 0),
    goalcards: Number(inventory.goalcards ?? 0),
    taskcards: Number(inventory.taskcards ?? 0),
    totalCards: Number(inventory.totalCards ?? 0),
  };
}

function getProjectionFreshnessStatus(generatedAt) {
  if (typeof generatedAt !== "string" || !generatedAt) return "MISSING";
  const generatedMs = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedMs)) return "MISSING";
  const ageMinutes = Math.max(0, Math.round((Date.now() - generatedMs) / 60000));
  if (ageMinutes <= 10) return "FRESH";
  if (ageMinutes <= 60) return "AGING";
  return "STALE";
}

async function getProjectionCoverageSummary() {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      intelligenceSnapshot: {
        select: {
          webappProjection: true,
        },
      },
    },
  });

  const summary = {
    totalCompanies: companies.length,
    ready: 0,
    missing: 0,
    outdatedVersion: 0,
    fresh: 0,
    aging: 0,
    stale: 0,
  };

  for (const company of companies) {
    const projection = company.intelligenceSnapshot?.webappProjection;
    if (!projection || typeof projection !== "object") {
      summary.missing += 1;
      continue;
    }

    const version = Number(projection.version || 0);
    if (version < WEBAPP_PROJECTION_VERSION) {
      summary.outdatedVersion += 1;
      continue;
    }

    const freshness = getProjectionFreshnessStatus(projection.generatedAt);
    if (freshness === "MISSING") {
      summary.missing += 1;
      continue;
    }

    summary.ready += 1;
    if (freshness === "FRESH") summary.fresh += 1;
    else if (freshness === "AGING") summary.aging += 1;
    else summary.stale += 1;
  }

  return summary;
}

function inventoryPointEquals(left, right) {
  return ["datacards", "flashcards", "goalcards", "taskcards", "totalCards"].every(
    (field) => Number(left?.[field] ?? 0) === Number(right?.[field] ?? 0),
  );
}

async function captureInventoryHistory(inventory) {
  const now = new Date();
  const nextPoint = buildInventoryHistoryPoint(inventory, now);
  const existing = await prisma.globalSetting.findUnique({ where: { key: INVENTORY_HISTORY_KEY } });
  const history = normalizeInventoryHistory(existing?.value);
  const lastPoint = history[history.length - 1] || null;
  let nextHistory = history;

  if (!lastPoint) {
    nextHistory = [nextPoint];
  } else if (lastPoint.bucketStart === nextPoint.bucketStart) {
    if (!inventoryPointEquals(lastPoint, nextPoint)) {
      nextHistory = [...history.slice(0, -1), { ...lastPoint, ...nextPoint }];
    }
  } else {
    nextHistory = [...history, nextPoint];
  }

  if (nextHistory.length > INVENTORY_HISTORY_LIMIT) {
    nextHistory = nextHistory.slice(-INVENTORY_HISTORY_LIMIT);
  }

  if (nextHistory !== history) {
    await prisma.globalSetting.upsert({
      where: { key: INVENTORY_HISTORY_KEY },
      create: { key: INVENTORY_HISTORY_KEY, value: { points: nextHistory } },
      update: { value: { points: nextHistory }, updatedAt: now },
    });
  }

  return nextHistory;
}

async function buildStatusPayload() {
  const [setting, snapshotSetting, memoryGovernorSetting, verificationSetting, topologySetting, projectionSetting, opportunitycardRepairSetting, runtimeActionLogSetting, managedServiceSetting, queueCircuitBreakerSetting, heartbeat, inventory, queue, projectionCoverage] = await Promise.all([
    prisma.globalSetting.findUnique({ where: { key: "core_synthesis_progress" } }),
    prisma.globalSetting.findUnique({ where: { key: "local_ai_snapshot_worker_progress" } }),
    prisma.globalSetting.findUnique({ where: { key: "local_ai_memory_governor_state" } }),
    prisma.globalSetting.findUnique({ where: { key: RUNTIME_VERIFICATION_STATE_KEY } }),
    prisma.globalSetting.findUnique({ where: { key: PIPELINE_TOPOLOGY_STATE_KEY } }),
    prisma.globalSetting.findUnique({ where: { key: PROJECTION_REFRESH_STATE_KEY } }),
    prisma.globalSetting.findUnique({ where: { key: OPPORTUNITYCARD_REPAIR_STATE_KEY } }),
    prisma.globalSetting.findUnique({ where: { key: RUNTIME_ACTION_LOG_KEY } }),
    prisma.globalSetting.findUnique({ where: { key: MANAGED_SERVICE_STATE_KEY } }),
    prisma.globalSetting.findUnique({ where: { key: QUEUE_CIRCUIT_BREAKER_STATE_KEY } }),
    Promise.resolve(readHeartbeat()),
    getGlobalInventory(),
    getGlobalQueueSnapshot(),
    getProjectionCoverageSummary(),
  ]);
  const inventoryHistory = await captureInventoryHistory(inventory);

  const logTail = readLogTail(80);
  let worker = { online: false };
  if (setting) {
    const data = setting.value;
    const lastUpdate = new Date(setting.updatedAt).getTime();
    worker = { online: (Date.now() - lastUpdate) < 5 * 60 * 1000, ...data };
  }

  let backgroundWorker = { online: false };
  if (snapshotSetting) {
    const data = snapshotSetting.value;
    const lastUpdate = new Date(snapshotSetting.updatedAt).getTime();
    backgroundWorker = { online: (Date.now() - lastUpdate) < 10 * 60 * 1000, ...data };
  }

  const memoryGovernor = isPlainObject(memoryGovernorSetting?.value) ? memoryGovernorSetting.value : {};
  const runtimeActionLog = normalizeActionLog(runtimeActionLogSetting?.value);
  const queueCircuitBreakers = normalizeQueueCircuitBreakerState(queueCircuitBreakerSetting?.value);
  const verification = isPlainObject(verificationSetting?.value) ? verificationSetting.value : null;
  const topologyState = isPlainObject(topologySetting?.value) ? topologySetting.value : {};
  const projectionState = isPlainObject(projectionSetting?.value) ? projectionSetting.value : {};
  const projectionDirtyCompanies = Array.isArray(projectionState.dirtyCompanies) ? projectionState.dirtyCompanies : [];
  const projectionRecentRefreshes = Array.isArray(projectionState.recentRefreshes) ? projectionState.recentRefreshes : [];
  const projectionFailedRecentRefreshes = projectionRecentRefreshes.filter((entry) => entry?.status === "FAILED");
  const repairValue = isPlainObject(opportunitycardRepairSetting?.value) ? opportunitycardRepairSetting.value : {};
  const opportunitycardRepair = {
    version: Number(repairValue.version || 1),
    status: typeof repairValue.status === "string" ? repairValue.status : "PENDING",
    processed: Number(repairValue.processed || 0),
    updated: Number(repairValue.updated || 0),
    lastBatchProcessed: Number(repairValue.lastBatchProcessed || 0),
    lastBatchUpdated: Number(repairValue.lastBatchUpdated || 0),
    batchesProcessed: Number(repairValue.batchesProcessed || 0),
    startedAt: typeof repairValue.startedAt === "string" ? repairValue.startedAt : null,
    lastRunAt: typeof repairValue.lastRunAt === "string" ? repairValue.lastRunAt : null,
    completedAt: typeof repairValue.completedAt === "string" ? repairValue.completedAt : null,
    lastError: typeof repairValue.lastError === "string" ? repairValue.lastError : null,
    cursor: isPlainObject(repairValue.cursor) ? repairValue.cursor : null,
    stateUpdatedAt: opportunitycardRepairSetting?.updatedAt ? new Date(opportunitycardRepairSetting.updatedAt).toISOString() : null,
  };

  const memorySteward = await collectMemoryStewardSnapshot({ worker, queue }).catch((error) => ({
    ok: false,
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }));
  const manifest = validateManagedServiceManifest();
  const managedServiceDefinitions = listManagedServiceDefinitions();
  const managedServiceObserved = await collectManagedServiceObservations(managedServiceDefinitions).catch(() => ({}));
  const managedServicePlan = buildManagedServiceReconciliationPlan({
    definitions: managedServiceDefinitions,
    observed: managedServiceObserved,
    priorState: managedServiceSetting?.value,
  });
  const managedServices = {
    policyVersion: managedServicePlan.policyVersion,
    generatedAt: managedServicePlan.generatedAt,
    manifest,
    services: Object.values(managedServicePlan.services),
    serviceMap: managedServicePlan.services,
    recentEvents: managedServicePlan.recentEvents.slice(-20).reverse(),
  };
  const logPressure = buildLogPressure(LOG_PRESSURE_FILES, { maxBytes: Number(process.env.CHECK_LOCAL_LOG_MAX_BYTES || DEFAULT_LOG_MAX_BYTES) });
  const runtimeHealth = reduceRuntimeHealth({
    managedServices,
    queueCircuitBreakers,
    memorySteward,
    queue,
    worker,
  });

  return {
    ts: new Date().toISOString(),
    runner: RUNNER,
    processTitle: process.title,
    runners: listRunnerDefinitions(),
    worker,
    backgroundWorker,
    guardian: heartbeat,
    memoryGovernor: {
      policyVersion: memoryGovernor.policy?.version ?? heartbeat?.memoryGovernor?.policyVersion ?? null,
      lastActionAt: memoryGovernor.lastActionAt ?? heartbeat?.memoryGovernor?.lastActionAt ?? null,
      lastActionReason: memoryGovernor.lastActionReason ?? heartbeat?.memoryGovernor?.lastActionReason ?? null,
      latestEvaluation: memoryGovernor.latestEvaluation ?? heartbeat?.memoryGovernor?.latestEvaluation ?? null,
      counters: isPlainObject(memoryGovernor.counters) ? memoryGovernor.counters : {},
      recentEvents: Array.isArray(memoryGovernor.recentEvents) ? memoryGovernor.recentEvents.slice(-8).reverse() : [],
    },
    memorySteward,
    logPressure,
    managedServices,
    queueCircuitBreakers,
    runtimeHealth,
    runtimeActions: {
      recentEvents: runtimeActionLog.slice(0, 20),
    },
    verification,
    opportunitycardRepair,
    topology: {
      dirtyCompanies: Array.isArray(topologyState.dirtyCompanies) ? topologyState.dirtyCompanies : [],
      recentSyncs: Array.isArray(topologyState.recentSyncs) ? topologyState.recentSyncs.slice(-8).reverse() : [],
    },
    projections: {
      coverage: {
        ...projectionCoverage,
        retryingDirtyCompanies: projectionDirtyCompanies.length,
        failedRecentRefreshes: projectionFailedRecentRefreshes.length,
      },
      dirtyCompanies: projectionDirtyCompanies,
      recentRefreshes: projectionRecentRefreshes.slice(-8).reverse(),
      failedRecentRefreshes: projectionFailedRecentRefreshes.slice(-8).reverse(),
    },
    logTail,
    inventory,
    inventoryHistory,
    queue,
    activeTask: worker.activeTask || (!worker.online ? queue.currentJob?.jobType : null) || null,
    activeEntityType: worker.currentCompany ? queue.currentJob?.entityType || null : null,
    activeEntityLabel: worker.currentCompany ? queue.currentJob?.entityLabel || null : null,
    activeCompany: worker.currentCompany || (!worker.online ? queue.currentJob?.companyName || null : null),
    activeModel: worker.activeModel,
    lastLatency: worker.metrics?.lastLatency,
  };
}

async function getStatusPayload({ force = false } = {}) {
  const now = Date.now();
  if (!force && statusPayloadCache && now - statusPayloadGeneratedAt < STATUS_CACHE_TTL_MS) {
    return statusPayloadCache;
  }

  const payload = await buildStatusPayload();
  statusPayloadCache = payload;
  statusPayloadGeneratedAt = now;
  return payload;
}

// API endpoints

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > limitBytes) {
        reject(new Error("REQUEST_BODY_TOO_LARGE"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeRuntimeJobId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw
    .replace(/^local-job:/i, "")
    .replace(/^pipeline-job:/i, "")
    .trim();
}

function normalizeRuntimeAction(value) {
  const action = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (action === "fail" || action === "failed" || action === "stop_retry" || action === "stop_retries") return "fail";
  if (action === "park" || action === "cancel" || action === "pause") return "park";
  if (action === "retry" || action === "recover" || action === "resume") return "retry";
  if (action === "ack" || action === "acknowledge") return "acknowledge";
  return action;
}

function normalizeServiceAction(value) {
  const action = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (action === "restart" || action === "reignite") return "restart";
  if (action === "wake" || action === "force") return "wake";
  if (action === "ack" || action === "acknowledge") return "acknowledge";
  return action;
}

function postLocal(pathname, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: "POST", timeout: 3000 }, (response) => {
      response.resume();
      resolve({ statusCode: response.statusCode });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`Timed out calling ${port}${pathname}`));
    });
    req.end();
  });
}

function killProcessTitle(processTitle) {
  return new Promise((resolve, reject) => {
    execFile("pkill", ["-TERM", "-f", `^${processTitle} `], { timeout: 3000 }, (error) => {
      if (error && error.code !== 1) reject(error);
      else resolve({ ok: true });
    });
  });
}

function kickstartLaunchdService(label) {
  const domain = `gui/${process.getuid()}/${label}`;
  return new Promise((resolve, reject) => {
    execFile("launchctl", ["kickstart", "-k", domain], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || stdout || error.message));
      else resolve({ ok: true, domain });
    });
  });
}

async function findPipelineJobForRuntimeAction(jobId) {
  const normalizedId = normalizeRuntimeJobId(jobId);
  if (!normalizedId) return { job: null, searchedIds: [] };

  const searchedIds = Array.from(new Set([String(jobId || "").trim(), normalizedId].filter(Boolean)));
  for (const candidateId of searchedIds) {
    const job = await prisma.pipelineJob.findUnique({ where: { id: candidateId } });
    if (job) return { job, searchedIds };
  }
  return { job: null, searchedIds };
}

async function handleServiceAction(req, res) {
  try {
    const input = await readJsonBody(req);
    const serviceId = String(input.serviceId || "").trim();
    const action = normalizeServiceAction(input.action);
    const reason = String(input.reason || "").trim();
    const confirmed = input.confirm === true || input.confirmed === true;
    const service = listManagedServiceDefinitions().find((definition) => definition.id === serviceId);
    if (!service) return sendJson(res, 404, { ok: false, error: "SERVICE_NOT_FOUND" });
    if (!new Set(["restart", "wake", "acknowledge"]).has(action)) {
      return sendJson(res, 400, { ok: false, error: "INVALID_SERVICE_ACTION", allowedActions: ["restart", "wake", "acknowledge"] });
    }
    if (action === "restart" && (!confirmed || !reason)) {
      return sendJson(res, confirmed ? 400 : 409, {
        ok: false,
        error: confirmed ? "REASON_REQUIRED" : "CONFIRMATION_REQUIRED",
        action,
      });
    }

    let result = { acknowledged: true };
    if (action === "wake") {
      if (serviceId === "check-local-foreground") result = await postLocal("/force", 10005);
      else if (serviceId === "check-local-snapshot") result = await postLocal("/force", 10007);
      else return sendJson(res, 409, { ok: false, error: "WAKE_NOT_SUPPORTED", serviceId });
    } else if (action === "restart") {
      if (serviceId === "check-local-foreground") result = await killProcessTitle("check-local-foreground");
      else if (serviceId === "check-local-snapshot") result = await killProcessTitle("check-local-snapshot");
      else if (serviceId === "check-local-status") result = await killProcessTitle("check-local-status");
      else if (serviceId === "destination-daemon") result = await kickstartLaunchdService("com.sovereignsquad.check.local.destination-daemon");
      else return sendJson(res, 409, { ok: false, error: "RESTART_NOT_SUPPORTED_BY_STATUS_SERVER", serviceId });
    }

    await recordRuntimeActionEvent({
      action: `service:${action}`,
      serviceId,
      reason: reason || null,
      result,
    });
    statusPayloadCache = null;
    statusPayloadGeneratedAt = 0;
    return sendJson(res, 200, { ok: true, serviceId, action, result });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleJobAction(req, res) {
  try {
    const input = await readJsonBody(req);
    const action = normalizeRuntimeAction(input.action);
    const reason = String(input.reason || "").trim();
    const confirmed = input.confirm === true || input.confirmed === true;
    const allowedActions = new Set(["fail", "park", "retry", "acknowledge"]);

    if (!allowedActions.has(action)) {
      return sendJson(res, 400, { ok: false, error: "INVALID_ACTION", allowedActions: Array.from(allowedActions) });
    }

    if (!input.jobId) {
      return sendJson(res, 400, { ok: false, error: "MISSING_JOB_ID" });
    }

    if ((action === "fail" || action === "park") && !confirmed) {
      return sendJson(res, 409, { ok: false, error: "CONFIRMATION_REQUIRED", action });
    }

    if ((action === "fail" || action === "park") && !reason) {
      return sendJson(res, 400, { ok: false, error: "REASON_REQUIRED", action });
    }

    const { job, searchedIds } = await findPipelineJobForRuntimeAction(input.jobId);
    if (!job) {
      return sendJson(res, 404, { ok: false, error: "JOB_NOT_FOUND", searchedIds });
    }

    const now = new Date();
    const before = summarizePipelineJob(job);
    const metadata = getJobMetadata(job);
    const defaultReason = `Runtime action ${action} requested from local status server.`;
    let updated;

    if (action === "fail") {
      updated = await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          queueColumn: "PARKED",
          scheduledAt: { unset: true },
          lastError: `Operator marked failed: ${reason}`,
          reason: `Operator marked failed from local status server: ${reason}`,
          updatedAt: now,
        },
      });
    } else if (action === "park") {
      updated = await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: "PAUSED",
          queueColumn: "PARKED",
          scheduledAt: { unset: true },
          reason: `Operator parked from local status server: ${reason}`,
          updatedAt: now,
        },
      });
    } else if (action === "retry") {
      updated = await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: "ACTIVE",
          queueColumn: "NOW",
          controlMode: "AI_ONLY",
          scheduledAt: { unset: true },
          lastError: null,
          reason: reason || defaultReason,
          updatedAt: now,
        },
      });
    } else {
      updated = await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          metadata: {
            ...metadata,
            runtimeAction: {
              ...(isPlainObject(metadata.runtimeAction) ? metadata.runtimeAction : {}),
              acknowledged: true,
              acknowledgedAt: now.toISOString(),
              acknowledgedReason: reason || null,
              acknowledgedBy: "local-status-server",
            },
          },
          updatedAt: now,
        },
      });
    }

    const after = summarizePipelineJob(updated);
    await recordRuntimeActionEvent({
      action,
      jobId: job.id,
      requestedJobId: input.jobId,
      companyId: job.companyId,
      reason: reason || null,
      before,
      after,
    });

    statusPayloadCache = null;
    statusPayloadGeneratedAt = 0;
    return sendJson(res, 200, { ok: true, action, job: after });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message === "INVALID_JSON" ? 400 : message === "REQUEST_BODY_TOO_LARGE" ? 413 : 500;
    return sendJson(res, statusCode, { ok: false, error: message });
  }
}

async function handleCircuitBreakerAction(req, res) {
  try {
    const input = await readJsonBody(req);
    const breakerId = String(input.breakerId || "").trim();
    const action = normalizeRuntimeAction(input.action);
    const reason = String(input.reason || "").trim();
    const confirmed = input.confirm === true || input.confirmed === true;
    if (!breakerId) return sendJson(res, 400, { ok: false, error: "MISSING_BREAKER_ID" });
    if (!new Set(["retry", "acknowledge"]).has(action)) return sendJson(res, 400, { ok: false, error: "INVALID_BREAKER_ACTION" });
    if (action === "retry" && (!confirmed || !reason)) {
      return sendJson(res, confirmed ? 400 : 409, { ok: false, error: confirmed ? "REASON_REQUIRED" : "CONFIRMATION_REQUIRED" });
    }
    const current = await prisma.globalSetting.findUnique({ where: { key: QUEUE_CIRCUIT_BREAKER_STATE_KEY } });
    const state = normalizeQueueCircuitBreakerState(current?.value);
    const now = new Date().toISOString();
    const active = action === "retry"
      ? state.active.filter((breaker) => breaker.id !== breakerId)
      : state.active.map((breaker) => breaker.id === breakerId ? { ...breaker, acknowledgedAt: now, acknowledgedReason: reason || null } : breaker);
    const event = { ts: now, breakerId, action, reason: reason || null, actor: "local-status-server" };
    const nextValue = { active, recentEvents: [...state.recentEvents, event].slice(-50) };
    await prisma.globalSetting.upsert({
      where: { key: QUEUE_CIRCUIT_BREAKER_STATE_KEY },
      create: { key: QUEUE_CIRCUIT_BREAKER_STATE_KEY, value: nextValue },
      update: { value: nextValue, updatedAt: new Date() },
    });
    await recordRuntimeActionEvent({ action: `breaker:${action}`, breakerId, reason: reason || null });
    statusPayloadCache = null;
    statusPayloadGeneratedAt = 0;
    return sendJson(res, 200, { ok: true, breakerId, action });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

async function handleApi(req, res) {
  const payload = await getStatusPayload();

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

// Html view (2026 clean)

const HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <title>checklist Local AI Command Center</title>
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
    .status-badge.warning { background: rgba(250, 176, 5, 0.12); color: var(--amber); }

    /* Grid */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 24px; box-shadow: var(--shadow); }
    .card-title { font-size: 14px; font-weight: 700; margin-bottom: 20px; }
    .runtime-list { display: flex; flex-direction: column; gap: 10px; }
    .runtime-row {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center;
      border: 1px solid var(--border); border-radius: 8px; padding: 14px;
    }
    .runtime-row-main { min-width: 0; }
    .runtime-row-title { font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .runtime-row-meta { margin-top: 6px; color: var(--text-dimmed); font-size: 11px; line-height: 1.4; }
    .runtime-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .btn-small { height: 30px; padding: 0 10px; border-radius: 6px; font-size: 11px; }
    .btn-danger { background: rgba(250, 82, 82, 0.12); color: var(--red); border: 1px solid rgba(250, 82, 82, 0.35); }
    .btn-warning { background: rgba(250, 176, 5, 0.12); color: var(--amber); border: 1px solid rgba(250, 176, 5, 0.35); }
    .btn-success { background: rgba(64, 192, 87, 0.12); color: var(--green); border: 1px solid rgba(64, 192, 87, 0.35); }
    .metric-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
    .metric { border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
    .metric-value { font-size: 24px; font-weight: 900; line-height: 1; }
    @media (max-width: 860px) {
      .grid, .metric-strip { grid-template-columns: 1fr; }
      .runtime-row { grid-template-columns: 1fr; }
      .runtime-actions { justify-content: flex-start; }
    }

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
        <div class="brand">checklist <span>local ai</span></div>
        <div class="theme-toggle" onclick="toggleTheme()" title="Toggle Light/Dark Mode">
          <svg id="theme-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-11.314l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path></svg>
        </div>
      </div>

      <nav style="flex: 1">
        <div id="nav-dashboard" class="nav-item active" onclick="showPage('dashboard')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
          <span>Dashboard</span>
        </div>
        <div id="nav-runtime" class="nav-item" onclick="showPage('runtime')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
          <span>Runtime</span>
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

      <div id="view-runtime" class="container" style="display: none">
        <section class="metric-strip">
          <div class="metric"><div class="label">Runtime State</div><div id="runtime-health-state" class="metric-value">--</div></div>
          <div class="metric"><div class="label">Free Memory</div><div id="runtime-free-memory" class="metric-value">--</div></div>
          <div class="metric"><div class="label">Active Jobs</div><div id="runtime-active-jobs" class="metric-value">--</div></div>
          <div class="metric"><div class="label">Running Jobs</div><div id="runtime-running-jobs" class="metric-value">--</div></div>
        </section>

        <section class="card" style="margin-bottom: 24px">
          <div class="card-title">Runtime Incidents</div>
          <div id="runtime-health-incidents" class="runtime-list"></div>
        </section>

        <section class="grid">
          <div class="card">
            <div class="card-title">Managed Services</div>
            <div id="runtime-service-list" class="runtime-list"></div>
          </div>
          <div class="card">
            <div class="card-title">Circuit Breakers</div>
            <div id="runtime-breaker-list" class="runtime-list"></div>
          </div>
        </section>

        <section class="grid">
          <div class="card">
            <div class="card-title">Memory Steward</div>
            <div id="runtime-memory-actions" class="runtime-list"></div>
          </div>
          <div class="card">
            <div class="card-title">Log Pressure</div>
            <div id="runtime-log-pressure" class="runtime-list"></div>
          </div>
        </section>

        <section class="card">
          <div class="card-title">Queue Actions</div>
          <div id="runtime-job-list" class="runtime-list"></div>
        </section>

        <section class="card" style="margin-top: 24px">
          <div class="card-title">Action Log</div>
          <div id="runtime-action-log" class="runtime-list"></div>
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
      localStorage.setItem("checklist-local-ai-theme", theme);
    }

    if (localStorage.getItem("checklist-local-ai-theme") === "light") {
      document.body.parentElement.setAttribute("data-theme", "light");
    }

    function showPage(p) {
      document.getElementById("view-dashboard").style.display = p==='dashboard'?'block':'none';
      document.getElementById("view-runtime").style.display = p==='runtime'?'block':'none';
      document.getElementById("view-settings").style.display = p==='settings'?'block':'none';
      document.getElementById("nav-dashboard").classList.toggle("active", p==='dashboard');
      document.getElementById("nav-runtime").classList.toggle("active", p==='runtime');
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

    function escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
        return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch];
      });
    }

    function formatJobTitle(job) {
      return [job.jobType, job.companyName].filter(Boolean).join(" · ") || job.id;
    }

    function renderRuntime(data) {
      const memory = data.memorySteward || {};
      const plan = memory.plan || {};
      const queue = data.queue || {};
      const jobs = [queue.currentJob].concat(queue.nextJobs || []).filter(Boolean).slice(0, 12);
      const actionEvents = (data.runtimeActions && data.runtimeActions.recentEvents) || [];
      const runtimeHealth = data.runtimeHealth || {};
      const services = (data.managedServices && data.managedServices.services) || [];
      const breakers = (data.queueCircuitBreakers && data.queueCircuitBreakers.active) || [];
      const logFiles = Array.isArray(data.logPressure) ? data.logPressure : ((data.logPressure && data.logPressure.files) || []);

      document.getElementById("runtime-health-state").innerText = runtimeHealth.state || memory.resourceBand || "--";
      document.getElementById("runtime-free-memory").innerText = Number.isFinite(memory.freeMemMb) ? memory.freeMemMb + " MB" : "--";
      document.getElementById("runtime-active-jobs").innerText = queue.totalActiveJobs == null ? "--" : queue.totalActiveJobs;
      document.getElementById("runtime-running-jobs").innerText = queue.runningJobs == null ? "--" : queue.runningJobs;

      document.getElementById("runtime-health-incidents").innerHTML = (runtimeHealth.incidents || []).slice(0, 8).map(function(incident) {
        const badgeClass = incident.severity === "critical" ? "offline" : "warning";
        return "<div class='runtime-row'><div class='runtime-row-main'>"
          + "<div class='runtime-row-title'>" + escapeHtml(incident.code || incident.id) + "</div>"
          + "<div class='runtime-row-meta'>" + escapeHtml(incident.summary || "") + "</div>"
          + "<div class='runtime-row-meta'>Next action: " + escapeHtml(incident.nextAction || "") + "</div></div>"
          + "<div class='status-badge " + badgeClass + "'>" + escapeHtml(incident.severity || "warning").toUpperCase() + "</div></div>";
      }).join("") || "<div class='runtime-row'><div class='runtime-row-main'><div class='runtime-row-title'>No active incidents</div></div><div class='status-badge online'>HEALTHY</div></div>";

      document.getElementById("runtime-service-list").innerHTML = services.map(function(service) {
        const healthy = service.state === "healthy";
        const recovering = service.state === "recovering";
        const badgeClass = healthy ? "online" : recovering ? "warning" : "offline";
        const restartDisabled = service.serviceId === "ollama" || service.serviceId === "check-local-guardian";
        const wakeDisabled = !(service.serviceId === "check-local-foreground" || service.serviceId === "check-local-snapshot");
        return "<div class='runtime-row'><div class='runtime-row-main'>"
          + "<div class='runtime-row-title'>" + escapeHtml(service.displayName || service.serviceId) + "</div>"
          + "<div class='runtime-row-meta'>" + escapeHtml(service.serviceId) + " · pid " + escapeHtml(service.pid || "--") + " · " + escapeHtml(service.lastError || "no errors") + "</div>"
          + "</div><div class='runtime-actions'>"
          + "<span class='status-badge " + badgeClass + "'>" + escapeHtml(service.state || "unknown").toUpperCase() + "</span>"
          + "<button class='btn-outline btn-small' data-service-action='wake' data-service-id='" + escapeHtml(service.serviceId) + "'" + (wakeDisabled ? " disabled" : "") + ">Wake</button>"
          + "<button class='btn-outline btn-small btn-warning' data-service-action='restart' data-service-id='" + escapeHtml(service.serviceId) + "'" + (restartDisabled ? " disabled" : "") + ">Restart</button>"
          + "<button class='btn-outline btn-small' data-service-action='acknowledge' data-service-id='" + escapeHtml(service.serviceId) + "'>Ack</button>"
          + "</div></div>";
      }).join("") || "<div class='runtime-row'><div class='runtime-row-main'><div class='runtime-row-title'>No managed services reported</div></div></div>";

      document.getElementById("runtime-breaker-list").innerHTML = breakers.map(function(breaker) {
        return "<div class='runtime-row'><div class='runtime-row-main'>"
          + "<div class='runtime-row-title'>" + escapeHtml(breaker.id) + "</div>"
          + "<div class='runtime-row-meta'>" + escapeHtml(breaker.reason || "") + "</div>"
          + "<div class='runtime-row-meta'>Retry at " + escapeHtml(breaker.nextRetryAt || "--") + " · affected " + escapeHtml(breaker.affectedCount || 0) + "</div>"
          + "</div><div class='runtime-actions'>"
          + "<span class='status-badge warning'>" + escapeHtml(breaker.state || "open").toUpperCase() + "</span>"
          + "<button class='btn-outline btn-small btn-success' data-breaker-action='retry' data-breaker-id='" + escapeHtml(breaker.id) + "'>Retry</button>"
          + "<button class='btn-outline btn-small' data-breaker-action='acknowledge' data-breaker-id='" + escapeHtml(breaker.id) + "'>Ack</button>"
          + "</div></div>";
      }).join("") || "<div class='runtime-row'><div class='runtime-row-main'><div class='runtime-row-title'>No active circuit breakers</div></div><div class='status-badge online'>CLOSED</div></div>";

      document.getElementById("runtime-log-pressure").innerHTML = logFiles.map(function(file) {
        const badgeClass = file.needsRotation ? "warning" : "online";
        return "<div class='runtime-row'><div class='runtime-row-main'>"
          + "<div class='runtime-row-title'>" + escapeHtml(file.name || file.path) + "</div>"
          + "<div class='runtime-row-meta'>" + escapeHtml(file.sizeMb) + " MB · " + escapeHtml(file.path || "") + "</div></div>"
          + "<div class='status-badge " + badgeClass + "'>" + (file.needsRotation ? "ROTATE" : "OK") + "</div></div>";
      }).join("") || "<div class='runtime-row'><div class='runtime-row-main'><div class='runtime-row-title'>No log pressure data</div></div></div>";

      document.getElementById("runtime-memory-actions").innerHTML = (plan.actions || []).map(function(action) {
        const badgeClass = action.allowed ? "online" : "offline";
        return "<div class='runtime-row'><div class='runtime-row-main'>"
          + "<div class='runtime-row-title'>" + escapeHtml(action.type) + "</div>"
          + "<div class='runtime-row-meta'>" + escapeHtml(action.reason || "") + "</div></div>"
          + "<div class='status-badge " + badgeClass + "'>" + (action.allowed ? "ALLOWED" : "BLOCKED") + "</div></div>";
      }).join("") || "<div class='runtime-row'><div class='runtime-row-main'><div class='runtime-row-title'>No policy actions</div></div></div>";

      document.getElementById("runtime-action-log").innerHTML = actionEvents.slice(0, 6).map(function(event) {
        return "<div class='runtime-row'><div class='runtime-row-main'>"
          + "<div class='runtime-row-title'>" + escapeHtml(event.action || "action") + " · " + escapeHtml(event.jobId || "") + "</div>"
          + "<div class='runtime-row-meta'>" + escapeHtml(event.createdAt || "") + " · " + escapeHtml(event.reason || "") + "</div></div></div>";
      }).join("") || "<div class='runtime-row'><div class='runtime-row-main'><div class='runtime-row-title'>No runtime actions recorded</div></div></div>";

      document.getElementById("runtime-job-list").innerHTML = jobs.map(function(job) {
        const disabledRetry = job.status === "ACTIVE" && job.queueColumn === "NOW" ? " disabled" : "";
        return "<div class='runtime-row'><div class='runtime-row-main'>"
          + "<div class='runtime-row-title'>" + escapeHtml(formatJobTitle(job)) + "</div>"
          + "<div class='runtime-row-meta'>" + escapeHtml(job.id) + " · " + escapeHtml(job.status) + " · " + escapeHtml(job.queueColumn) + " · attempts " + escapeHtml(job.attemptCount || 0) + "</div>"
          + (job.lastError ? "<div class='runtime-row-meta'>" + escapeHtml(job.lastError).slice(0, 180) + "</div>" : "")
          + "</div><div class='runtime-actions'>"
          + "<button class='btn-outline btn-small btn-success' data-job-action='retry' data-job-id='" + escapeHtml(job.id) + "'" + disabledRetry + ">Retry</button>"
          + "<button class='btn-outline btn-small btn-warning' data-job-action='park' data-job-id='" + escapeHtml(job.id) + "'>Park</button>"
          + "<button class='btn-outline btn-small btn-danger' data-job-action='fail' data-job-id='" + escapeHtml(job.id) + "'>Fail</button>"
          + "<button class='btn-outline btn-small' data-job-action='acknowledge' data-job-id='" + escapeHtml(job.id) + "'>Ack</button>"
          + "</div></div>";
      }).join("") || "<div class='runtime-row'><div class='runtime-row-main'><div class='runtime-row-title'>No visible queue jobs</div></div></div>";
    }

    async function runJobAction(jobId, action) {
      const destructive = action === "fail" || action === "park";
      const reason = destructive
        ? prompt("Reason for " + action + " on " + jobId + ":")
        : prompt("Reason for " + action + " on " + jobId + ":", "");
      if (reason === null) return;
      if (destructive && !reason.trim()) {
        alert("Reason required.");
        return;
      }
      const response = await fetch("/api/jobs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: jobId, action: action, reason: reason, confirm: destructive }),
      });
      const payload = await response.json().catch(function() { return {}; });
      if (!response.ok) {
        alert(payload.error || "Action failed");
        return;
      }
      refresh();
    }

    async function runServiceAction(serviceId, action) {
      const destructive = action === "restart";
      const reason = destructive
        ? prompt("Reason for restarting " + serviceId + ":")
        : prompt("Reason for " + action + " on " + serviceId + ":", "");
      if (reason === null) return;
      if (destructive && !reason.trim()) {
        alert("Reason required.");
        return;
      }
      const response = await fetch("/api/services/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: serviceId, action: action, reason: reason, confirm: destructive }),
      });
      const payload = await response.json().catch(function() { return {}; });
      if (!response.ok) {
        alert(payload.error || "Service action failed");
        return;
      }
      refresh();
    }

    async function runBreakerAction(breakerId, action) {
      const destructive = action === "retry";
      const reason = destructive
        ? prompt("Reason for retrying " + breakerId + ":")
        : prompt("Reason for " + action + " on " + breakerId + ":", "");
      if (reason === null) return;
      if (destructive && !reason.trim()) {
        alert("Reason required.");
        return;
      }
      const response = await fetch("/api/circuit-breakers/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ breakerId: breakerId, action: action, reason: reason, confirm: destructive }),
      });
      const payload = await response.json().catch(function() { return {}; });
      if (!response.ok) {
        alert(payload.error || "Circuit breaker action failed");
        return;
      }
      refresh();
    }

    document.addEventListener("click", function(event) {
      const jobButton = event.target.closest("[data-job-action][data-job-id]");
      if (jobButton && !jobButton.disabled) {
        runJobAction(jobButton.getAttribute("data-job-id"), jobButton.getAttribute("data-job-action"));
        return;
      }
      const serviceButton = event.target.closest("[data-service-action][data-service-id]");
      if (serviceButton && !serviceButton.disabled) {
        runServiceAction(serviceButton.getAttribute("data-service-id"), serviceButton.getAttribute("data-service-action"));
        return;
      }
      const breakerButton = event.target.closest("[data-breaker-action][data-breaker-id]");
      if (breakerButton && !breakerButton.disabled) {
        runBreakerAction(breakerButton.getAttribute("data-breaker-id"), breakerButton.getAttribute("data-breaker-action"));
      }
    });

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
      renderRuntime(data);
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
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      ok: true,
      runner: RUNNER,
      processTitle: process.title,
      ts: new Date().toISOString(),
      cachedAt: statusPayloadGeneratedAt ? new Date(statusPayloadGeneratedAt).toISOString() : null,
      cacheAgeMs: statusPayloadGeneratedAt ? Date.now() - statusPayloadGeneratedAt : null,
    }));
    return;
  }
  if (req.url.startsWith("/api/status")) return handleApi(req, res);
  if (req.url === "/api/jobs/action" && req.method === "POST") return handleJobAction(req, res);
  if (req.url === "/api/services/action" && req.method === "POST") return handleServiceAction(req, res);
  if (req.url === "/api/circuit-breakers/action" && req.method === "POST") return handleCircuitBreakerAction(req, res);
  if (req.url === "/api/settings" && req.method === "POST") return handleSaveSettings(req, res);
  if (req.url === "/api/reanimate" && req.method === "POST") return handleReanimate(res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(HTML);
});

server.listen(STATUS_PORT, "127.0.0.1", () => {
  console.log(`[STATUS] ${RUNNER.humanName} running at http://127.0.0.1:${STATUS_PORT} (${RUNNER.id})`);
});
