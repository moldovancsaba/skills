export type VisitorCardIdentity = {
  stableId: string;
  normalizedName: string;
  canonicalSourceUrl?: string;
  officialWebsite?: string;
  addressKey?: string;
};

export type VisitorCategoryAffinity = {
  category: string;
  confidence: number;
  evidence: string[];
  sourceUrls: string[];
  reason: string;
};

export type VisitorCardClassification = {
  primaryCategory: string;
  primaryCategoryReason: string;
  categoryAffinities: VisitorCategoryAffinity[];
  viewEligibility: string[];
  activityTypes: string[];
};

export type VisitorClassificationValidationIssue = {
  code: string;
  fieldPath: string;
  message: string;
};

export type VisitorClassificationValidationResult = {
  valid: boolean;
  issues: VisitorClassificationValidationIssue[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return [...new Set(value.map((entry) => asString(entry)).filter(Boolean))];
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function identityKey(value: string) {
  return asString(value).toLowerCase();
}

function normalizeUrl(value: unknown) {
  const raw = asString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function normalizeAffinity(input: unknown): VisitorCategoryAffinity {
  const record = asRecord(input);
  return {
    category: asString(record.category),
    confidence: clamp01(Number(record.confidence)),
    evidence: asStringArray(record.evidence),
    sourceUrls: asStringArray(record.sourceUrls).map(normalizeUrl).filter(Boolean),
    reason: asString(record.reason),
  };
}

function dedupeAffinities(affinities: VisitorCategoryAffinity[]) {
  const byCategory = new Map<string, VisitorCategoryAffinity>();
  for (const affinity of affinities) {
    if (!affinity.category) continue;
    const key = identityKey(affinity.category);
    const existing = byCategory.get(key);
    if (!existing || affinity.confidence > existing.confidence) {
      byCategory.set(key, {
        ...affinity,
        evidence: [...new Set([...(existing?.evidence ?? []), ...affinity.evidence])],
        sourceUrls: [...new Set([...(existing?.sourceUrls ?? []), ...affinity.sourceUrls])],
      });
      continue;
    }
    byCategory.set(key, {
      ...existing,
      evidence: [...new Set([...existing.evidence, ...affinity.evidence])],
      sourceUrls: [...new Set([...existing.sourceUrls, ...affinity.sourceUrls])],
    });
  }
  return [...byCategory.values()].sort((left, right) => right.confidence - left.confidence || left.category.localeCompare(right.category));
}

export function normalizeVisitorCardIdentity(input: unknown): VisitorCardIdentity {
  const record = asRecord(input);
  const normalizedName = asString(record.normalizedName || record.name).toLowerCase();
  const canonicalSourceUrl = normalizeUrl(record.canonicalSourceUrl || record.sourceUrl);
  const officialWebsite = normalizeUrl(record.officialWebsite || record.website);
  const addressKey = asString(record.addressKey || record.address).toLowerCase();
  const stableId = asString(record.stableId)
    || [officialWebsite || canonicalSourceUrl, normalizedName, addressKey].filter(Boolean).join("|");

  return {
    stableId,
    normalizedName,
    canonicalSourceUrl: canonicalSourceUrl || undefined,
    officialWebsite: officialWebsite || undefined,
    addressKey: addressKey || undefined,
  };
}

export function normalizeVisitorCardClassification(input: unknown): VisitorCardClassification {
  const record = asRecord(input);
  const primaryCategory = asString(record.primaryCategory || record.category);
  const rawAffinities = Array.isArray(record.categoryAffinities) ? record.categoryAffinities : [];
  return {
    primaryCategory,
    primaryCategoryReason: asString(record.primaryCategoryReason),
    categoryAffinities: dedupeAffinities(rawAffinities.map(normalizeAffinity)),
    viewEligibility: asStringArray(record.viewEligibility),
    activityTypes: asStringArray(record.activityTypes),
  };
}

export function validateVisitorCardIdentity(identity: VisitorCardIdentity): VisitorClassificationValidationResult {
  const issues: VisitorClassificationValidationIssue[] = [];
  if (!identity.stableId) {
    issues.push({
      code: "missing_stable_identity",
      fieldPath: "identity.stableId",
      message: "Visitor card identity requires a stable id.",
    });
  }
  if (!identity.normalizedName && !identity.canonicalSourceUrl && !identity.officialWebsite) {
    issues.push({
      code: "missing_identity_anchor",
      fieldPath: "identity",
      message: "Visitor card identity requires at least one name, source URL, or official website anchor.",
    });
  }
  return { valid: issues.length === 0, issues };
}

export function validateVisitorCardClassification(classification: VisitorCardClassification): VisitorClassificationValidationResult {
  const issues: VisitorClassificationValidationIssue[] = [];
  if (!classification.primaryCategory) {
    issues.push({
      code: "missing_primary_category",
      fieldPath: "primaryCategory",
      message: "Visitor card classification requires one primary category.",
    });
  }
  classification.categoryAffinities.forEach((affinity, index) => {
    if (!affinity.category) {
      issues.push({
        code: "missing_affinity_category",
        fieldPath: `categoryAffinities.${index}.category`,
        message: "Category affinity requires a category.",
      });
    }
    if (affinity.confidence < 0.65) {
      issues.push({
        code: "weak_affinity_confidence",
        fieldPath: `categoryAffinities.${index}.confidence`,
        message: "Automated category affinity requires confidence >= 0.65.",
      });
    }
    if (affinity.evidence.length === 0) {
      issues.push({
        code: "missing_affinity_evidence",
        fieldPath: `categoryAffinities.${index}.evidence`,
        message: "Category affinity requires source-backed evidence.",
      });
    }
  });
  return { valid: issues.length === 0, issues };
}

export function mergeVisitorCardClassification(
  existingRaw: unknown,
  nextRaw: unknown,
): VisitorCardClassification {
  const existing = normalizeVisitorCardClassification(existingRaw);
  const next = normalizeVisitorCardClassification(nextRaw);
  return {
    primaryCategory: next.primaryCategory || existing.primaryCategory,
    primaryCategoryReason: next.primaryCategoryReason || existing.primaryCategoryReason,
    categoryAffinities: dedupeAffinities([...existing.categoryAffinities, ...next.categoryAffinities]),
    viewEligibility: [...new Set([...existing.viewEligibility, ...next.viewEligibility])],
    activityTypes: [...new Set([...existing.activityTypes, ...next.activityTypes])],
  };
}
