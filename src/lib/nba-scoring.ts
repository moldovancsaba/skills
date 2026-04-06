export function clampMetric(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeNBAMetrics(input: {
  impact?: number | null;
  confidence?: number | null;
  ease?: number | null;
}) {
  const impact = clampMetric(Number(input.impact) || 0, 0, 10);
  const confidence = clampMetric(Number(input.confidence) || 0, 0, 100);
  const ease = clampMetric(Number(input.ease) || 0, 0, 10);

  return {
    impact,
    confidence,
    ease,
  };
}

export function calculateICEScore(input: {
  impact?: number | null;
  confidence?: number | null;
  ease?: number | null;
}) {
  const { impact, confidence, ease } = normalizeNBAMetrics(input);
  return impact * (confidence / 10) * ease;
}
