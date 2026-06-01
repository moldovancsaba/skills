import "server-only";

import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { ensureDestinationInstance, getActiveDestinationInstance } from "@/lib/destination-workflows";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const VISITOR_CONTENT_PRIMITIVES = [
  "venue",
  "program",
  "course",
  "event",
  "series",
  "camp",
  "competition",
  "community",
  "exhibition",
  "service",
  "resource",
  "source-only",
] as const;

export type VisitorContentPrimitive = (typeof VISITOR_CONTENT_PRIMITIVES)[number];

export type VisitorBlueprint = {
  visitorKey: string;
  state?: "draft" | "active" | "deprecated";
  industry: string;
  location: {
    country?: string;
    city?: string;
    region?: string;
    geoGranularity: "city" | "region" | "country" | "multi_region";
  };
  audience: string[];
  publicPromise: string;
  taxonomyVersion: string;
  sourcePolicyVersion: string;
  qualityGateVersion: string;
  feedbackPolicyVersion: string;
};

export type VisitorContentType = {
  contentType: string;
  primitive: VisitorContentPrimitive;
  publicEligible: boolean;
  label: string;
  description?: string;
  evidenceProfileKey?: string;
};

export type VisitorTaxonomy = {
  visitorKey: string;
  version: string;
  contentTypes: VisitorContentType[];
  forbiddenMappings: Array<{ sourceTerm: string; reason: string }>;
  aliases: Array<{ from: string; to: string }>;
  requiredEvidenceByType: Record<string, Array<{ field: string; required: boolean; note?: string }>>;
};

type VisitorStore = {
  blueprints?: Record<string, VisitorBlueprint>;
  taxonomies?: Record<string, VisitorTaxonomy>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeVisitorKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function resolveDestinationKeyForVisitor(visitorKeyRaw: string): DestinationKey | null {
  const visitorKey = normalizeVisitorKey(visitorKeyRaw);
  if (!visitorKey) return null;
  if (visitorKey.includes("classscout")) return "classscout";
  if (visitorKey.includes("rangescout") || visitorKey.includes("compare")) return "compare";
  return null;
}

export function resolveDestinationKeyForVisitorWithHint(visitorKeyRaw: string, destinationKeyHint?: unknown): DestinationKey | null {
  const hinted = normalizeDestinationKey(destinationKeyHint);
  if (hinted) return hinted;
  return resolveDestinationKeyForVisitor(visitorKeyRaw);
}

function assertKnownPrimitive(value: string): asserts value is VisitorContentPrimitive {
  if ((VISITOR_CONTENT_PRIMITIVES as readonly string[]).includes(value)) return;
  throw new Error(`Unknown Visitor content primitive: ${value}`);
}

function validateBlueprint(blueprint: VisitorBlueprint) {
  if (!normalizeVisitorKey(blueprint.visitorKey)) throw new Error("visitorKey is required");
  if (blueprint.state && !["draft", "active", "deprecated"].includes(blueprint.state)) {
    throw new Error("state must be draft, active, or deprecated");
  }
  if (!blueprint.industry?.trim()) throw new Error("industry is required");
  if (!Array.isArray(blueprint.audience)) throw new Error("audience must be an array");
  if (!blueprint.location || !["city", "region", "country", "multi_region"].includes(blueprint.location.geoGranularity)) {
    throw new Error("location.geoGranularity is required");
  }
}

function validateTaxonomy(taxonomy: VisitorTaxonomy) {
  if (!normalizeVisitorKey(taxonomy.visitorKey)) throw new Error("taxonomy.visitorKey is required");
  if (!Array.isArray(taxonomy.contentTypes) || taxonomy.contentTypes.length === 0) {
    throw new Error("taxonomy.contentTypes must be a non-empty array");
  }
  for (const contentType of taxonomy.contentTypes) {
    if (!contentType.contentType?.trim()) throw new Error("contentType.contentType is required");
    assertKnownPrimitive(contentType.primitive);
    if (contentType.primitive === "source-only" && contentType.publicEligible) {
      throw new Error("source-only cannot be publicEligible");
    }
  }
}

function readVisitorStore(config: Prisma.JsonValue | null | undefined): VisitorStore {
  const record = asRecord(config);
  const visitor = asRecord(record?.visitor);
  if (!visitor) return {};
  return {
    blueprints: (asRecord(visitor.blueprints) ?? {}) as Record<string, VisitorBlueprint>,
    taxonomies: (asRecord(visitor.taxonomies) ?? {}) as Record<string, VisitorTaxonomy>,
  };
}

function writeVisitorStore(existingConfig: Prisma.JsonValue | null | undefined, store: VisitorStore): Prisma.InputJsonValue {
  const record = asRecord(existingConfig) ?? {};
  const visitor = asRecord(record.visitor) ?? {};
  visitor.blueprints = store.blueprints ?? {};
  visitor.taxonomies = store.taxonomies ?? {};
  record.visitor = visitor;
  return record as Prisma.InputJsonValue;
}

async function getDestinationInstanceForVisitor(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) {
    throw new Error(`Unsupported visitorKey "${visitorKey}". Expected classscout-* or rangescout-/compare-*.`);
  }
  return ensureDestinationInstance(companyId, destinationKey);
}

