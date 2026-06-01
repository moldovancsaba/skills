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
    .filter((field) => !hasValue(facts[field.field]) && !hasValue(metadata[field.field]))
    .map((field) => field.field);

  if (missingEvidenceFields.length > 0) {
    reviewReasons.push("missing_required_evidence");
  }

  return {
    pass: blockingReasons.length === 0 && missingEvidenceFields.length === 0,
    requiresReview: missingEvidenceFields.length > 0,
    blockingReasons: [...new Set(blockingReasons)],
    reviewReasons: [...new Set(reviewReasons)],
    missingEvidenceFields: [...new Set(missingEvidenceFields)],
  };
}
