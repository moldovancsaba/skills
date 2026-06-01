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

const INHERITED_CLASSSCOUT_TERMS = [
  "birthday party",
  "birthday parties",
  "storytime",
  "after-school",
  "after school",
  "museum family",
  "kids activities",
  "parent group",
];

const STATIC_OR_FAKE_CONTENT_TERMS = [
  "lorem ipsum",
  "coming soon",
  "placeholder",
  "template",
  "sample listing",
  "dummy",
  "test listing",
  "tbd",
];

export type VisitorProjectionGateResult = {
  blocked: boolean;
  blockedReasons: string[];
};

export function evaluateCompareProjectionGate(input: {
  metadata?: unknown;
  normalizedListing?: unknown;
}): VisitorProjectionGateResult {
  const metadata = asRecord(input.metadata);
  const listing = asRecord(input.normalizedListing);
  const blockedReasons: string[] = [];

  const contentType = asString(
    listing?.contentType ??
      listing?.type ??
      metadata?.contentType ??
      metadata?.proposedType ??
      metadata?.activityType,
  ).toLowerCase();

  if (contentType === "source-only" || contentType === "source_only") {
    blockedReasons.push("source_only_not_public_listing");
  }

  const sourceTrustTier = asString(
    listing?.sourceTrustTier ?? metadata?.sourceTrustTier ?? metadata?.trustTier,
  ).toLowerCase();
  if (sourceTrustTier === "weak" || sourceTrustTier === "blocked") {
    blockedReasons.push("weak_or_blocked_source");
  }

  const authorityGrade = asString(metadata?.authorityGrade ?? listing?.authorityGrade).toLowerCase();
  if (authorityGrade === "weak" || authorityGrade === "low" || authorityGrade === "blocked") {
    blockedReasons.push("weak_or_blocked_source");
  }

  const officialnessScoreCandidate = Number(
    listing?.officialnessScore ?? metadata?.officialnessScore ?? metadata?.officialness_score,
  );
  if (Number.isFinite(officialnessScoreCandidate) && officialnessScoreCandidate < 60) {
    blockedReasons.push("weak_or_blocked_source");
  }

  const searchable = [
    asString(listing?.name),
    asString(listing?.title),
    asString(listing?.description),
    asString(listing?.category),
    asString(metadata?.name),
    asString(metadata?.title),
    asString(metadata?.description),
    asString(metadata?.categoryHint),
    asString(metadata?.activityType),
    ...asStringArray(listing?.tags),
    ...asStringArray(metadata?.tags),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (INHERITED_CLASSSCOUT_TERMS.some((term) => searchable.includes(term))) {
    blockedReasons.push("inherited_classscout_label");
  }
  if (STATIC_OR_FAKE_CONTENT_TERMS.some((term) => searchable.includes(term))) {
    blockedReasons.push("fake_static_cms_content");
  }

  const manualPatched =
    metadata?.manualPatch === true ||
    metadata?.manualPatched === true ||
    metadata?.manuallyEdited === true ||
    listing?.manualPatch === true;
  if (manualPatched) {
    blockedReasons.push("manual_patch_not_workflow_output");
  }

  return {
    blocked: blockedReasons.length > 0,
    blockedReasons: [...new Set(blockedReasons)],
  };
}
