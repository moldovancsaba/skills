const assert = require("node:assert/strict");

const {
  combinedSimilarity,
  evaluateCandidateNovelty,
} = require("./lib/planner/novelty");

async function main() {
  const duplicateCandidate = {
    title: "Benchmark competitor pricing for enterprise renewals",
    body: "Compare enterprise pricing, support bundles, and renewal pressure before the next commercial review.",
    hashtags: ["#pricing", "#renewals"],
  };
  const activeFlashcards = [
    {
      id: "fc-1",
      publicId: 1001,
      title: "Benchmark competitor pricing for enterprise renewals",
      body: "Compare enterprise pricing, support bundles, and renewal pressure before the next commercial review.",
      hashtags: ["#pricing", "#renewals"],
    },
  ];

  assert.equal(
    combinedSimilarity(duplicateCandidate, activeFlashcards[0]) > 0.95,
    true,
    "near-identical cards must have very high similarity",
  );

  const blocked = await evaluateCandidateNovelty(null, {
    companyId: "company-1",
    entityType: "FLASHCARD",
    candidate: duplicateCandidate,
    inventory: activeFlashcards,
  });
  assert.equal(blocked.shouldPublish, false, "near-duplicate flashcards must be blocked");
  assert.equal(blocked.closestMatch.publicId, 1001, "novelty block should report the closest match");

  const novelTask = await evaluateCandidateNovelty(null, {
    companyId: "company-1",
    entityType: "TASK",
    candidate: {
      title: "Run customer renewal objection interviews",
      description: "Interview five at-risk enterprise customers and summarize pricing objections before the renewal workshop.",
      hashtags: ["#customer", "#renewal"],
    },
    inventory: [{
      id: "task-1",
      publicId: 2001,
      title: "Review quarterly forecast assumptions",
      description: "Validate sales forecast assumptions with finance before month-end close.",
      hashtags: ["#forecast", "#finance"],
    }],
  });
  assert.equal(novelTask.shouldPublish, true, "distant tasks must remain publishable");
  assert.equal(novelTask.noveltyScore > blocked.noveltyScore, true, "novel tasks must score above duplicates");

  console.log("Novelty tests passed.");
}

main().catch((error) => {
  console.error("[test-novelty] failed:", error);
  process.exit(1);
});
