const SCORE_MIN = 1;
const SCORE_MAX = 10;
const KNOWLEDGE_ICE_DIVISOR = 10;
const HIGH_URGENCY_KEYWORDS = [
  "urgent",
  "immediately",
  "today",
  "this week",
  "deadline",
  "launch",
  "incident",
  "blocker",
  "renewal",
  "customer",
  "competitor",
  "pricing",
  "churn",
  "pipeline",
  "revenue",
];
const COMPLEXITY_KEYWORDS = [
  "audit",
  "analyze",
  "compare",
  "document",
  "coordinate",
  "migrate",
  "review",
  "research",
  "interview",
  "validate",
  "prototype",
  "experiment",
];
const PRIORITY_SCORE_MAX = 1000;
const PRIORITY_WEIGHTS = Object.freeze({
  ice: 0.36,
  quality: 0.20,
  urgency: 0.16,
  freshness: 0.12,
  human: 0.10,
  risk: 0.06,
});
const PRIORITY_STATE_MULTIPLIERS = Object.freeze({
  EVALUATED: 1,
  REFINED: 0.86,
  GENERATED: 0.72,
});

function clampMetric(value, min = SCORE_MIN, max = SCORE_MAX) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }

  const canonical =
    numeric > SCORE_MAX
      ? numeric <= 100
        ? numeric / 10
        : SCORE_MAX
      : numeric;

  return Math.max(min, Math.min(max, Math.round(canonical)));
}

function normalizeScoreTriplet(input = {}, aliases = {}) {
  return {
    impact: clampMetric(input.impact ?? aliases.impact),
    confidence: clampMetric(
      input.confidence ??
      input.confidenceScore ??
      aliases.confidence ??
      aliases.confidenceScore,
    ),
    effort: clampMetric(
      input.effort ??
      input.weight ??
      input.ease ??
      aliases.effort ??
      aliases.weight ??
      aliases.ease,
    ),
  };
}

function calculateTaskIceScore(input = {}) {
  const { impact, confidence, effort } = normalizeScoreTriplet(input);
  return impact * confidence * effort;
}

function calculateKnowledgeIceScore(input = {}) {
  const { impact, confidence, effort } = normalizeScoreTriplet(input);
  return Number(((impact * confidence * effort) / KNOWLEDGE_ICE_DIVISOR).toFixed(1));
}

function clampUnit(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, fallback));
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeIceSignal(iceScore, maxScore = PRIORITY_SCORE_MAX) {
  const numeric = Number(iceScore);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return clampUnit(numeric / maxScore);
}

function computeImpliedFreshnessSignal(input = {}) {
  if (input.freshnessScore !== null && input.freshnessScore !== undefined) {
    return clampUnit(input.freshnessScore);
  }

  const rawDate = input.updatedAt ?? input.createdAt;
  const timestamp = rawDate ? new Date(rawDate).getTime() : Date.now();
  if (!Number.isFinite(timestamp)) return 0.5;

  const windowDays = Number.isFinite(Number(input.freshnessWindowDays))
    ? Math.max(1, Number(input.freshnessWindowDays))
    : 30;
  const ageMs = Math.max(0, Date.now() - timestamp);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return Math.max(0.1, clampUnit(1 - ageMs / windowMs));
}

function computeHumanPrioritySignal(input = {}) {
  const feedbackScore = Number(input.feedbackScore ?? 0);
  const feedbackSignal = feedbackScore > 0
    ? Math.min(1, 0.55 + feedbackScore * 0.08)
    : feedbackScore < 0
      ? Math.max(0, 0.45 + feedbackScore * 0.08)
      : 0.5;
  const manualAnchorSignal = Number(input.sortOrder ?? 0) < 0 ? 1 : 0;
  const humanGuidedSignal = String(input.controlMode || "").toUpperCase() === "HUMAN_GUIDED" ? 0.85 : 0;
  return clampUnit(Math.max(feedbackSignal, manualAnchorSignal, humanGuidedSignal));
}

