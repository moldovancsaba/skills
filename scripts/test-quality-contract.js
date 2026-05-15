const assert = require("node:assert/strict");

const {
  buildScoreProfile,
  buildQualityEnvelope,
  scoreProfileQuality,
  persistTaskScoresFromProfile,
  persistKnowledgeScoresFromProfile,
} = require("../src/lib/scoring-contract");

async function main() {
  const strongTaskProfile = buildScoreProfile({
    scoreKind: "TASK",
    title: "Launch customer renewal risk review with top 10 accounts",
    description: "Review renewal risks with Sales and Customer Success, identify blockers, and assign owners before quarter close.",
    kind: "TASK",
    agent: { impact: 8, confidence: 8, effort: 7 },
    calibrated: { impact: 8, confidence: 7, effort: 7 },
    rationale: {
      historyConfidence: 8,
      historyImpact: 8,
      historySupport: 8,
    },
    evidence: {
      urls: ["https://example.com"],
      supportingSourceIds: ["src-1", "src-2"],
    },
    hashtags: ["#revenue", "#renewal"],
    feedbackScore: 3,
  });

  assert.equal(typeof strongTaskProfile.quality, "object", "score profile must carry quality envelope");
  assert.equal(typeof strongTaskProfile.quality.dimensions.evidenceQuality, "number", "quality envelope must expose evidence dimension");
  assert.equal(typeof strongTaskProfile.quality.dimensions.linguisticQuality, "number", "quality envelope must expose linguistic dimension");
  assert.equal(typeof strongTaskProfile.quality.dimensions.actionabilityQuality, "number", "quality envelope must expose actionability dimension");
  assert.equal(typeof strongTaskProfile.quality.dimensions.strategicValue, "number", "quality envelope must expose strategic dimension");

  const weakEnvelope = buildQualityEnvelope({
    title: "idea",
    description: "maybe do something",
    kind: "SUMMARY",
    impact: 3,
    confidenceScore: 2,
    hashtags: [],
    evidence: null,
  });
  const strongEnvelope = buildQualityEnvelope({
    title: "Benchmark competitor pricing for renewal-sensitive enterprise accounts",
    description: "Compare current enterprise pricing, quantify revenue exposure, document the deltas, and recommend a decision before renewal reviews start next week.",
    kind: "TASK",
    impact: 8,
    confidenceScore: 8,
    hashtags: ["#pricing", "#revenue"],
    evidence: {
      urls: ["https://example.com/a"],
      supportingSourceIds: ["a", "b", "c"],
    },
  });

  assert.equal(strongEnvelope.aggregate > weakEnvelope.aggregate, true, "stronger cards must receive higher aggregate quality");
  assert.equal(strongEnvelope.dimensions.evidenceQuality > weakEnvelope.dimensions.evidenceQuality, true, "evidence dimension must separate weak vs strong evidence");
  assert.equal(strongEnvelope.dimensions.actionabilityQuality > weakEnvelope.dimensions.actionabilityQuality, true, "actionability dimension must separate vague vs specific work");

  const persistedTask = persistTaskScoresFromProfile(strongTaskProfile);
  assert.equal(typeof persistedTask.qualityScore, "number", "task persistence must expose qualityScore");
  assert.equal(typeof persistedTask.scoreProfile.quality.aggregate, "number", "task persistence must preserve quality envelope");

  const persistedKnowledge = persistKnowledgeScoresFromProfile(buildScoreProfile({
    scoreKind: "KNOWLEDGE",
    title: "Competitor launched a new annual pricing bundle",
    body: "The competitor now bundles onboarding and support into a discounted annual plan.",
    kind: "NEWS",
    agent: { impact: 7, confidence: 7, effort: 5 },
    calibrated: { impact: 7, confidence: 6, effort: 5 },
    evidence: {
      urls: ["https://example.com/news"],
      supportingSourceIds: ["src-99"],
    },
  }));
  assert.equal("qualityScore" in persistedKnowledge, false, "knowledge persistence must keep quality inside scoreProfile only");
  assert.equal(typeof persistedKnowledge.scoreProfile.quality.aggregate, "number", "knowledge persistence must preserve quality envelope");

  const rehydratedQuality = scoreProfileQuality(strongTaskProfile, {});
  assert.equal(rehydratedQuality.aggregate, strongTaskProfile.quality.aggregate, "scoreProfileQuality must rehydrate persisted quality aggregate");

  console.log("Quality contract tests passed.");
}

main().catch((error) => {
  console.error("[test-quality-contract] failed:", error);
  process.exit(1);
});
