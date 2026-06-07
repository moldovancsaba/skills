import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export type ProjectionFreshnessStatus = "FRESH" | "AGING" | "STALE" | "MISSING";

export type SurfaceProjectionFreshness = {
  status: ProjectionFreshnessStatus;
  generatedAt: string | null;
  ageMinutes: number | null;
};

export type SurfaceReadModelAction<TAction extends string = string> = {
  key: TAction;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  confirm?: {
    title: string;
    body: string;
    destructive?: boolean;
  };
};

export type SurfaceReadModelColumn = {
  key: string;
  label: string;
  count: number;
  itemIds: string[];
};

export type SurfaceReadModelFilter = {
  key: string;
  label: string;
  count: number;
  selected?: boolean;
};

export type SurfaceReadModel<TItem = unknown, TAction extends string = string> = {
  contractVersion: number;
  generatedAt: string;
  companyId: string;
  surface: string;
  freshness: SurfaceProjectionFreshness;
  summary: Record<string, number | string | boolean | null>;
  filters: SurfaceReadModelFilter[];
  columns?: SurfaceReadModelColumn[];
  items: TItem[];
  actions: SurfaceReadModelAction<TAction>[];
  states?: {
    loading?: string;
    empty?: string;
    stale?: string;
    blocked?: string;
    error?: string;
    success?: string;
  };
  observability: {
    sourceRunId: string | null;
    inputWatermark: string | null;
    checksum: string | null;
    staleAt?: string | null;
    lastError?: string | null;
  };
};

export type SurfaceProjectionPayload<TItem = unknown, TAction extends string = string> =
  Omit<SurfaceReadModel<TItem, TAction>, "freshness"> & {
    freshness?: Partial<SurfaceProjectionFreshness>;
  };

export type SurfaceProjectionUpsertInput<TItem = unknown, TAction extends string = string> = {
  companyId: string;
  surfaceKey: string;
  contractVersion: number;
  payload: SurfaceProjectionPayload<TItem, TAction>;
  inputWatermark?: string | null;
  staleAt?: Date | string | null;
  freshness?: ProjectionFreshnessStatus;
  lastError?: string | null;
};

export type SurfaceProjectionItemInput = {
  companyId: string;
  surfaceKey: string;
  itemId: string;
  columnKey?: string | null;
  orderRank?: number | null;
  searchText?: string | null;
  filterKeys?: string[];
  payload: unknown;
};

export type SurfaceProjectionDirtyEntry = {
  companyId: string;
  surfaceKey: string;
  reason: string;
  requestedAt: string;
  attemptCount?: number;
  lastError?: string | null;
  nextRetryAt?: string | null;
};

export type SurfaceProjectionRefreshEvent = {
  companyId: string;
  surfaceKey: string;
  reason: string;
  status: "REFRESHED" | "FAILED" | "SKIPPED";
  trigger: string;
  refreshedAt: string;
  durationMs?: number | null;
  error?: string | null;
};

export type SurfaceProjectionRefreshState = {
  dirtySurfaces: SurfaceProjectionDirtyEntry[];
  recentRefreshes: SurfaceProjectionRefreshEvent[];
};

