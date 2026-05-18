const assert = require("node:assert/strict");

const {
  buildTaskUpdatePayload,
  buildFlashcardRefineUpdatePayload,
  buildFlashcardJudgeUpdatePayload,
} = require("./lib/runtime-write-contract");
const {
  classifyPipelineJobError,
  getPipelineJobRetryLimit,
} = require("../src/lib/pipeline-queue");

async function main() {
  const taskPayload = buildTaskUpdatePayload({
    id: "task-1",
    companyId: "company-1",
    title: "Tighten task payload updates",
    description: "Only persist writable fields.",
    confidence: 8,
    hashtags: ["#runtime"],
    lastRescoredAt: new Date("2026-05-18T10:00:00.000Z"),
    relation: { bad: true },
  });
  assert.equal("id" in taskPayload, false, "task update payload must never leak id");
  assert.equal("companyId" in taskPayload, false, "task update payload must never leak companyId");
  assert.equal("relation" in taskPayload, false, "task update payload must never leak relation objects");
  assert.deepEqual(taskPayload.hashtags, ["#runtime"], "task payload must preserve valid array fields");

  const flashcardPayload = buildFlashcardRefineUpdatePayload({
    id: "fc-1",
    companyId: "company-1",
    title: "Keep flashcard writes safe",
    body: "Only writable fields should pass through.",
    processingStatus: "CHECKED",
    generatedFromIds: ["src-1"],
    sources: [{ id: "bad" }],
  });
  assert.equal("id" in flashcardPayload, false, "flashcard update payload must never leak id");
  assert.equal("companyId" in flashcardPayload, false, "flashcard update payload must never leak companyId");
  assert.equal("sources" in flashcardPayload, false, "flashcard update payload must never leak relation arrays");
  assert.deepEqual(flashcardPayload.generatedFromIds, ["src-1"], "flashcard payload must preserve valid lineage arrays");

  const judgedPayload = buildFlashcardJudgeUpdatePayload(
    {
      id: "fc-1",
      processingStatus: "VERIFIED",
      reviewStatus: "APPROVED",
      confidenceScore: 8.2,
    },
    new Date("2026-05-18T10:10:00.000Z"),
    {
      lastTaxonomyAuditedAt: new Date("2026-05-18T10:10:00.000Z"),
      hashtagEvaluationPending: true,
    },
  );
  assert.equal("id" in judgedPayload, false, "judge payload must never leak id");
  assert.equal(judgedPayload.processingStatus, "VERIFIED", "judge payload must preserve judged status");
  assert.equal(judgedPayload.hashtagEvaluationPending, true, "judge payload must allow explicit safe overrides");

  const prismaValidation = classifyPipelineJobError(new Error("Unknown argument `id`. Did you mean `kind`?"));
  assert.equal(prismaValidation.class, "PRISMA_VALIDATION", "invalid Prisma writes must classify as validation failures");
  assert.equal(prismaValidation.retryable, false, "invalid Prisma writes must be terminal");

  const timeout = classifyPipelineJobError(new Error("PLANNER_TIMEOUT bootstrap_flashcard_generation exceeded 120000ms"));
  assert.equal(timeout.class, "MODEL_TIMEOUT", "planner timeouts must classify as model timeouts");
  assert.equal(timeout.retryable, true, "planner timeouts must stay retryable");

  const lowMemory = classifyPipelineJobError({
    message: "ENSURE_FLASHCARD_MINIMUM deferred because memory pressure is CONSTRAINED (900MB free).",
    pipelineClass: "LOW_MEMORY_SKIP",
    retryable: true,
    retryAfterMs: 180000,
  });
  assert.equal(lowMemory.class, "LOW_MEMORY_SKIP", "explicit low-memory skips must keep their class");
  assert.equal(lowMemory.retryAfterMs, 180000, "explicit retry windows must survive classification");

  assert.equal(getPipelineJobRetryLimit("ENSURE_FLASHCARD_MINIMUM"), 4, "bootstrap jobs must use bounded retry limits");
  assert.equal(getPipelineJobRetryLimit("WORKFLOW_BLUEPRINT"), 3, "workflow jobs must use tighter retry limits");
  assert.equal(getPipelineJobRetryLimit("UNKNOWN_JOB"), 3, "unknown jobs must fall back to the safe default retry limit");

  console.log("Runtime hardening tests passed.");
}

main().catch((error) => {
  console.error("[test-runtime-hardening] failed:", error);
  process.exit(1);
});
