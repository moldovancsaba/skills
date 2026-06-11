import "server-only";

import type { VisitorTaxonomy } from "@/lib/visitor-blueprints";

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

export type VisitorQualityGateInput = {
  taxonomy: VisitorTaxonomy | null;
  destinationKey?: string;
  contentType: string;
  sourceUrl?: string;
  extractedFacts?: unknown;
  metadata?: unknown;
};

export type VisitorQualityGateResult = {
  pass: boolean;
  requiresReview: boolean;
  blockingReasons: string[];
  reviewReasons: string[];
  missingEvidenceFields: string[];
};

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function readPath(record: Record<string, unknown>, path: string): unknown {
  const direct = record[path];
  if (hasValue(direct)) return direct;
  if (!path.includes(".")) return direct;
  let cursor: unknown = record;
  for (const part of path.split(".")) {
    const next = asRecord(cursor);
    if (!next) return undefined;
    cursor = next[part];
  }
  return cursor;
}

function readEvidenceField(field: string, facts: Record<string, unknown>, metadata: Record<string, unknown>) {
  const publicPayload = asRecord(metadata.publicDraftPayload) ?? asRecord(facts.publicDraftPayload) ?? {};
  const fieldAliases: Record<string, string[]> = {
    name: ["name", "title", "provider"],
    category: ["category", "primaryCategory", "contentType"],
    borough: ["borough", "location.borough"],
    neighborhood: ["neighborhood", "location.neighborhood"],
    ageRanges: ["ageRanges", "ages", "ageRange"],
    programType: ["programType", "contentType", "activityType"],
    shortDescription: ["shortDescription", "description", "summary"],
    website: ["website", "url", "sourceUrl"],
    image: ["image", "coverImageUrl", "imageUrl"],
    sourceUrl: ["sourceUrl", "url", "website"],
  };
  const candidates = fieldAliases[field] ?? [field];
  for (const candidate of candidates) {
    const value = readPath(facts, candidate) ?? readPath(metadata, candidate) ?? readPath(publicPayload, candidate);
    if (hasValue(value)) return value;
  }
  return undefined;
}

function isClassScoutLaunchGate(input: { destinationKey?: string; taxonomy: VisitorTaxonomy }) {
  const destinationKey = asString(input.destinationKey).toLowerCase();
  const visitorKey = asString(input.taxonomy.visitorKey).toLowerCase();
  const version = asString(input.taxonomy.version).toLowerCase();
  return destinationKey === "classscout" || visitorKey.includes("classscout") || version.includes("classscout-manhattan-launch");
}

const PUBLIC_COPY_LEAK_PATTERNS = [
  /^listing\s+for\b/i,
  /^verified\s+listing\s+for\b/i,
  /\boffers\s+activities\b/i,
  /\bpublished\s+listing\b/i,
  /\bsource[-\s]?backed\b/i,
  /\bcheck\s+local\b/i,
  /\bpublic\s+catalog\b/i,
  /\bshould\s+(?:refresh|update|be\s+refreshed)\b/i,
  /\bbefore\s+(?:showing|publishing)\b/i,
  /\bnot\s+yet\s+extracted\b/i,
  /\bnot\s+stable\b/i,
  /\bplaceholder\b/i,
  /\bsample\s+listing\b/i,
  /\btest\s+listing\b/i,
  /\bdummy\b/i,
  /\btbd\b/i,
];

function isImgBbHttpsImageUrl(value: unknown) {
  const url = asString(value);
  if (!url || !/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "i.ibb.co" || host === "ibb.co" || host === "image.ibb.co" || host.endsWith(".ibb.co");
  } catch {
    return false;
  }
}