export const COMPANY_SURFACE_PROJECTION_STATE_KEY = "company_surface_projection_refresh_state";
export const SURFACE_PROJECTION_RECENT_REFRESH_LIMIT = 50;
export const SURFACE_PROJECTION_MAX_PAYLOAD_BYTES = 1024 * 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function stableStringify(value: unknown): string {
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

export function checksumSurfacePayload(value: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function getSurfaceProjectionFreshness(generatedAt: string | Date | null | undefined, now = new Date()): SurfaceProjectionFreshness {
  if (!generatedAt) {
    return { status: "MISSING", generatedAt: null, ageMinutes: null };
  }
  const generatedDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  const generatedMs = generatedDate.getTime();
  if (!Number.isFinite(generatedMs)) {
    return { status: "MISSING", generatedAt: null, ageMinutes: null };
  }
  const ageMinutes = Math.max(0, Math.round((now.getTime() - generatedMs) / 60000));
  return {
    status: ageMinutes <= 60 ? "FRESH" : ageMinutes <= 120 ? "AGING" : "STALE",
    generatedAt: generatedDate.toISOString(),
    ageMinutes,
  };
}

export function normalizeSurfaceReadModel<TItem = unknown, TAction extends string = string>(
  value: unknown,
  fallback: { companyId: string; surfaceKey: string; contractVersion: number },
): SurfaceReadModel<TItem, TAction> {
  const record = isPlainObject(value) ? value : {};
  const generatedAt = typeof record.generatedAt === "string" ? record.generatedAt : new Date().toISOString();
  const observability = isPlainObject(record.observability) ? record.observability : {};
  return {
    contractVersion: Number(record.contractVersion || fallback.contractVersion),
    generatedAt,
    companyId: typeof record.companyId === "string" ? record.companyId : fallback.companyId,
    surface: typeof record.surface === "string" ? record.surface : fallback.surfaceKey,
    freshness: {
      ...getSurfaceProjectionFreshness(generatedAt),
      ...(isPlainObject(record.freshness) ? record.freshness : {}),
    },
    summary: isPlainObject(record.summary) ? record.summary as SurfaceReadModel["summary"] : {},
    filters: Array.isArray(record.filters) ? record.filters as SurfaceReadModelFilter[] : [],
    columns: Array.isArray(record.columns) ? record.columns as SurfaceReadModelColumn[] : undefined,
    items: Array.isArray(record.items) ? record.items as TItem[] : [],
    actions: Array.isArray(record.actions) ? record.actions as SurfaceReadModelAction<TAction>[] : [],
    states: isPlainObject(record.states) ? record.states as SurfaceReadModel["states"] : undefined,
    observability: {
      sourceRunId: typeof observability.sourceRunId === "string" ? observability.sourceRunId : null,
      inputWatermark: typeof observability.inputWatermark === "string" ? observability.inputWatermark : null,
      checksum: typeof observability.checksum === "string" ? observability.checksum : null,
      staleAt: typeof observability.staleAt === "string" ? observability.staleAt : null,
      lastError: typeof observability.lastError === "string" ? observability.lastError : null,
    },
  };
}

export function buildMissingSurfaceReadModel<TItem = unknown, TAction extends string = string>(
  companyId: string,
  surfaceKey: string,
  contractVersion = 1,
): SurfaceReadModel<TItem, TAction> {
  const generatedAt = new Date().toISOString();
  return {
    contractVersion,
    generatedAt,
    companyId,
    surface: surfaceKey,
    freshness: { status: "MISSING", generatedAt: null, ageMinutes: null },
    summary: {},
    filters: [],
    items: [],
    actions: [],
    states: {
      empty: "No prepared surface projection is available yet.",
      stale: "Surface projection is missing and needs a local refresh.",
    },
    observability: {
      sourceRunId: null,
      inputWatermark: null,
      checksum: null,
      staleAt: null,
      lastError: "PROJECTION_MISSING",
    },
  };
}

function assertProjectionPayloadSize(payload: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > SURFACE_PROJECTION_MAX_PAYLOAD_BYTES) {
    throw new Error(`SURFACE_PROJECTION_PAYLOAD_TOO_LARGE:${bytes}`);
  }
  return bytes;
}

export async function upsertCompanySurfaceProjection<TItem = unknown, TAction extends string = string>(
  prisma: PrismaClient,
  input: SurfaceProjectionUpsertInput<TItem, TAction>,
) {
  const generatedAt = new Date();
  const checksum = checksumSurfacePayload(input.payload);
  const payload: SurfaceProjectionPayload<TItem, TAction> = {
    ...input.payload,
    contractVersion: input.contractVersion,
    companyId: input.companyId,
    surface: input.surfaceKey,
    generatedAt: input.payload.generatedAt || generatedAt.toISOString(),
    observability: {
      sourceRunId: input.payload.observability?.sourceRunId ?? `surface:${input.surfaceKey}:${input.companyId}:${generatedAt.toISOString()}`,
      inputWatermark: input.inputWatermark ?? input.payload.observability?.inputWatermark ?? null,
      checksum,
      staleAt: input.staleAt ? new Date(input.staleAt).toISOString() : null,
      lastError: input.lastError ?? null,
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
      inputWatermark: input.inputWatermark ?? null,
      checksum,
      freshness: input.freshness ?? "FRESH",
      payload: payload as Prisma.InputJsonValue,
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      staleAt: input.staleAt ? new Date(input.staleAt) : null,
      lastError: input.lastError ?? null,
    },
    update: {
      generatedAt,
      inputWatermark: input.inputWatermark ?? null,
      checksum,
      freshness: input.freshness ?? "FRESH",
      payload: payload as Prisma.InputJsonValue,
      itemCount: Array.isArray(payload.items) ? payload.items.length : 0,
      staleAt: input.staleAt ? new Date(input.staleAt) : null,
      lastError: input.lastError ?? null,
      updatedAt: generatedAt,
    },
  });
}

export async function getCompanySurfaceReadModel<TItem = unknown, TAction extends string = string>(
  prisma: PrismaClient,
  input: { companyId: string; surfaceKey: string; contractVersion?: number },
): Promise<SurfaceReadModel<TItem, TAction>> {
  const contractVersion = input.contractVersion ?? 1;
  const projection = await prisma.companySurfaceProjection.findUnique({
    where: {
      companyId_surfaceKey_contractVersion: {
        companyId: input.companyId,
        surfaceKey: input.surfaceKey,
        contractVersion,
      },
    },
  });
  if (!projection) {
    return buildMissingSurfaceReadModel<TItem, TAction>(input.companyId, input.surfaceKey, contractVersion);
  }
  const model = normalizeSurfaceReadModel<TItem, TAction>(projection.payload, {
    companyId: input.companyId,
    surfaceKey: input.surfaceKey,
    contractVersion,
  });
  const freshness = getSurfaceProjectionFreshness(projection.generatedAt);
  return {
    ...model,
    freshness: {
      ...model.freshness,
      ...freshness,
      status: projection.freshness as ProjectionFreshnessStatus || freshness.status,
    },
    observability: {
      ...model.observability,
      inputWatermark: projection.inputWatermark ?? model.observability.inputWatermark,
      checksum: projection.checksum ?? model.observability.checksum,
      staleAt: projection.staleAt?.toISOString() ?? model.observability.staleAt ?? null,
      lastError: projection.lastError ?? model.observability.lastError ?? null,
    },
  };
}