function computeRiskPrioritySignal(input = {}) {
  const confidence = clampMetric(input.confidenceScore ?? input.confidence ?? 5);
  const activityState = String(input.activityState || "").toUpperCase();
  const processingStatus = String(input.processingStatus || "").toUpperCase();
  const rottenAt = input.rottenAt ? new Date(input.rottenAt).getTime() : null;
  let risk = 0.25;

  if (activityState === "STALE" || activityState === "EXPIRED") risk += 0.2;
  if (processingStatus === "REVIEW" || processingStatus === "DECLINED") risk += 0.18;
  if (Number.isFinite(rottenAt) && rottenAt < Date.now()) risk += 0.2;
  if (confidence <= 4) risk += 0.16;
  if (confidence >= 8) risk -= 0.08;

  return clampUnit(risk);
}

function describePriorityBand(value, high, medium, label) {
  if (value >= high) return `${label}:high`;
  if (value >= medium) return `${label}:medium`;
  return `${label}:low`;
}

function computeBlendedPriorityProfile(input = {}) {
  const iceSignal = normalizeIceSignal(input.iceScore, input.priorityIceMax ?? PRIORITY_SCORE_MAX);
  const qualitySignal = clampUnit(input.qualityScore, iceSignal);
  const urgencySignal = clampUnit(
    input.urgencyScore,
    clampMetric(input.impact ?? 5) / SCORE_MAX,
  );
  const freshnessSignal = computeImpliedFreshnessSignal(input);
  const humanSignal = computeHumanPrioritySignal(input);
  const riskSignal = computeRiskPrioritySignal(input);
  const stateMultiplier =
    PRIORITY_STATE_MULTIPLIERS[String(input.candidateState || "").toUpperCase()] ?? 0.78;
  const rawMemoryMultiplier = Number(input.memoryMultiplier ?? input._memoryMultiplier ?? 1);
  const boundedMemoryMultiplier = Number.isFinite(rawMemoryMultiplier)
    ? Math.max(0.6, Math.min(1.4, rawMemoryMultiplier))
    : 1;
  const weighted =
    iceSignal * PRIORITY_WEIGHTS.ice +
    qualitySignal * PRIORITY_WEIGHTS.quality +
    urgencySignal * PRIORITY_WEIGHTS.urgency +
    freshnessSignal * PRIORITY_WEIGHTS.freshness +
    humanSignal * PRIORITY_WEIGHTS.human +
    riskSignal * PRIORITY_WEIGHTS.risk;
  const score = Number((weighted * stateMultiplier * boundedMemoryMultiplier * PRIORITY_SCORE_MAX).toFixed(2));
  const manualAnchor = Number(input.sortOrder ?? 0) < 0;

  return {
    score,
    manualAnchor,
    stateMultiplier,
    memoryMultiplier: boundedMemoryMultiplier,
    components: {
      ice: Number(iceSignal.toFixed(3)),
      quality: Number(qualitySignal.toFixed(3)),
      urgency: Number(urgencySignal.toFixed(3)),
      freshness: Number(freshnessSignal.toFixed(3)),
      human: Number(humanSignal.toFixed(3)),
      risk: Number(riskSignal.toFixed(3)),
    },
    weights: PRIORITY_WEIGHTS,
    reasons: [
      describePriorityBand(iceSignal, 0.7, 0.35, "ice"),
      describePriorityBand(qualitySignal, 0.75, 0.45, "quality"),
      describePriorityBand(urgencySignal, 0.75, 0.45, "urgency"),
      describePriorityBand(freshnessSignal, 0.75, 0.35, "freshness"),
      describePriorityBand(humanSignal, 0.8, 0.55, "human-signal"),
      describePriorityBand(riskSignal, 0.65, 0.35, "risk"),
      manualAnchor ? "manual-anchor:preserved" : "manual-anchor:none",
      `state:${String(input.candidateState || "UNKNOWN").toLowerCase()}`,
    ],
  };
}