function collectPublicPayloadIssues(input: { destinationKey?: string; metadata: Record<string, unknown>; facts: Record<string, unknown> }) {
  const payload = asRecord(input.metadata.publicDraftPayload) ?? asRecord(input.facts.publicDraftPayload);
  if (!payload) return [] as string[];

  const issues: string[] = [];
  const destinationKey = asString(input.destinationKey || input.metadata.destinationKey || input.metadata.miniappKey).toLowerCase();
  const catalogProject = asString(payload.catalogProject).toLowerCase();
  if (catalogProject && destinationKey && catalogProject !== destinationKey) {
    issues.push("public_scope_mismatch");
  }

  const image = asString(payload.image) || asString(payload.coverImageUrl);
  if (!isImgBbHttpsImageUrl(image)) {
    issues.push("missing_uploaded_public_image");
  }

  const descriptionValues = [
    payload.shortDescription,
    payload.longDescription,
    payload.description,
    asRecord(payload.localized)?.en && asRecord(asRecord(payload.localized)?.en)?.shortDescription,
    asRecord(payload.localized)?.en && asRecord(asRecord(payload.localized)?.en)?.longDescription,
  ]
    .map(asString)
    .filter(Boolean);

  if (descriptionValues.length === 0 || descriptionValues.every((value) => value.length < 50)) {
    issues.push("missing_public_content_summary");
  }
  if (descriptionValues.some((value) => PUBLIC_COPY_LEAK_PATTERNS.some((pattern) => pattern.test(value)))) {
    issues.push("backend_or_placeholder_copy_leak");
  }

  return [...new Set(issues)];
}

export function evaluateVisitorQualityGate(input: VisitorQualityGateInput): VisitorQualityGateResult {
  const taxonomy = input.taxonomy;
  const facts = asRecord(input.extractedFacts) ?? {};
  const metadata = asRecord(input.metadata) ?? {};
  const contentType = asString(input.contentType).toLowerCase();
  const sourceUrl = asString(input.sourceUrl).toLowerCase();
  const blockingReasons: string[] = [];
  const reviewReasons: string[] = [];

  if (!taxonomy) {
    return {
      pass: false,
      requiresReview: true,
      blockingReasons: ["taxonomy_missing"],
      reviewReasons: [],
      missingEvidenceFields: [],
    };
  }

  const contentDef = taxonomy.contentTypes.find((item) => item.contentType.toLowerCase() === contentType);
  if (!contentDef) {
    blockingReasons.push("content_type_not_in_taxonomy");
  } else {
    if (contentDef.primitive === "source-only" || !contentDef.publicEligible) {
      blockingReasons.push("source_only_not_public_listing");
    }
  }

  const searchable = [
    sourceUrl,
    asString(metadata.title),
    asString(metadata.name),
    asString(metadata.description),
    ...asStringArray(metadata.tags),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const forbiddenMatched = taxonomy.forbiddenMappings.find((rule) => searchable.includes(rule.sourceTerm.toLowerCase()));
  if (forbiddenMatched) {
    blockingReasons.push("forbidden_mapping");
  }

  const requiredEvidence = taxonomy.requiredEvidenceByType?.[contentType] ?? [];
  const missingEvidenceFields = requiredEvidence
    .filter((field) => field.required)
    .filter((field) => !hasValue(readEvidenceField(field.field, facts, metadata)))
    .map((field) => field.field);

  if (missingEvidenceFields.length > 0) {
    reviewReasons.push("missing_required_evidence");
    if (isClassScoutLaunchGate({ destinationKey: input.destinationKey, taxonomy })) {
      blockingReasons.push("missing_launch_profile_evidence");
    }
  }

  blockingReasons.push(...collectPublicPayloadIssues({
    destinationKey: input.destinationKey,
    metadata,
    facts,
  }));

  return {
    pass: blockingReasons.length === 0 && missingEvidenceFields.length === 0,
    requiresReview: missingEvidenceFields.length > 0,
    blockingReasons: [...new Set(blockingReasons)],
    reviewReasons: [...new Set(reviewReasons)],
    missingEvidenceFields: [...new Set(missingEvidenceFields)],
  };
}
