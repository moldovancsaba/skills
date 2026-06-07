"use strict";

const crypto = require("crypto");

const COMPANY_SURFACE_PROJECTION_STATE_KEY = "company_surface_projection_refresh_state";
const SURFACE_PROJECTION_RECENT_REFRESH_LIMIT = 50;
const SURFACE_PROJECTION_MAX_PAYLOAD_BYTES = 1024 * 1024;
const SURFACE_PROJECTION_CONTRACT_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checksumSurfacePayload(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function getSurfaceProjectionFreshness(generatedAt, now = new Date()) {
  if (!generatedAt) return { status: "MISSING", generatedAt: null, ageMinutes: null };
  const generatedDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const generatedMs = generatedDate.getTime();
  if (!Number.isFinite(generatedMs)) return { status: "MISSING", generatedAt: null, ageMinutes: null };
  const ageMinutes = Math.max(0, Math.round((now.getTime() - generatedMs) / 60000));
  return {
    status: ageMinutes <= 60 ? "FRESH" : ageMinutes <= 120 ? "AGING" : "STALE",
    generatedAt: generatedDate.toISOString(),
    ageMinutes,
  };
}

function normalizeSurfaceProjectionRefreshState(value) {
  const record = isPlainObject(value) ? value : {};
  const dirtySurfaces = Array.isArray(record.dirtySurfaces)
    ? record.dirtySurfaces.filter((entry) => isPlainObject(entry) && typeof entry.companyId === "string" && typeof entry.surfaceKey === "string")
    : [];
  const recentRefreshes = Array.isArray(record.recentRefreshes)
    ? record.recentRefreshes.filter((entry) => isPlainObject(entry) && typeof entry.companyId === "string" && typeof entry.surfaceKey === "string")
    : [];
  return {
    dirtySurfaces,
    recentRefreshes: recentRefreshes.slice(-SURFACE_PROJECTION_RECENT_REFRESH_LIMIT),
  };
}

function enqueueDirtySurfaceProjection(state, companyId, surfaceKey, reason = "surface-projection-refresh", now = new Date()) {
  const normalized = normalizeSurfaceProjectionRefreshState(state);
  const requestedAt = now.toISOString();
  const nextDirty = normalized.dirtySurfaces.filter((entry) => !(entry.companyId === companyId && entry.surfaceKey === surfaceKey));
  nextDirty.push({ companyId, surfaceKey, reason, requestedAt, attemptCount: 0, lastError: null, nextRetryAt: null });
  return {
    dirtySurfaces: nextDirty.sort((left, right) => new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime()),
    recentRefreshes: normalized.recentRefreshes,
  };
}

function drainDirtySurfaceProjections(state, limit = 3) {
  const normalized = normalizeSurfaceProjectionRefreshState(state);
  const now = Date.now();
  const ready = normalized.dirtySurfaces.filter((entry) => !entry.nextRetryAt || new Date(entry.nextRetryAt).getTime() <= now);
  const delayed = normalized.dirtySurfaces.filter((entry) => entry.nextRetryAt && new Date(entry.nextRetryAt).getTime() > now);
  const boundedLimit = Math.max(1, Math.min(20, Number(limit || 3)));
  return {
    drained: ready.slice(0, boundedLimit),
    remaining: [...ready.slice(boundedLimit), ...delayed],
    recentRefreshes: normalized.recentRefreshes,
  };
}

function recordSurfaceProjectionRefreshResult(state, result, now = new Date()) {
  const normalized = normalizeSurfaceProjectionRefreshState(state);
  const event = {
    companyId: result.companyId,
    surfaceKey: result.surfaceKey,
    reason: result.reason || "surface-projection-refresh",
    status: result.status || "REFRESHED",
    trigger: result.trigger || "surface-projection-refresh",
    refreshedAt: result.refreshedAt || now.toISOString(),
    durationMs: result.durationMs ?? null,
    error: result.error || null,
  };
  return {
    dirtySurfaces: normalized.dirtySurfaces,
    recentRefreshes: [...normalized.recentRefreshes, event].slice(-SURFACE_PROJECTION_RECENT_REFRESH_LIMIT),
  };
}

function retryDirtySurfaceProjection(state, entry, error, now = new Date()) {
  const normalized = normalizeSurfaceProjectionRefreshState(state);
  const attemptCount = Number(entry.attemptCount || 0) + 1;
  const delayMs = Math.min(15 * 60 * 1000, 30 * 1000 * Math.max(1, attemptCount));
  const nextRetryAt = new Date(now.getTime() + delayMs).toISOString();
  return {
    dirtySurfaces: [
      ...normalized.dirtySurfaces.filter((item) => !(item.companyId === entry.companyId && item.surfaceKey === entry.surfaceKey)),
      {
        ...entry,
        attemptCount,
        lastError: error?.message || String(error),
        nextRetryAt,
      },
    ].sort((left, right) => new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime()),
    recentRefreshes: normalized.recentRefreshes,
  };
}

async function readSurfaceProjectionRefreshState(prisma) {
  const setting = await prisma.globalSetting.findUnique({
    where: { key: COMPANY_SURFACE_PROJECTION_STATE_KEY },
    select: { value: true },
  });
  return normalizeSurfaceProjectionRefreshState(setting?.value);
}

async function writeSurfaceProjectionRefreshState(prisma, state) {
  const normalized = normalizeSurfaceProjectionRefreshState(state);
  await prisma.globalSetting.upsert({
    where: { key: COMPANY_SURFACE_PROJECTION_STATE_KEY },
    create: { key: COMPANY_SURFACE_PROJECTION_STATE_KEY, value: normalized },
    update: { value: normalized, updatedAt: new Date() },
  });
  return normalized;
}

async function markCompanySurfaceProjectionDirty(prisma, companyId, surfaceKey, reason = "surface-projection-refresh") {
  if (!companyId || !surfaceKey) return null;
  const state = await readSurfaceProjectionRefreshState(prisma);
  return writeSurfaceProjectionRefreshState(prisma, enqueueDirtySurfaceProjection(state, companyId, surfaceKey, reason));
}

function assertProjectionPayloadSize(payload) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > SURFACE_PROJECTION_MAX_PAYLOAD_BYTES) {
    throw new Error(`SURFACE_PROJECTION_PAYLOAD_TOO_LARGE:${bytes}`);
  }
  return bytes;
}