export async function upsertCompanySurfaceItemProjection(prisma: PrismaClient, input: SurfaceProjectionItemInput) {
  const payloadChecksum = checksumSurfacePayload(input.payload);
  return prisma.companySurfaceItemProjection.upsert({
    where: {
      companyId_surfaceKey_itemId: {
        companyId: input.companyId,
        surfaceKey: input.surfaceKey,
        itemId: input.itemId,
      },
    },
    create: {
      companyId: input.companyId,
      surfaceKey: input.surfaceKey,
      itemId: input.itemId,
      columnKey: input.columnKey ?? null,
      orderRank: input.orderRank ?? null,
      searchText: input.searchText ?? null,
      filterKeys: input.filterKeys ?? [],
      payload: input.payload as Prisma.InputJsonValue,
      payloadChecksum,
    },
    update: {
      columnKey: input.columnKey ?? null,
      orderRank: input.orderRank ?? null,
      searchText: input.searchText ?? null,
      filterKeys: input.filterKeys ?? [],
      payload: input.payload as Prisma.InputJsonValue,
      payloadChecksum,
      updatedAt: new Date(),
    },
  });
}

export function normalizeSurfaceProjectionRefreshState(value: unknown): SurfaceProjectionRefreshState {
  const record = isPlainObject(value) ? value : {};
  const dirtySurfaces = Array.isArray(record.dirtySurfaces)
    ? record.dirtySurfaces.filter((entry): entry is SurfaceProjectionDirtyEntry =>
      isPlainObject(entry) && typeof entry.companyId === "string" && typeof entry.surfaceKey === "string")
    : [];
  const recentRefreshes = Array.isArray(record.recentRefreshes)
    ? record.recentRefreshes.filter((entry): entry is SurfaceProjectionRefreshEvent =>
      isPlainObject(entry) && typeof entry.companyId === "string" && typeof entry.surfaceKey === "string")
    : [];
  return {
    dirtySurfaces,
    recentRefreshes: recentRefreshes.slice(-SURFACE_PROJECTION_RECENT_REFRESH_LIMIT),
  };
}

export function enqueueDirtySurfaceProjection(
  state: unknown,
  companyId: string,
  surfaceKey: string,
  reason = "surface-projection-refresh",
  now = new Date(),
): SurfaceProjectionRefreshState {
  const normalized = normalizeSurfaceProjectionRefreshState(state);
  const requestedAt = now.toISOString();
  const nextDirty = normalized.dirtySurfaces.filter((entry) => !(entry.companyId === companyId && entry.surfaceKey === surfaceKey));
  nextDirty.push({ companyId, surfaceKey, reason, requestedAt, attemptCount: 0, lastError: null, nextRetryAt: null });
  return {
    dirtySurfaces: nextDirty.sort((left, right) => new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime()),
    recentRefreshes: normalized.recentRefreshes,
  };
}

export function drainDirtySurfaceProjections(state: unknown, limit = 3) {
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

export function recordSurfaceProjectionRefreshResult(
  state: unknown,
  result: Omit<SurfaceProjectionRefreshEvent, "refreshedAt"> & { refreshedAt?: string },
  now = new Date(),
): SurfaceProjectionRefreshState {
  const normalized = normalizeSurfaceProjectionRefreshState(state);
  const event: SurfaceProjectionRefreshEvent = {
    companyId: result.companyId,
    surfaceKey: result.surfaceKey,
    reason: result.reason,
    status: result.status,
    trigger: result.trigger,
    refreshedAt: result.refreshedAt ?? now.toISOString(),
    durationMs: result.durationMs ?? null,
    error: result.error ?? null,
  };
  return {
    dirtySurfaces: normalized.dirtySurfaces,
    recentRefreshes: [...normalized.recentRefreshes, event].slice(-SURFACE_PROJECTION_RECENT_REFRESH_LIMIT),
  };
}

export async function markCompanySurfaceProjectionDirty(
  prisma: PrismaClient,
  companyId: string,
  surfaceKey: string,
  reason = "surface-projection-refresh",
) {
  if (!companyId || !surfaceKey) return null;
  const setting = await prisma.globalSetting.findUnique({ where: { key: COMPANY_SURFACE_PROJECTION_STATE_KEY } });
  const nextState = enqueueDirtySurfaceProjection(setting?.value, companyId, surfaceKey, reason, new Date());
  return prisma.globalSetting.upsert({
    where: { key: COMPANY_SURFACE_PROJECTION_STATE_KEY },
    create: { key: COMPANY_SURFACE_PROJECTION_STATE_KEY, value: nextState as Prisma.InputJsonValue },
    update: { value: nextState as Prisma.InputJsonValue, updatedAt: new Date() },
  });
}