function normalizeTaskScores(input = {}) {
  const triplet = normalizeScoreTriplet(input);

  return {
    impact: triplet.impact,
    confidence: triplet.confidence,
    confidenceScore: triplet.confidence,
    ease: triplet.effort,
    iceScore: calculateTaskIceScore(triplet),
  };
}

function normalizeKnowledgeScores(input = {}) {
  const triplet = normalizeScoreTriplet(input);

  return {
    impact: triplet.impact,
    confidence: triplet.confidence,
    confidenceScore: triplet.confidence,
    weight: triplet.effort,
    iceScore: calculateKnowledgeIceScore(triplet),
  };
}

function normalizeGoalScores(input = {}) {
  return normalizeKnowledgeScores(input);
}

function countKeywordHits(text, keywords) {
  const normalized = String(text || "").toLowerCase();
  return keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0);
}

function deriveSpecificitySignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  if (!text) return 1;

  const hasNumber = /\d/.test(text);
  const hasTimeframe = /\b(today|tomorrow|week|month|quarter|q[1-4]|deadline|by\s+\w+)/i.test(text);
  const hasConcreteVerb = /\b(review|audit|contact|launch|update|fix|measure|compare|ship|draft|publish|test|validate)\b/i.test(text);
  let score = 3;
  if (text.length >= 80) score += 2;
  if (text.length >= 160) score += 1;
  if (hasNumber) score += 1;
  if (hasTimeframe) score += 1;
  if (hasConcreteVerb) score += 2;
  return clampMetric(score);
}

function deriveUrgencySignal(kind = "", title = "", description = "") {
  const keywordHits = countKeywordHits(`${title} ${description}`, HIGH_URGENCY_KEYWORDS);
  const kindBoost = ["TASK", "RECOMMENDATION", "FORECAST", "NEWS"].includes(String(kind || "").toUpperCase()) ? 2 : 0;
  return clampMetric(3 + keywordHits + kindBoost);
}

function deriveComplexitySignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  const conjunctionHits = (text.match(/\b(and|then|after|before|with)\b/gi) || []).length;
  const punctuationHits = (text.match(/[;,:]/g) || []).length;
  const keywordHits = countKeywordHits(text, COMPLEXITY_KEYWORDS);
  let score = 2;
  if (text.length >= 100) score += 2;
  if (text.length >= 220) score += 1;
  score += Math.min(2, conjunctionHits);
  score += Math.min(2, punctuationHits);
  score += Math.min(3, keywordHits);
  return clampMetric(score);
}

function deriveEvidenceStrengthSignal(input = {}) {
  const evidence =
    input.evidence && typeof input.evidence === "object"
      ? input.evidence
      : null;
  const hashtags = Array.isArray(input.hashtags) ? input.hashtags : [];
  const title = String(input.title || "");
  const body = String(input.body || input.description || "");
  const urls = Array.isArray(evidence?.urls) ? evidence.urls : [];
  const supportingSourceIds = Array.isArray(evidence?.supportingSourceIds) ? evidence.supportingSourceIds : [];
  const jsonEvidenceLength = evidence ? JSON.stringify(evidence).length : 0;

  let score = 3;
  if (body.length >= 120) score += 2;
  if (body.length >= 260) score += 1;
  if (title.length >= 24) score += 1;
  score += Math.min(2, hashtags.length);
  score += Math.min(2, urls.length);
  score += Math.min(2, supportingSourceIds.length);
  if (jsonEvidenceLength >= 300) score += 1;
  if (jsonEvidenceLength >= 900) score += 1;
  return clampMetric(score);
}

function deriveKnowledgeKindSignal(kind = "") {
  switch (String(kind || "").toUpperCase()) {
    case "PRICE":
    case "RECOMMENDATION":
    case "FORECAST":
      return 9;
    case "CONCLUSION":
    case "EVALUATION":
    case "JUDGMENT":
    case "COMPARISON":
      return 8;
    case "NEWS":
    case "RESEARCH":
      return 7;
    case "EXPLANATION":
    case "SUMMARY":
      return 6;
    case "GOSSIP":
      return 4;
    default:
      return 6;
  }
}