async function upsertCompanySurfaceProjection(prisma, input) {
  const generatedAt = new Date();
  const checksum = checksumSurfacePayload(input.payload);
  const payload = {
    ...input.payload,
    contractVersion: input.contractVersion,
    companyId: input.companyId,
    surface: input.surfaceKey,
    generatedAt: input.payload.generatedAt || generatedAt.toISOString(),
    observability: {
      sourceRunId: input.payload.observability?.sourceRunId || `surface:${input.surfaceKey}:${input.companyId}:${generatedAt.toISOString()}`,
      inputWatermark: input.inputWatermark || input.payload.observability?.inputWatermark || null,
      checksum,
      staleAt: input.staleAt ? new Date(input.staleAt).toISOString() : null,
      lastError: input.lastError || null,
    },
  };
  assertProjectionPayloadSize(payload);
  return prisma.companySurfaceProjection.upsert({
    where: {
      companyId_surfaceKey_contractVersion: {
        companyId: input.companyId,
        surfaceKey: input.surfaceKey,
        contractVersion: input.contractVersion,
      },
    },
    create: {
      companyId: input.companyId,
      surfaceKey: input.surfaceKey,
      contractVersion: input.contractVersion,
      generatedAt,
      inputWatermark: input.inputWatermark || null,
      checksum,
      freshness: input.freshness || "FRESH",
      payload,
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      staleAt: input.staleAt ? new Date(input.staleAt) : null,
      lastError: input.lastError || null,
    },
    update: {
      generatedAt,
      inputWatermark: input.inputWatermark || null,
      checksum,
      freshness: input.freshness || "FRESH",
      payload,
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      staleAt: input.staleAt ? new Date(input.staleAt) : null,
      lastError: input.lastError || null,
      updatedAt: generatedAt,
    },
  });
}

function buildCompanyDashboardSurfacePayload({ company, snapshot }) {
  const projection = isPlainObject(snapshot?.webappProjection) ? snapshot.webappProjection : {};
  const generatedAt = new Date().toISOString();
  const counts = isPlainObject(projection.counts) ? projection.counts : {};
  const navCounts = isPlainObject(projection.navCounts) ? projection.navCounts : {};
  return {
    contractVersion: SURFACE_PROJECTION_CONTRACT_VERSION,
    generatedAt,
    companyId: company.id,
    surface: "company.dashboardSummary",
    freshness: getSurfaceProjectionFreshness(projection.generatedAt || snapshot?.updatedAt || generatedAt),
    summary: {
      companyName: company.name || null,
      sources: Number(counts.sources || 0),
      flashcards: Number(counts.flashcards || 0),
      goals: Number(counts.goals || 0),
      checklist: Number(navCounts.checklist || counts.checklistCount || 0),
      pipeline: Number(navCounts.pipeline || counts.pipelineJobs || 0),
    },
    filters: [],
    items: Array.isArray(projection.topTasks) ? projection.topTasks.slice(0, 5) : [],
    actions: [
      { key: "refreshProjection", label: "Refresh projection", enabled: true },
    ],
    states: {
      empty: "No dashboard projection data is available yet.",
      stale: "Dashboard projection is stale and should be refreshed locally.",
      success: "Dashboard projection is ready.",
    },
    observability: {
      sourceRunId: typeof projection.sourceRunId === "string" ? projection.sourceRunId : null,
      inputWatermark: typeof projection.inputWatermark === "string" ? projection.inputWatermark : null,
      checksum: typeof projection.checksum === "string" ? projection.checksum : null,
    },
  };
}