export async function getVisitorBlueprint(companyId: string, visitorKey: string, destinationKeyHint?: unknown): Promise<VisitorBlueprint | null> {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) return null;
  const instance = await getActiveDestinationInstance(companyId, destinationKey);
  if (!instance) return null;
  const store = readVisitorStore(instance.config as Prisma.JsonValue);
  return store.blueprints?.[normalizeVisitorKey(visitorKey)] ?? null;
}

export async function upsertVisitorBlueprint(companyId: string, blueprint: VisitorBlueprint, destinationKeyHint?: unknown): Promise<VisitorBlueprint> {
  validateBlueprint(blueprint);
  const visitorKey = normalizeVisitorKey(blueprint.visitorKey);
  const instance = await getDestinationInstanceForVisitor(companyId, visitorKey, destinationKeyHint);
  const store = readVisitorStore(instance.config as Prisma.JsonValue);
  const nextBlueprint: VisitorBlueprint = {
    ...blueprint,
    visitorKey,
    state: blueprint.state ?? "draft",
  };
  const nextStore: VisitorStore = {
    ...store,
    blueprints: {
      ...(store.blueprints ?? {}),
      [visitorKey]: nextBlueprint,
    },
  };
  await prisma.destinationInstance.update({
    where: { id: instance.id },
    data: {
      config: writeVisitorStore(instance.config as Prisma.JsonValue, nextStore),
    },
  });
  return nextBlueprint;
}

export async function activateVisitorBlueprint(companyId: string, visitorKeyRaw: string, destinationKeyHint?: unknown): Promise<VisitorBlueprint> {
  const visitorKey = normalizeVisitorKey(visitorKeyRaw);
  const instance = await getDestinationInstanceForVisitor(companyId, visitorKey, destinationKeyHint);
  const store = readVisitorStore(instance.config as Prisma.JsonValue);
  const current = store.blueprints?.[visitorKey];
  if (!current) throw new Error("Visitor blueprint not found");
  const nextBlueprint: VisitorBlueprint = {
    ...current,
    state: "active",
  };
  const nextStore: VisitorStore = {
    ...store,
    blueprints: {
      ...(store.blueprints ?? {}),
      [visitorKey]: nextBlueprint,
    },
  };
  await prisma.destinationInstance.update({
    where: { id: instance.id },
    data: {
      config: writeVisitorStore(instance.config as Prisma.JsonValue, nextStore),
    },
  });
  return nextBlueprint;
}

export async function requireActiveVisitorBlueprint(companyId: string, visitorKeyRaw: string, destinationKeyHint?: unknown): Promise<VisitorBlueprint> {
  const visitorKey = normalizeVisitorKey(visitorKeyRaw);
  const blueprint = await getVisitorBlueprint(companyId, visitorKey, destinationKeyHint);
  if (!blueprint) throw new Error("Visitor blueprint not found");
  if (blueprint.state !== "active") {
    throw new Error(`Visitor blueprint is not active (state=${blueprint.state ?? "draft"})`);
  }
  return blueprint;
}

export async function getVisitorTaxonomy(companyId: string, visitorKey: string, destinationKeyHint?: unknown): Promise<VisitorTaxonomy | null> {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) return null;
  const instance = await getActiveDestinationInstance(companyId, destinationKey);
  if (!instance) return null;
  const store = readVisitorStore(instance.config as Prisma.JsonValue);
  return store.taxonomies?.[normalizeVisitorKey(visitorKey)] ?? null;
}

export async function upsertVisitorTaxonomy(companyId: string, taxonomy: VisitorTaxonomy, destinationKeyHint?: unknown): Promise<VisitorTaxonomy> {
  validateTaxonomy(taxonomy);
  const visitorKey = normalizeVisitorKey(taxonomy.visitorKey);
  const instance = await getDestinationInstanceForVisitor(companyId, visitorKey, destinationKeyHint);
  const store = readVisitorStore(instance.config as Prisma.JsonValue);
  const nextTaxonomy: VisitorTaxonomy = {
    ...taxonomy,
    visitorKey,
  };
  const nextStore: VisitorStore = {
    ...store,
    taxonomies: {
      ...(store.taxonomies ?? {}),
      [visitorKey]: nextTaxonomy,
    },
  };
  await prisma.destinationInstance.update({
    where: { id: instance.id },
    data: {
      config: writeVisitorStore(instance.config as Prisma.JsonValue, nextStore),
    },
  });
  return nextTaxonomy;
}