function groundKnowledgeScores(input = {}) {
  const base = normalizeScoreTriplet(input);
  const specificity = deriveSpecificitySignal(input.title, input.body ?? input.description);
  const evidenceStrength = deriveEvidenceStrengthSignal(input);
  const complexity = deriveComplexitySignal(input.title, input.body ?? input.description);
  const kindSignal = deriveKnowledgeKindSignal(input.kind);
  const sourceImpact = clampMetric(input.sourceImpact ?? base.impact);
  const sourceConfidence = clampMetric(input.sourceConfidence ?? base.confidence);
  const sourceWeight = clampMetric(input.sourceWeight ?? base.effort);
  const topicImpact = input.topicImpact != null ? clampMetric(input.topicImpact) : null;
  const topicConfidence = input.topicConfidence != null ? clampMetric(input.topicConfidence) : null;
  const topicWeight = input.topicWeight != null ? clampMetric(input.topicWeight) : null;

  return {
    impact: clampMetric(
      (
        base.impact * 2 +
        sourceImpact * 2 +
        (topicImpact ?? kindSignal) +
        kindSignal +
        evidenceStrength
      ) / 7,
    ),
    confidence: clampMetric(
      (
        base.confidence * 2 +
        sourceConfidence * 2 +
        (topicConfidence ?? evidenceStrength) +
        evidenceStrength +
        specificity
      ) / 7,
    ),
    effort: clampMetric(
      (
        base.effort * 2 +
        sourceWeight * 2 +
        (topicWeight ?? complexity) +
        complexity +
        evidenceStrength
      ) / 7,
    ),
  };
}

function groundTaskScores(input = {}) {
  const base = normalizeScoreTriplet(input);
  const sourceImpact = clampMetric(input.sourceImpact ?? input.flashcardImpact ?? base.impact);
  const sourceConfidence = clampMetric(input.sourceConfidence ?? input.flashcardConfidence ?? base.confidence);
  const sourceWeight = clampMetric(input.sourceWeight ?? input.flashcardWeight ?? base.effort);
  const sourceIceScore = Number.isFinite(Number(input.sourceIceScore)) ? Number(input.sourceIceScore) : null;
  const sourceIceSignal = sourceIceScore == null ? null : clampMetric(sourceIceScore / KNOWLEDGE_ICE_DIVISOR);
  const specificity = deriveSpecificitySignal(input.title, input.description);
  const urgency = deriveUrgencySignal(input.kind, input.title, input.description);
  const complexity = deriveComplexitySignal(input.title, input.description);

  return {
    impact: clampMetric((base.impact * 3 + sourceImpact * 2 + urgency + (sourceIceSignal ?? urgency)) / 7),
    confidence: clampMetric((base.confidence * 2 + sourceConfidence * 2 + specificity + (sourceIceSignal ?? specificity)) / 6),
    effort: clampMetric((base.effort * 2 + sourceWeight + complexity * 2 + (sourceIceSignal ?? complexity)) / 6),
  };
}

function enrichTaskDraftScores(input = {}) {
  return groundTaskScores(input);
}

module.exports = {
  SCORE_MIN,
  SCORE_MAX,
  KNOWLEDGE_ICE_DIVISOR,
  PRIORITY_SCORE_MAX,
  PRIORITY_WEIGHTS,
  PRIORITY_STATE_MULTIPLIERS,
  clampMetric,
  clampUnit,
  normalizeScoreTriplet,
  calculateTaskIceScore,
  calculateKnowledgeIceScore,
  normalizeIceSignal,
  computeImpliedFreshnessSignal,
  computeHumanPrioritySignal,
  computeRiskPrioritySignal,
  computeBlendedPriorityProfile,
  normalizeTaskScores,
  normalizeKnowledgeScores,
  normalizeGoalScores,
  deriveSpecificitySignal,
  deriveUrgencySignal,
  deriveComplexitySignal,
  deriveEvidenceStrengthSignal,
  deriveKnowledgeKindSignal,
  groundKnowledgeScores,
  groundTaskScores,
  enrichTaskDraftScores,
};
