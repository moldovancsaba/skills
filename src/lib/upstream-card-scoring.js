const {
  clampMetric,
  calculateKnowledgeIceScore,
  deriveComplexitySignal,
  deriveSpecificitySignal,
  groundKnowledgeScores,
} = require("./scoring-contract");

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deriveDataCardScoreProfile(source = {}) {
  const content = normalizeText(source.content || source.description || source.name);
  const hashtags = normalizeList(source.hashtags);
  const aiClusters = normalizeList(source.aiClusters);
  const metadata = source.metadata && typeof source.metadata === "object" ? source.metadata : null;
  const urls = Array.isArray(metadata?.urls) ? metadata.urls : [];
  const specificity = deriveSpecificitySignal(source.entityTag || source.sourceName || "data", content);
  const complexity = deriveComplexitySignal(source.entityTag || source.sourceName || "data", content);
  const metadataRichness = metadata ? Math.min(3, Object.keys(metadata).length) : 0;
  const competitorBoost = String(source.intelligenceType || "").toUpperCase() === "COMPETITOR" ? 1 : 0;

  const baseImpact = clampMetric(
    3 +
      Math.min(2, Math.floor(content.length / 180)) +
      Math.min(2, Math.floor(hashtags.length / 2)) +
      competitorBoost +
      Math.min(1, urls.length),
  );
  const baseConfidence = clampMetric(
    3 +
      Math.min(2, Math.floor(content.length / 220)) +
      Math.min(2, aiClusters.length) +
      metadataRichness +
      Math.min(1, urls.length > 0 ? 1 : 0),
  );
  const baseWeight = clampMetric(
    average([
      specificity,
      complexity,
      3 + Math.min(3, Math.floor(hashtags.length / 2)) + metadataRichness,
    ]),
  );
  const grounded = groundKnowledgeScores({
    impact: baseImpact,
    confidence: baseConfidence,
    weight: baseWeight,
    kind: competitorBoost ? "COMPARISON" : "SUMMARY",
    title: source.entityTag || source.sourceName || source.name || "datacard",
    body: content,
    evidence: metadata,
    hashtags,
  });
  const impact = grounded.impact;
  const confidence = grounded.confidence;
  const weight = grounded.effort;

  return {
    impact,
    confidence,
    weight,
    iceScore: calculateKnowledgeIceScore({ impact, confidence, weight }),
  };
}

function deriveTopicCardScoreProfile(topic = {}) {
  const label = normalizeText(topic.label);
  const notes = normalizeText(topic.notes);
  const hashtags = normalizeList(topic.hashtags);
  const specificity = deriveSpecificitySignal(label, notes);
  const complexity = deriveComplexitySignal(label, notes);
  const priorityBand = Math.max(0, 4 - Number(topic.sortOrder || 0));
  const activeBoost = topic.active === false ? 0 : 2;

  const baseImpact = clampMetric(
    3 + activeBoost + Math.min(3, priorityBand) + Math.min(1, Math.floor(hashtags.length / 2)),
  );
  const baseConfidence = clampMetric(
    3 + Math.min(2, Math.floor(label.length / 12)) + Math.min(2, Math.floor(notes.length / 120)) + Math.min(1, hashtags.length),
  );
  const baseWeight = clampMetric(
    average([
      specificity,
      complexity,
      4 + activeBoost + Math.min(2, priorityBand),
    ]),
  );
  const grounded = groundKnowledgeScores({
    impact: baseImpact,
    confidence: baseConfidence,
    weight: baseWeight,
    kind: "RESEARCH",
    title: label,
    body: notes,
    hashtags,
    evidence: { sortOrder: topic.sortOrder, active: topic.active },
  });
  const impact = grounded.impact;
  const confidence = grounded.confidence;
  const weight = grounded.effort;

  return {
    impact,
    confidence,
    weight,
    iceScore: calculateKnowledgeIceScore({ impact, confidence, weight }),
  };
}

function computeTopicRelevanceForSource(source = {}, topic = {}) {
  if (topic.active === false) return 0;

  const sourceTokens = new Set([
    ...tokenize(source.content),
    ...tokenize(source.entityTag),
    ...normalizeList(source.hashtags).map((tag) => tag.toLowerCase()),
    ...normalizeList(source.aiClusters).map((tag) => tag.toLowerCase()),
  ]);
  const topicTokens = new Set([
    ...tokenize(topic.label),
    ...tokenize(topic.notes),
    ...normalizeList(topic.hashtags).map((tag) => tag.toLowerCase()),
  ]);

  if (topicTokens.size === 0 || sourceTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of topicTokens) {
    if (sourceTokens.has(token)) overlap += 1;
  }

  return Math.min(1, overlap / Math.max(2, Math.min(6, topicTokens.size)));
}

function deriveFlashcardSourceSupport(source = {}, topics = []) {
  const sourceProfile = deriveDataCardScoreProfile(source);
  const matched = topics
    .map((topic) => ({
      topic,
      profile: deriveTopicCardScoreProfile(topic),
      relevance: computeTopicRelevanceForSource(source, topic),
    }))
    .filter((entry) => entry.relevance > 0);

  if (matched.length === 0) {
    return {
      sourceProfile,
      topicProfile: null,
      supportSignals: {
        sourceImpact: sourceProfile.impact,
        sourceConfidence: sourceProfile.confidence,
        sourceWeight: sourceProfile.weight,
      },
    };
  }

  const weightedTotal = matched.reduce((sum, entry) => sum + entry.relevance, 0);
  const weighted = (field) =>
    weightedTotal > 0
      ? matched.reduce((sum, entry) => sum + entry.profile[field] * entry.relevance, 0) / weightedTotal
      : 0;

  const topicProfile = {
    impact: clampMetric(weighted("impact")),
    confidence: clampMetric(weighted("confidence")),
    weight: clampMetric(weighted("weight")),
  };

  return {
    sourceProfile,
    topicProfile: {
      ...topicProfile,
      iceScore: calculateKnowledgeIceScore(topicProfile),
    },
    matchedTopics: matched.map((entry) => ({
      id: entry.topic.id,
      label: entry.topic.label,
      relevance: Number(entry.relevance.toFixed(3)),
      iceScore: entry.profile.iceScore,
    })),
    supportSignals: {
      sourceImpact: sourceProfile.impact,
      sourceConfidence: sourceProfile.confidence,
      sourceWeight: sourceProfile.weight,
      topicImpact: topicProfile.impact,
      topicConfidence: topicProfile.confidence,
      topicWeight: topicProfile.weight,
    },
  };
}

module.exports = {
  deriveDataCardScoreProfile,
  deriveTopicCardScoreProfile,
  computeTopicRelevanceForSource,
  deriveFlashcardSourceSupport,
};
