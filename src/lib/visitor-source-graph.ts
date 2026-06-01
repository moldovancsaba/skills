import "server-only";

import { prisma } from "@/lib/db";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { ensureDestinationInstance } from "@/lib/destination-workflows";

export const VISITOR_DATACARD_TYPES = [
  "source_datacard",
  "organization_datacard",
  "taxonomy_datacard",
  "location_datacard",
  "blocked_pattern_datacard",
  "trusted_source_datacard",
  "content_gap_datacard",
  "competitor_reference_datacard",
] as const;

export type VisitorDatacardType = (typeof VISITOR_DATACARD_TYPES)[number];
export type VisitorSourceKind =
  | "official_site"
  | "calendar"
  | "directory"
  | "federation"
  | "venue"
  | "social"
  | "government";
export type VisitorTrustTier = "trusted" | "usable" | "weak" | "blocked";

export type VisitorSourceDatacard = {
  sourceId: string;
  visitorKey: string;
  datacardType: VisitorDatacardType;
  url: string;
  canonicalUrl: string;
  sourceKind: VisitorSourceKind;
  trustTier: VisitorTrustTier;
  industryRelevance: number;
  locationRelevance: number;
  extractionHints: string[];
  knownContentTypes: string[];
  sourceTitle?: string;
  entityKind?: "provider" | "meetupGroup";
  extractedFacts?: Record<string, unknown>;
  publicDraftPayload?: Record<string, unknown>;
  autoPublishEligible?: boolean;
  blockedReasons?: string[];
  refreshCadenceDays?: number;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeVisitorKey(value: string) {
  return value.trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCanonicalUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.searchParams.sort();
    const normalized = url.toString().replace(/\/$/, "");
    return normalized.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function assertInSet<T extends string>(value: string, allowed: readonly T[], scope: string): asserts value is T {
  if ((allowed as readonly string[]).includes(value)) return;
  throw new Error(`${scope} must be one of: ${allowed.join(", ")}`);
}

function normalizeDatacard(visitorKey: string, input: Partial<VisitorSourceDatacard>) {
  const datacardType = asString(input.datacardType ?? "source_datacard").toLowerCase();
  const sourceKind = asString(input.sourceKind ?? "official_site").toLowerCase();
  const trustTier = asString(input.trustTier ?? "usable").toLowerCase();
  assertInSet(datacardType, VISITOR_DATACARD_TYPES, "datacardType");
  assertInSet(
    sourceKind,
    ["official_site", "calendar", "directory", "federation", "venue", "social", "government"] as const,
    "sourceKind",
  );
  assertInSet(trustTier, ["trusted", "usable", "weak", "blocked"] as const, "trustTier");

  const url = asString(input.url);
  const canonicalUrl = normalizeCanonicalUrl(asString(input.canonicalUrl) || url);
  if (!canonicalUrl) throw new Error("url is required");

  const blockedReasons = asStringArray(input.blockedReasons);
  if (trustTier === "blocked" && blockedReasons.length === 0) {
    throw new Error("blocked trustTier requires blockedReasons");
  }

  return {
    sourceId: asString(input.sourceId),
    visitorKey: normalizeVisitorKey(visitorKey),
    datacardType,
    url,
    canonicalUrl,
    sourceKind,
    trustTier,
    industryRelevance: clamp01(asNumber(input.industryRelevance)),
    locationRelevance: clamp01(asNumber(input.locationRelevance)),
    extractionHints: asStringArray(input.extractionHints),
    knownContentTypes: asStringArray(input.knownContentTypes),
    sourceTitle: asString(input.sourceTitle) || undefined,
    entityKind: input.entityKind === "provider" || input.entityKind === "meetupGroup" ? input.entityKind : undefined,
    extractedFacts: asRecord(input.extractedFacts) ?? undefined,
    publicDraftPayload: asRecord(input.publicDraftPayload) ?? undefined,
    autoPublishEligible: input.autoPublishEligible === true,
    blockedReasons,
    refreshCadenceDays: Number.isFinite(Number(input.refreshCadenceDays)) ? Number(input.refreshCadenceDays) : undefined,
    lastCheckedAt: asString(input.lastCheckedAt) || undefined,
    createdAt: asString(input.createdAt) || nowIso(),
    updatedAt: asString(input.updatedAt) || nowIso(),
  } as VisitorSourceDatacard;
}

function readDatacardFromSourceDocument(input: {
  id: string;
  visitorKey: string;
  sourceUrl: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): VisitorSourceDatacard | null {
  const metadata = asRecord(input.metadata);
  const candidate = asRecord(metadata?.visitorSourceDatacard);
  if (!candidate) return null;
  const normalized = normalizeDatacard(input.visitorKey, {
    ...candidate,
    sourceId: input.id,
    url: asString(candidate.url) || asString(input.sourceUrl),
  });
  return {
    ...normalized,
    sourceId: input.id,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  } satisfies VisitorSourceDatacard;
}

export async function listVisitorSourceDatacards(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await ensureDestinationInstance(companyId, destinationKey);
  const rows = await prisma.destinationSourceDocument.findMany({
    where: {
      companyId,
      destinationInstanceId: instance.id,
      sourceType: "visitor_datacard",
    },
    select: {
      id: true,
      sourceUrl: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows
    .map((row) =>
      readDatacardFromSourceDocument({
        ...row,
        visitorKey,
      }),
    )
    .filter(Boolean) as VisitorSourceDatacard[];
}

export async function createVisitorSourceDatacard(
  companyId: string,
  visitorKey: string,
  input: Partial<VisitorSourceDatacard>,
  destinationKeyHint?: unknown,
) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await ensureDestinationInstance(companyId, destinationKey);
  const datacard = normalizeDatacard(visitorKey, input);

  const existing = await prisma.destinationSourceDocument.findFirst({
    where: {
      companyId,
      destinationInstanceId: instance.id,
      sourceType: "visitor_datacard",
      sourceUrl: datacard.canonicalUrl,
    },
    orderBy: { updatedAt: "desc" },
  });
  const metadata = {
    visitorSourceDatacard: datacard,
  };

  const saved = existing
    ? await prisma.destinationSourceDocument.update({
        where: { id: existing.id },
        data: {
          sourceUrl: datacard.canonicalUrl,
          metadata: metadata as never,
          fetchedAt: new Date(),
        },
      })
    : await prisma.destinationSourceDocument.create({
        data: {
          companyId,
          destinationInstanceId: instance.id,
          sourceType: "visitor_datacard",
          sourceUrl: datacard.canonicalUrl,
          rawText: "",
          metadata: metadata as never,
          fetchedAt: new Date(),
        },
      });

  return readDatacardFromSourceDocument({
    id: saved.id,
    sourceUrl: saved.sourceUrl,
    metadata: saved.metadata,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    visitorKey,
  });
}

export async function updateVisitorSourceDatacard(
  companyId: string,
  visitorKey: string,
  sourceId: string,
  patch: Partial<VisitorSourceDatacard>,
  _destinationKeyHint?: unknown,
) {
  const row = await prisma.destinationSourceDocument.findFirst({
    where: {
      id: sourceId,
      companyId,
      sourceType: "visitor_datacard",
    },
  });
  if (!row) return null;

  const current = readDatacardFromSourceDocument({
    id: row.id,
    sourceUrl: row.sourceUrl,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    visitorKey,
  });
  if (!current) return null;

  const next = normalizeDatacard(visitorKey, {
    ...current,
    ...patch,
    sourceId: row.id,
  });
  const saved = await prisma.destinationSourceDocument.update({
    where: { id: row.id },
    data: {
      sourceUrl: next.canonicalUrl,
      metadata: { visitorSourceDatacard: next } as never,
      fetchedAt: new Date(),
    },
  });
  return readDatacardFromSourceDocument({
    id: saved.id,
    sourceUrl: saved.sourceUrl,
    metadata: saved.metadata,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
    visitorKey,
  });
}

export async function refreshVisitorSourceDatacard(companyId: string, visitorKey: string, sourceId: string, destinationKeyHint?: unknown) {
  return updateVisitorSourceDatacard(companyId, visitorKey, sourceId, {
    lastCheckedAt: new Date().toISOString(),
  }, destinationKeyHint);
}

export async function listVisitorSourceRefreshQueue(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const rows = await listVisitorSourceDatacards(companyId, visitorKey, destinationKeyHint);
  const now = Date.now();
  const queue = rows
    .map((row) => {
      const cadenceDays = Number.isFinite(Number(row.refreshCadenceDays)) ? Number(row.refreshCadenceDays) : 14;
      const lastCheckedAtMs = row.lastCheckedAt ? new Date(row.lastCheckedAt).getTime() : 0;
      const nextRefreshAtMs = lastCheckedAtMs > 0 ? lastCheckedAtMs + cadenceDays * 24 * 60 * 60 * 1000 : 0;
      return {
        sourceId: row.sourceId,
        canonicalUrl: row.canonicalUrl,
        trustTier: row.trustTier,
        refreshCadenceDays: cadenceDays,
        lastCheckedAt: row.lastCheckedAt ?? null,
        nextRefreshAt: nextRefreshAtMs > 0 ? new Date(nextRefreshAtMs).toISOString() : null,
        overdue: nextRefreshAtMs === 0 || nextRefreshAtMs <= now,
      };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.nextRefreshAt || "").localeCompare(b.nextRefreshAt || "");
    });

  return {
    checkedAt: new Date().toISOString(),
    dueCount: queue.filter((item) => item.overdue).length,
    totalSources: queue.length,
    queue,
  };
}

export async function validateVisitorSourceGraph(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const rows = await listVisitorSourceDatacards(companyId, visitorKey, destinationKeyHint);
  const errors: Array<{ sourceId: string; code: string; detail: string }> = [];
  const warnings: Array<{ sourceId: string; code: string; detail: string }> = [];
  const seen = new Set<string>();
  let officialCount = 0;
  for (const row of rows) {
    if (!row.canonicalUrl) {
      errors.push({ sourceId: row.sourceId, code: "missing_canonical_url", detail: "canonicalUrl is required" });
      continue;
    }
    if (seen.has(row.canonicalUrl)) {
      warnings.push({
        sourceId: row.sourceId,
        code: "duplicate_canonical_url",
        detail: `Duplicate canonicalUrl: ${row.canonicalUrl}`,
      });
    }
    seen.add(row.canonicalUrl);
    if (row.sourceKind === "official_site" || row.sourceKind === "government" || row.sourceKind === "federation") {
      officialCount += 1;
    }
    if (row.trustTier === "blocked" && (!row.blockedReasons || row.blockedReasons.length === 0)) {
      errors.push({
        sourceId: row.sourceId,
        code: "blocked_without_reason",
        detail: "Blocked datacards require blockedReasons.",
      });
    }
    const cadence = Number.isFinite(Number(row.refreshCadenceDays)) ? Number(row.refreshCadenceDays) : 14;
    if (cadence <= 0 || cadence > 365) {
      warnings.push({
        sourceId: row.sourceId,
        code: "refresh_cadence_out_of_bounds",
        detail: `refreshCadenceDays=${cadence} should be between 1 and 365`,
      });
    }
  }
  if (officialCount === 0 && rows.length > 0) {
    warnings.push({
      sourceId: "all",
      code: "no_official_sources",
      detail: "No official/government/federation source is active.",
    });
  }
  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    totalSources: rows.length,
    officialSourceCount: officialCount,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
  };
}
