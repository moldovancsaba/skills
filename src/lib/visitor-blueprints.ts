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

function isClassScoutVisitorKey(value: string) {
  const visitorKey = normalizeVisitorKey(value);
  return visitorKey === "classscout" || visitorKey === "classscout-new-york" || visitorKey.includes("classscout");
}

export function resolveDestinationKeyForVisitor(visitorKeyRaw: string): DestinationKey | null {
  const visitorKey = normalizeVisitorKey(visitorKeyRaw);
  if (!visitorKey) return null;
  if (visitorKey.includes("classscout")) return "classscout";
  if (visitorKey.includes("compare")) return "compare";
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

const CLASSSCOUT_REQUIRED_PROVIDER_EVIDENCE = [
  { field: "name", required: true, note: "Provider or program name shown on the public profile." },
  { field: "category", required: true, note: "Primary launch category or enrichment category." },
  { field: "borough", required: true, note: "Launch scope must resolve to Manhattan." },
  { field: "neighborhood", required: true, note: "Neighborhood-level browse and map filtering require this." },
  { field: "ageRanges", required: true, note: "Parent-facing eligibility filter." },
  { field: "programType", required: true, note: "Class, camp, party, drop-in, event, meetup, or provider profile." },
  { field: "shortDescription", required: true, note: "Human-readable public summary." },
  { field: "website", required: true, note: "Provider claim/contact and outbound attribution path." },
  { field: "image", required: true, note: "Uploaded public ImgBB image for launch-quality cards." },
  { field: "sourceUrl", required: true, note: "Official source or reviewed directory evidence." },
] as const;

const CLASSSCOUT_LAUNCH_CONTENT_TYPES: VisitorContentType[] = [
  { contentType: "Classes", primitive: "course", publicEligible: true, label: "Classes", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Camps", primitive: "camp", publicEligible: true, label: "Camps", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Birthday Parties", primitive: "service", publicEligible: true, label: "Birthday Parties", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Drop-In Activities", primitive: "program", publicEligible: true, label: "Drop-In Activities", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Family Events", primitive: "event", publicEligible: true, label: "Family Events", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Meetup Groups", primitive: "community", publicEligible: true, label: "Meetup Groups", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Arts", primitive: "course", publicEligible: true, label: "Arts", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "STEM", primitive: "course", publicEligible: true, label: "STEM", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Music", primitive: "course", publicEligible: true, label: "Music", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Sports", primitive: "program", publicEligible: true, label: "Sports", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Dance", primitive: "course", publicEligible: true, label: "Dance", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Theater", primitive: "course", publicEligible: true, label: "Theater", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Martial Arts", primitive: "course", publicEligible: true, label: "Martial Arts", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Swimming", primitive: "course", publicEligible: true, label: "Swimming", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Tutoring", primitive: "course", publicEligible: true, label: "Tutoring", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Language", primitive: "course", publicEligible: true, label: "Language", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Provider Profiles", primitive: "venue", publicEligible: true, label: "Provider Profiles", evidenceProfileKey: "classscout-provider-profile" },
  { contentType: "Source Only", primitive: "source-only", publicEligible: false, label: "Source Only" },
];

const CLASSSCOUT_REQUIRED_EVIDENCE_BY_TYPE = Object.fromEntries(
  CLASSSCOUT_LAUNCH_CONTENT_TYPES
    .filter((contentType) => contentType.publicEligible)
    .map((contentType) => [contentType.contentType.toLowerCase(), [...CLASSSCOUT_REQUIRED_PROVIDER_EVIDENCE]])
) as VisitorTaxonomy["requiredEvidenceByType"];

export function getDefaultVisitorBlueprint(visitorKeyRaw: string): VisitorBlueprint | null {
  const visitorKey = normalizeVisitorKey(visitorKeyRaw);
  if (!isClassScoutVisitorKey(visitorKey)) return null;
  return {
    visitorKey,
    state: "active",
    industry: "kids_family_activities",
    location: { country: "United States", region: "New York", city: "Manhattan", geoGranularity: "city" },
    audience: ["parents", "caregivers", "families", "providers"],
    publicPromise: "Find reviewed Manhattan classes, camps, birthday parties, drop-ins, events, meetups, and enrichment providers for kids and families.",
    taxonomyVersion: "classscout-manhattan-launch@v1",
    sourcePolicyVersion: "classscout-manhattan-launch@v1",
    qualityGateVersion: "classscout-manhattan-launch@v1",
    feedbackPolicyVersion: "classscout-manhattan-launch@v1",
  };
}

export function getDefaultVisitorTaxonomy(visitorKeyRaw: string): VisitorTaxonomy | null {
  const visitorKey = normalizeVisitorKey(visitorKeyRaw);
  if (!isClassScoutVisitorKey(visitorKey)) return null;
  return {
    visitorKey,
    version: "classscout-manhattan-launch@v1",
    contentTypes: CLASSSCOUT_LAUNCH_CONTENT_TYPES,
    forbiddenMappings: [
      { sourceTerm: "adult only", reason: "ClassScout launch profiles must be family or youth relevant." },
      { sourceTerm: "21+", reason: "Adult-only venue signal." },
      { sourceTerm: "school admissions", reason: "Admissions-only pages are not provider activity profiles." },
      { sourceTerm: "daycare only", reason: "Daycare-only listings are outside the launch category set." },
      { sourceTerm: "travel guide", reason: "Generic travel pages are not provider evidence." },
      { sourceTerm: "source only", reason: "Source-only pages cannot become public provider profiles." },
    ],
    aliases: [
      { from: "art", to: "Arts" },
      { from: "arts classes", to: "Arts" },
      { from: "coding", to: "STEM" },
      { from: "robotics", to: "STEM" },
      { from: "science", to: "STEM" },
      { from: "music lessons", to: "Music" },
      { from: "sports classes", to: "Sports" },
      { from: "birthday party", to: "Birthday Parties" },
      { from: "drop in", to: "Drop-In Activities" },
      { from: "storytime", to: "Drop-In Activities" },
      { from: "family event", to: "Family Events" },
      { from: "parent meetup", to: "Meetup Groups" },
    ],
    requiredEvidenceByType: CLASSSCOUT_REQUIRED_EVIDENCE_BY_TYPE,
  };
}

async function getDestinationInstanceForVisitor(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) {
    throw new Error(`Unsupported visitorKey "${visitorKey}". Expected classscout-* or compare.`);
  }
  return ensureDestinationInstance(companyId, destinationKey);
}

export async function getVisitorBlueprint(companyId: string, visitorKey: string, destinationKeyHint?: unknown): Promise<VisitorBlueprint | null> {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) return null;
  const instance = await getActiveDestinationInstance(companyId, destinationKey);
  if (!instance) return null;
  const store = readVisitorStore(instance.config as Prisma.JsonValue);
  return store.blueprints?.[normalizeVisitorKey(visitorKey)] ?? getDefaultVisitorBlueprint(visitorKey);
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
  return store.taxonomies?.[normalizeVisitorKey(visitorKey)] ?? getDefaultVisitorTaxonomy(visitorKey);
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
