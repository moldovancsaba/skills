import { clampMetric, calculateTaskIceScore, normalizeTaskScores } from "@/lib/scoring-contract";

export { clampMetric };

export function normalizeChecklistMetrics(input: {
  impact?: number | null;
  confidence?: number | null;
  ease?: number | null;
}) {
  const normalized = normalizeTaskScores({
    impact: input.impact,
    confidence: input.confidence,
    ease: input.ease,
  });

  return {
    impact: normalized.impact,
    confidence: normalized.confidence,
    ease: normalized.ease,
  };
}

export function calculateChecklistIceScore(input: {
  impact?: number | null;
  confidence?: number | null;
  ease?: number | null;
}) {
  return calculateTaskIceScore(input);
}
