const assert = require("node:assert/strict");

const {
  buildTaskUpdatePayload,
  buildFlashcardRefineUpdatePayload,
  buildFlashcardJudgeUpdatePayload,
} = require("./lib/runtime-write-contract");
const {
  classifyPipelineJobError,
  getPipelineJobRetryLimit,
  buildRunnablePipelineJobWhere,
} = require("../src/lib/pipeline-queue");
const {
  shouldAllowForegroundWork,
  FOREGROUND_HARD_PAUSE_MB,
} = require("./lib/runtime/resource-bands");
const {
  MEMORY_GOVERNOR_ACTIONS,
  DEFAULT_MEMORY_GOVERNOR_POLICY,
  createMemoryGovernorObservedState,
  isWorkerActivelyUsingModel,
  evaluateMemoryGovernorPolicy,
} = require("./lib/runtime/memory-governor");
const {
  resolvePipelineJobExecutionPlan,
  shouldDecomposeLowMemoryPipelineJob,
} = require("./lib/pipeline-jobs");

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

  const runnableWhere = buildRunnablePipelineJobWhere(new Date("2026-05-18T12:00:00.000Z"));
  assert.deepEqual(
    runnableWhere,
    {
      status: "ACTIVE",
      queueColumn: { not: "PARKED" },
      OR: [
        { scheduledAt: { isSet: false } },
        { scheduledAt: { lte: new Date("2026-05-18T12:00:00.000Z") } },
      ],
    },
    "claim path must treat missing scheduledAt as runnable under Prisma Mongo",
  );

  assert.equal(FOREGROUND_HARD_PAUSE_MB, 256, "foreground hard-pause threshold must stay explicit");
  assert.equal(
    shouldAllowForegroundWork(433).allowed,
    true,
    "foreground worker must keep running lightweight queue work above the hard-pause floor",
  );
  assert.equal(
    shouldAllowForegroundWork(203).allowed,
    false,
    "foreground worker must still pause when free memory drops below the hard floor",
  );

  assert.equal(
    isWorkerActivelyUsingModel({
      state: "running",
      stage: "PIPELINE_QUEUE",
      activeTask: "Score Alert Repair for misisimi",
    }),
    true,
    "real queue work must count as active model work",
  );
  assert.equal(
    isWorkerActivelyUsingModel({
      state: "running",
      stage: "PIPELINE_QUEUE",
      activeTask: "Scanning pipeline queue for runnable jobs",
    }),
    false,
    "queue scanning must not count as active model work",
  );

  const idleObservedState = createMemoryGovernorObservedState({
    activeTierKey: "idle-evict-low-memory",
    activeTierSince: Date.now() - 61_000,
  });
  const idleEviction = evaluateMemoryGovernorPolicy({
    freeMemMb: 700,
    runnerPresent: true,
    workerProgress: {
      state: "idle",
      stage: "IDLE",
      activeTask: "Waiting for the next planner cycle",
    },
    observedState: idleObservedState,
    lastActionAt: 0,
    now: Date.now(),
    policy: DEFAULT_MEMORY_GOVERNOR_POLICY,
  });
  assert.equal(
    idleEviction.action,
    MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_WAKE,
    "idle low-memory state should evict the Ollama runner and wake the worker",
  );

  const busyObservedState = createMemoryGovernorObservedState({
    activeTierKey: "force-evict-busy-worker",
    activeTierSince: Date.now() - 21_000,
  });
  const busyEviction = evaluateMemoryGovernorPolicy({
    freeMemMb: 450,
    runnerPresent: true,
    workerProgress: {
      state: "running",
      stage: "PIPELINE_QUEUE",
      activeTask: "Ensure flashcard minimum for rmbd",
    },
    observedState: busyObservedState,
    lastActionAt: 0,
    now: Date.now(),
    policy: DEFAULT_MEMORY_GOVERNOR_POLICY,
  });
  assert.equal(
    busyEviction.action,
    MEMORY_GOVERNOR_ACTIONS.EVICT_OLLAMA_AND_RESTART_WORKER,
    "hard low-memory state during active model work should evict the runner and restart the worker lane",
  );

  const constrainedHeavyPlan = resolvePipelineJobExecutionPlan({
    jobType: "ENSURE_FLASHCARD_MINIMUM",
    attemptCount: 0,
  }, 1100);
  assert.equal(constrainedHeavyPlan.executionOptions.profile, "degraded", "heavy jobs should downgrade under constrained memory");
  assert.equal(constrainedHeavyPlan.executionOptions.batchLimitOverride, 2, "constrained downgrade should reduce batch size");

  const degradedHeavyRetryPlan = resolvePipelineJobExecutionPlan({
    jobType: "MINE_FLASHCARD_OPPORTUNITIES",
    attemptCount: 2,
  }, 700);
  assert.equal(degradedHeavyRetryPlan.executionOptions.profile, "minimal", "repeatedly deferred heavy jobs should eventually run a minimal profile");
  assert.equal(degradedHeavyRetryPlan.executionOptions.disableResearchBackfill, true, "minimal heavy profiles should disable research backfill");

  assert.throws(
    () => resolvePipelineJobExecutionPlan({ jobType: "MINE_FLASHCARD_OPPORTUNITIES", attemptCount: 0 }, 700),
    /memory pressure is DEGRADED/i,
    "fresh heavy jobs should still defer when degraded memory cannot safely support them",
  );

  const metadataOverridePlan = resolvePipelineJobExecutionPlan({
    jobType: "ENSURE_FLASHCARD_MINIMUM",
    metadata: {
      executionOptions: {
        profile: "minimal",
        batchLimitOverride: 1,
        disableResearchBackfill: true,
      },
    },
  }, 1200);
  assert.equal(metadataOverridePlan.executionOptions.profile, "minimal", "persisted execution metadata must override runtime profile selection");
  assert.equal(metadataOverridePlan.executionOptions.batchLimitOverride, 1, "persisted execution metadata must preserve bounded child batch size");

  assert.equal(
    shouldDecomposeLowMemoryPipelineJob(
      { jobType: "ENSURE_FLASHCARD_MINIMUM", entityType: "COMPANY", attemptCount: 3 },
      { class: "LOW_MEMORY_SKIP" },
    ),
    true,
    "repeated low-memory failures on decomposable parent jobs should trigger child decomposition",
  );
  assert.equal(
    shouldDecomposeLowMemoryPipelineJob(
      { jobType: "ENSURE_FLASHCARD_MINIMUM", entityType: "PIPELINE_SLICE", attemptCount: 3 },
      { class: "LOW_MEMORY_SKIP" },
    ),
    false,
    "decomposed child jobs must not recursively decompose themselves",
  );

  console.log("Runtime hardening tests passed.");
}

main().catch((error) => {
  console.error("[test-runtime-hardening] failed:", error);
  process.exit(1);
});
