export const MINIAPP_CONTENT_QUALITY_SCORE_MAX = 1000;
export const MINIAPP_DEFAULT_MINIMUM_CONTENT_QUALITY_SCORE = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function clampContentQualityScore(value: unknown) {
  return Math.max(0, Math.min(MINIAPP_CONTENT_QUALITY_SCORE_MAX, Math.round(asNumber(value))));
}

export function contentQualityScoreFromHundredScale(value: unknown) {
  return clampContentQualityScore(asNumber(value) * 10);
}

export function contentQualityScoreFromUnitScale(value: unknown) {
  return clampContentQualityScore(asNumber(value) * MINIAPP_CONTENT_QUALITY_SCORE_MAX);
}

export function contentQualityScoreFromOpportunity(input: {
  evidenceScore: unknown;
  sourceAuthorityScore: unknown;
  candidateScore: unknown;
}) {
  const evidenceScore = Math.max(0, Math.min(100, asNumber(input.evidenceScore)));
  const sourceAuthorityScore = Math.max(0, Math.min(100, asNumber(input.sourceAuthorityScore)));
  const candidateScore = Math.max(0, Math.min(100, asNumber(input.candidateScore)));
  return clampContentQualityScore(
    evidenceScore * 3 +
    sourceAuthorityScore * 2 +
    candidateScore * 5,
  );
}

export function readContentQualityScore(input: {
  metadata?: unknown;
  evidenceSummary?: unknown;
  fallbackCandidateScore?: unknown;
  fallbackQualityScore?: unknown;
}) {
  const metadata = asRecord(input.metadata) ?? {};
  const evidenceSummary = asRecord(input.evidenceSummary) ?? {};
  const opportunity = asRecord(metadata.miniappOpportunityCard);
  const qualityGate = asRecord(metadata.qualityGate);

  const explicitScore =
    metadata.contentQualityScore ??
    evidenceSummary.contentQualityScore ??
    qualityGate?.contentQualityScore ??
    opportunity?.contentQualityScore;
  if (Number.isFinite(Number(explicitScore))) {
    return clampContentQualityScore(explicitScore);
  }

  const candidateScore =
    input.fallbackCandidateScore ??
    metadata.candidateScore ??
    evidenceSummary.candidateScore ??
    qualityGate?.candidateScore ??
    opportunity?.candidateScore;
  if (Number.isFinite(Number(candidateScore))) {
    return contentQualityScoreFromHundredScale(candidateScore);
  }

  const qualityScore =
    input.fallbackQualityScore ??
    metadata.qualityScore ??
    evidenceSummary.qualityScore ??
    qualityGate?.qualityScore;
  if (Number.isFinite(Number(qualityScore))) {
    return contentQualityScoreFromUnitScale(qualityScore);
  }

  return 0;
}
