const assert = require("node:assert/strict");

const {
  decideResearchPolicy,
  listSourceUrls,
} = require("./lib/planner/research-policy");

async function main() {
  const freshVerifiedSource = {
    id: "src-fresh",
    content: "https://example.com/research\n\nA detailed and current market note with enough evidence to support generation.",
    provenance: "https://example.com/research",
    metadata: {
      url: "https://example.com/research",
      lastCheckedAt: new Date().toISOString(),
    },
    confidenceScore: 8,
    freshnessWindowDays: 30,
    processingStatus: "VERIFIED",
    updatedAt: new Date().toISOString(),
  };

  const staleWeakSource = {
    id: "src-stale",
    content: "https://example.com/old\n\nThin note.",
    provenance: "https://example.com/old",
    metadata: {
      url: "https://example.com/old",
      lastCheckedAt: "2025-01-01T00:00:00.000Z",
    },
    confidenceScore: 3,
    freshnessWindowDays: 7,
    processingStatus: "DRAFT",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };

  assert.deepEqual(
    listSourceUrls([freshVerifiedSource]),
    ["https://example.com/research"],
    "source URL extraction must dedupe and preserve canonical source URLs",
  );

  const datacardRefresh = decideResearchPolicy({
    operation: "DATACARD_REFRESH",
    sources: [freshVerifiedSource],
    entity: freshVerifiedSource,
  });
  assert.equal(datacardRefresh.shouldResearch, true, "datacard refresh must fetch when a URL exists");
  assert.equal(datacardRefresh.mode, "MANDATORY", "datacard refresh with a URL must be mandatory");

  const flashcardCreateStrong = decideResearchPolicy({
    operation: "FLASHCARD_CREATE",
    inventory: { flashcardCount: 14 },
    sources: [freshVerifiedSource],
    entity: { iceScore: 10 },
  });
  assert.equal(flashcardCreateStrong.shouldResearch, false, "strong fresh sources should not force flashcard research");

  const flashcardCreateWeak = decideResearchPolicy({
    operation: "FLASHCARD_CREATE",
    inventory: { flashcardCount: 2 },
    sources: [staleWeakSource],
    entity: { iceScore: 18 },
  });
  assert.equal(flashcardCreateWeak.shouldResearch, true, "low inventory with weak stale sources must force flashcard research");
  assert.equal(flashcardCreateWeak.mode, "MANDATORY", "weak low-inventory flashcard creation must be mandatory");

  const taskCreateWeak = decideResearchPolicy({
    operation: "TASK_CREATE",
    inventory: { flashcardCount: 12 },
    sources: [staleWeakSource],
    flashcards: [{
      id: "fc-1",
      body: "Customer onboarding issues remain unresolved. See https://example.com/old",
      confidenceScore: 4,
      iceScore: 33,
      lastRescoredAt: "2025-01-01T00:00:00.000Z",
    }],
    entity: { iceScore: 33 },
  });
  assert.equal(taskCreateWeak.shouldResearch, true, "weak or stale flashcards should trigger task creation research");

  const researchBackfill = decideResearchPolicy({
    operation: "RESEARCH_BACKFILL",
    inventory: { datacardCount: 1, flashcardCount: 3 },
  });
  assert.equal(researchBackfill.shouldResearch, true, "sparse inventory must trigger research backfill");

  const researchBackfillSkip = decideResearchPolicy({
    operation: "RESEARCH_BACKFILL",
    inventory: { datacardCount: 12, flashcardCount: 14 },
  });
  assert.equal(researchBackfillSkip.shouldResearch, false, "healthy inventory should skip research backfill");

  console.log("Research policy tests passed.");
}

main().catch((error) => {
  console.error("[test-research-policy] failed:", error);
  process.exit(1);
});
