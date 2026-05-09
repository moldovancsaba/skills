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
  clampMetric,
  normalizeScoreTriplet,
  calculateTaskIceScore,
  calculateKnowledgeIceScore,
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
