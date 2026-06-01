import { evaluateCompareProjectionGate } from "@/lib/visitor-public-projection-gate";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

export type CompareQualitySignals = {
  evidenceScore: number;
  freshnessScore: number;
  regionConfidence: number;
  seasonConfidence: number;
  providerConfidence: number;
  eligibilityFlags: string[];
};

export function deriveCompareQualitySignals(metadata: unknown): CompareQualitySignals {
  const record = asRecord(metadata);
  const evidenceScore = clampPercent(asNumber(record?.evidenceScore ?? record?.evidence_score));
  const freshnessScore = clampPercent(asNumber(record?.freshnessScore ?? record?.freshness_score));
  const regionConfidence = clampPercent(
    asNumber(record?.regionConfidence ?? record?.region_confidence ?? (typeof record?.region === "string" ? 60 : 0)),
  );
  const seasonConfidence = clampPercent(
    asNumber(record?.seasonConfidence ?? record?.season_confidence ?? (typeof record?.season === "string" ? 60 : 0)),
  );
  const providerConfidence = clampPercent(
    asNumber(record?.providerConfidence ?? record?.provider_confidence ?? (typeof record?.provider === "string" ? 60 : 0)),
  );
  const eligibilityFlags = asStringArray(record?.eligibilityFlags ?? record?.eligibility_flags ?? record?.safetyFlags);

  return {
    evidenceScore,
    freshnessScore,
    regionConfidence,
    seasonConfidence,
    providerConfidence,
    eligibilityFlags,
  };
}

export function scoreCompareCandidate(signals: CompareQualitySignals) {
  const qualityScore =
    (0.30 * signals.evidenceScore) +
    (0.25 * signals.freshnessScore) +
    (0.20 * signals.regionConfidence) +
    (0.15 * signals.seasonConfidence) +
    (0.10 * signals.providerConfidence);

  return clampPercent(Number(qualityScore.toFixed(2)));
}

const REJECTION_FLAGS = new Set([
  "source_language_mismatch",
  "provider_conflict",
  "content_invalid",
]);

const REVIEW_FLAGS = new Set([
  "missing_region",
  "missing_season",
  "duplicate_provider_activity",
  "adapter_partial_success",
]);

export function evaluateCompareCandidate(input: {
  qualityScore: number;
  eligibilityFlags: string[];
  minimumQualityScore?: number;
  metadata?: unknown;
  normalizedListing?: unknown;
}) {
  const minimumQualityScore = Number.isFinite(Number(input.minimumQualityScore))
    ? Number(input.minimumQualityScore)
    : 55;
  const normalizedFlags = input.eligibilityFlags.map((flag) => String(flag || "").trim()).filter(Boolean);
  const rejectionReasons = normalizedFlags.filter((flag) => REJECTION_FLAGS.has(flag));
  const reviewReasons = normalizedFlags.filter((flag) => REVIEW_FLAGS.has(flag));
  const projectionGate = evaluateCompareProjectionGate({
    metadata: input.metadata,
    normalizedListing: input.normalizedListing,
  });
  const projectionReasons = projectionGate.blocked ? projectionGate.blockedReasons : [];

  if (rejectionReasons.length > 0 || projectionReasons.length > 0) {
    return {
      acceptable: false,
      requiresReview: true,
      reasons: [...rejectionReasons, ...projectionReasons],
    };
  }

  if (input.qualityScore < minimumQualityScore) {
    return {
      acceptable: false,
      requiresReview: false,
      reasons: ["quality_below_threshold"],
    };
  }

  return {
    acceptable: true,
    requiresReview: reviewReasons.length > 0,
    reasons: reviewReasons,
  };
}