async function buildCompanyDashboardSurfaceProjection(prisma, companyId) {
  const [company, snapshot] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } }),
    prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: { webappProjection: true, updatedAt: true },
    }),
  ]);
  if (!company) throw new Error(`COMPANY_NOT_FOUND:${companyId}`);
  const payload = buildCompanyDashboardSurfacePayload({ company, snapshot });
  await upsertCompanySurfaceProjection(prisma, {
    companyId,
    surfaceKey: "company.dashboardSummary",
    contractVersion: SURFACE_PROJECTION_CONTRACT_VERSION,
    payload,
    inputWatermark: payload.observability.inputWatermark,
    freshness: payload.freshness.status,
  });
  return payload;
}

const SURFACE_PROJECTION_BUILDERS = Object.freeze({
  "company.dashboardSummary": {
    surfaceKey: "company.dashboardSummary",
    contractVersion: SURFACE_PROJECTION_CONTRACT_VERSION,
    timeoutMs: 10_000,
    build: buildCompanyDashboardSurfaceProjection,
  },
});

function listSurfaceProjectionBuilders() {
  return Object.values(SURFACE_PROJECTION_BUILDERS).map((builder) => ({
    surfaceKey: builder.surfaceKey,
    contractVersion: builder.contractVersion,
    timeoutMs: builder.timeoutMs,
  }));
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TIMEOUT:${label}:${timeoutMs}`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function refreshDirtyCompanySurfaceProjections(prisma, options = {}) {
  const trigger = typeof options.trigger === "string" ? options.trigger : "surface-projection-refresh";
  const limit = Math.max(1, Math.min(20, Number(options.limit || 3)));
  const state = await readSurfaceProjectionRefreshState(prisma);
  const plan = drainDirtySurfaceProjections(state, limit);
  let nextState = {
    dirtySurfaces: plan.remaining,
    recentRefreshes: plan.recentRefreshes,
  };
  let refreshedSurfaces = 0;
  let failedSurfaces = 0;
  let skippedSurfaces = 0;

  for (const entry of plan.drained) {
    const builder = SURFACE_PROJECTION_BUILDERS[entry.surfaceKey];
    if (!builder) {
      skippedSurfaces += 1;
      nextState = recordSurfaceProjectionRefreshResult(nextState, {
        companyId: entry.companyId,
        surfaceKey: entry.surfaceKey,
        reason: entry.reason,
        status: "SKIPPED",
        trigger,
        error: "SURFACE_BUILDER_NOT_REGISTERED",
      });
      continue;
    }
    const startedAt = Date.now();
    try {
      await withTimeout(builder.build(prisma, entry.companyId), builder.timeoutMs, entry.surfaceKey);
      refreshedSurfaces += 1;
      nextState = recordSurfaceProjectionRefreshResult(nextState, {
        companyId: entry.companyId,
        surfaceKey: entry.surfaceKey,
        reason: entry.reason,
        status: "REFRESHED",
        trigger,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      failedSurfaces += 1;
      nextState = retryDirtySurfaceProjection(nextState, entry, error);
      nextState = recordSurfaceProjectionRefreshResult(nextState, {
        companyId: entry.companyId,
        surfaceKey: entry.surfaceKey,
        reason: entry.reason,
        status: "FAILED",
        trigger,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
    }
  }

  const persisted = await writeSurfaceProjectionRefreshState(prisma, nextState);
  return {
    refreshedSurfaces,
    failedSurfaces,
    skippedSurfaces,
    dirtySurfacesRemaining: persisted.dirtySurfaces.length,
    recentRefreshes: persisted.recentRefreshes,
  };
}

module.exports = {
  COMPANY_SURFACE_PROJECTION_STATE_KEY,
  SURFACE_PROJECTION_CONTRACT_VERSION,
  checksumSurfacePayload,
  stableStringify,
  getSurfaceProjectionFreshness,
  normalizeSurfaceProjectionRefreshState,
  enqueueDirtySurfaceProjection,
  drainDirtySurfaceProjections,
  recordSurfaceProjectionRefreshResult,
  readSurfaceProjectionRefreshState,
  writeSurfaceProjectionRefreshState,
  markCompanySurfaceProjectionDirty,
  upsertCompanySurfaceProjection,
  buildCompanyDashboardSurfaceProjection,
  refreshDirtyCompanySurfaceProjections,
  listSurfaceProjectionBuilders,
};
