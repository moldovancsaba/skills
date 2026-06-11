const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const {
  buildTaskUpdatePayload,
  buildFlashcardRefineUpdatePayload,
  buildFlashcardJudgeUpdatePayload,
} = require("./lib/runtime-write-contract");
const {
  classifyPipelineJobError,
  getPipelineJobRetryLimit,
  DESTINATION_SERVICE_OUTAGE_COOLDOWN_MS,
  buildDestinationServiceOutageMaintenancePatch,
  buildDestinationServiceOutageBreaker,
  normalizeQueueCircuitBreakerState,
  buildRunnablePipelineJobWhere,
  buildLowMemoryDecompositionChildPlans,
  enqueueDirtyPipelineTopologyCompany,
  drainDirtyPipelineTopologyCompanies,
  normalizePipelineTopologyState,
  recordPipelineTopologySyncResult,
} = require("../src/lib/pipeline-queue");
const {
  shouldAllowForegroundWork,
  shouldAllowBackgroundSnapshotWork,
  FOREGROUND_HARD_PAUSE_MB,
  parseVmStatAvailableMb,
} = require("./lib/runtime/resource-bands");
const {
  enqueueDirtyProjectionCompany,
  drainDirtyProjectionCompanies,
  getProjectionBackfillStatus,
  normalizeProjectionRefreshState,
  recordProjectionRefreshResult,
} = require("./lib/intelligence-snapshot");
const {
  MEMORY_GOVERNOR_ACTIONS,
  DEFAULT_MEMORY_GOVERNOR_POLICY,
  createMemoryGovernorObservedState,
  isWorkerActivelyUsingModel,
  evaluateMemoryGovernorPolicy,
} = require("./lib/runtime/memory-governor");
const {
  executePipelineJob,
  resolvePipelineJobExecutionPlan,
  boundMiniappIntentLimit,
  shouldDecomposeLowMemoryPipelineJob,
  shouldDelegateQueueRefresh,
} = require("./lib/pipeline-jobs");
const { getSynthesisProgress } = require("./lib/synthesis");

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

  const storageQuotaBlocked = classifyPipelineJobError({
    code: "P2010",
    meta: {
      message: "AtlasError: you are over your space quota, using 512 MB of 512 MB. Writes are blocked on your cluster.",
    },
  });
  assert.equal(storageQuotaBlocked.class, "STORAGE_QUOTA_BLOCKED", "Atlas storage quota failures must classify explicitly");
  assert.equal(storageQuotaBlocked.retryable, true, "Atlas storage quota failures must stay retryable");
  assert.equal(storageQuotaBlocked.retryAfterMs, 30 * 60 * 1000, "Atlas quota failures must back off for a longer window");

  const destinationServiceUnavailable = classifyPipelineJobError(
    new Error("Destination mission daemon could not reach the internal daemon endpoint. http://127.0.0.1:3415 (ERR: fetch failed)"),
  );
  assert.equal(
    destinationServiceUnavailable.class,
    "DESTINATION_SERVICE_UNAVAILABLE",
    "destination daemon endpoint outages must classify explicitly",
  );
  assert.equal(destinationServiceUnavailable.retryable, true, "destination endpoint outages must stay retryable");
  assert.equal(destinationServiceUnavailable.retryAfterMs, 10 * 60 * 1000, "destination endpoint outages must use bounded backoff");
  const outagePatch = buildDestinationServiceOutageMaintenancePatch(new Date("2026-05-18T12:00:00.000Z"));
  assert.equal(
    DESTINATION_SERVICE_OUTAGE_COOLDOWN_MS,
    30 * 60 * 1000,
    "destination endpoint outages must cool down the daemon lane long enough to avoid queue hammering",
  );
  assert.equal(outagePatch.queueColumn, "LATER", "destination endpoint outage maintenance must move daemon work behind healthy work");
  assert.equal(
    outagePatch.scheduledAt.toISOString(),
    "2026-05-18T12:30:00.000Z",
    "destination endpoint outage maintenance must schedule a cohort retry window",
  );
  const outageBreaker = buildDestinationServiceOutageBreaker({
    now: new Date("2026-05-18T12:00:00.000Z"),
    nextRetryAt: outagePatch.scheduledAt,
    affectedCount: 44,
  });
  assert.equal(outageBreaker.id, "destination-service-unavailable", "destination outage breaker id must stay stable");
  assert.equal(outageBreaker.state, "open", "destination outage breaker must open during endpoint outage maintenance");
  assert.deepEqual(outageBreaker.affectedJobTypes, ["DESTINATION_MISSION_DAEMON"], "destination outage breaker must identify the daemon lane");
  assert.equal(outageBreaker.nextRetryAt, "2026-05-18T12:30:00.000Z", "destination outage breaker must expose next retry time");
  assert.equal(
    normalizeQueueCircuitBreakerState({ active: [outageBreaker], recentEvents: [{ action: "opened" }] }).active.length,
    1,
    "queue circuit breaker state must normalize active breakers",
  );

  const lowMemory = classifyPipelineJobError({
    message: "ENSURE_FLASHCARD_MINIMUM deferred because memory pressure is CONSTRAINED (900MB free).",
    pipelineClass: "LOW_MEMORY_SKIP",
    retryable: true,
    retryAfterMs: 180000,
  });
  assert.equal(lowMemory.class, "LOW_MEMORY_SKIP", "explicit low-memory skips must keep their class");
  assert.equal(lowMemory.retryAfterMs, 180000, "explicit retry windows must survive classification");

  const legacyMissingMutationAuthority = classifyPipelineJobError(
    new TypeError("Cannot read properties of null (reading 'mutationAuthority')"),
  );
  assert.equal(
    legacyMissingMutationAuthority.class,
    "MUTATION_AUTHORITY",
    "legacy null mutationAuthority failures must classify explicitly",
  );
  assert.equal(legacyMissingMutationAuthority.retryable, false, "missing mutation authority must not loop retries");

  await assert.rejects(
    () => executePipelineJob(null, { id: "job-1", jobType: "CARD_RESCORING", companyId: "company-1" }, {}),
    /MISSING_MUTATION_AUTHORITY/,
    "pipeline execution must fail before runtime mutation when authority is missing",
  );

  assert.equal(getPipelineJobRetryLimit("ENSURE_FLASHCARD_MINIMUM"), 4, "bootstrap jobs must use bounded retry limits");
  assert.equal(getPipelineJobRetryLimit("DESTINATION_MISSION_DAEMON"), 24, "destination service jobs must tolerate local endpoint outages without dead-letter flapping");
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

  const synthesisProgress = getSynthesisProgress();
  assert.equal(synthesisProgress.currentJobId, null, "synthesis progress must start with no explicit job id");
  assert.equal(synthesisProgress.currentJobType, null, "synthesis progress must start with no explicit job type");
  assert.equal(synthesisProgress.currentEntityType, null, "synthesis progress must start with no explicit entity context");
  assert.equal(synthesisProgress.currentEntityLabel, null, "synthesis progress must start with no explicit entity label");
  assert.equal(synthesisProgress.currentExecutionProfile, null, "synthesis progress must start with no execution profile");
  assert.equal(synthesisProgress.currentExecutionResourceBand, null, "synthesis progress must start with no execution band");
  assert.equal(synthesisProgress.jobStartedAt, null, "synthesis progress must start with no job-start timestamp");

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
    shouldAllowBackgroundSnapshotWork(1420).allowed,
    true,
    "snapshot worker should resume bounded background work under constrained memory",
  );
  assert.equal(
    shouldAllowBackgroundSnapshotWork(760).allowed,
    false,
    "snapshot worker must still pause under degraded memory",
  );
  assert.equal(
    parseVmStatAvailableMb(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free: 5627.
Pages active: 420355.
Pages inactive: 410403.
Pages speculative: 9111.
Pages purgeable: 7438.
Pages stored in compressor: 169530.
Pages occupied by compressor: 65205.
File-backed pages: 555038.
`),
    9019,
    "darwin memory guard should count safely reclaimable file-backed memory instead of raw free pages only",
  );
  const guardianSource = readFileSync("scripts/guardian.js", "utf8");
  assert.match(
    guardianSource,
    /getFreeMemoryMb/,
    "guardian memory governor must use the shared effective-memory estimator",
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
  assert.equal(
    shouldDecomposeLowMemoryPipelineJob(
      { jobType: "RESEARCH_BACKFILL", entityType: "MINIAPP_OPS_ACTION", attemptCount: 3 },
      { class: "LOW_MEMORY_SKIP" },
    ),
    false,
    "miniapp ops jobs must stay linear instead of low-memory fan-out decomposition",
  );
  assert.equal(
    boundMiniappIntentLimit(10, 30, 1),
    1,
    "miniapp intent limits must honor minimal memory profile caps",
  );
  assert.equal(
    boundMiniappIntentLimit(10, 30, 2),
    2,
    "miniapp intent limits must honor degraded memory profile caps",
  );

  assert.equal(
    shouldDelegateQueueRefresh({ executed: 0, claimedAny: false }),
    true,
    "foreground claim miss should delegate queue refresh to the background lane",
  );
  assert.equal(
    shouldDelegateQueueRefresh({ executed: 1, claimedAny: true }),
    false,
    "foreground must not delegate queue refresh after it successfully claimed work",
  );

  const childPlans = buildLowMemoryDecompositionChildPlans(
    { jobType: "MINE_FLASHCARD_OPPORTUNITIES", queueColumn: "SOON" },
    {
      profile: "minimal",
      batchLimitOverride: 1,
      disableResearchBackfill: true,
      countOverrides: { flashcards: 1 },
    },
  );
  assert.equal(childPlans.length, 3, "decomposition should fan out oversized work into multiple bounded child slices");
  assert.deepEqual(
    childPlans.map((plan) => plan.executionOptions.selectionOffset),
    [0, 1, 2],
    "child slices must persist unique selection offsets so they do distinct work",
  );
  assert.equal(
    childPlans.every((plan) => plan.executionOptions.profile === "minimal"),
    true,
    "child slices must keep the bounded minimal execution profile",
  );

  const dirtyState = enqueueDirtyPipelineTopologyCompany(
    { dirtyCompanies: [], recentSyncs: [] },
    "company-1",
    "job-success:REFRESH_FLASHCARDS",
    new Date("2026-05-18T12:00:00.000Z"),
  );
  const dedupedDirtyState = enqueueDirtyPipelineTopologyCompany(
    dirtyState,
    "company-1",
    "job-success:REFRESH_TASKS",
    new Date("2026-05-18T12:05:00.000Z"),
  );
  assert.equal(dedupedDirtyState.dirtyCompanies.length, 1, "touched-company queue should dedupe the same company instead of growing forever");
  assert.equal(dedupedDirtyState.dirtyCompanies[0].reason, "job-success:REFRESH_TASKS", "latest touched-company reason should replace stale queue reasons");

  const drainedTopology = drainDirtyPipelineTopologyCompanies({
    dirtyCompanies: [
      { companyId: "company-1", reason: "job-success:A", requestedAt: "2026-05-18T12:00:00.000Z" },
      { companyId: "company-2", reason: "job-success:B", requestedAt: "2026-05-18T12:01:00.000Z" },
      { companyId: "company-3", reason: "job-success:C", requestedAt: "2026-05-18T12:02:00.000Z" },
    ],
    recentSyncs: [],
  }, 2);
  assert.deepEqual(
    drainedTopology.drained.map((entry) => entry.companyId),
    ["company-1", "company-2"],
    "topology drain should preserve oldest-first touched-company order",
  );
  assert.deepEqual(
    drainedTopology.remaining.map((entry) => entry.companyId),
    ["company-3"],
    "topology drain should leave untouched companies behind for later background repair",
  );

  const topologyHistory = recordPipelineTopologySyncResult(
    normalizePipelineTopologyState({ dirtyCompanies: [], recentSyncs: [] }),
    {
      companyId: "company-1",
      companyName: "Alpha",
      reason: "job-success:REFRESH_FLASHCARDS",
      status: "SYNCED",
      trigger: "snapshot-worker",
    },
    new Date("2026-05-18T12:10:00.000Z"),
  );
  assert.equal(topologyHistory.recentSyncs.length, 1, "topology observability should record targeted sync results");
  assert.equal(topologyHistory.recentSyncs[0].companyName, "Alpha", "topology observability should preserve company labels when known");

  const dirtyProjectionState = enqueueDirtyProjectionCompany(
    { dirtyCompanies: [], recentRefreshes: [] },
    "company-1",
    "job-success:REFRESH_FLASHCARDS",
    new Date("2026-05-18T12:00:00.000Z"),
  );
  const dedupedProjectionState = enqueueDirtyProjectionCompany(
    dirtyProjectionState,
    "company-1",
    "job-success:REFRESH_TASKS",
    new Date("2026-05-18T12:05:00.000Z"),
  );
  assert.equal(dedupedProjectionState.dirtyCompanies.length, 1, "projection repair queue should dedupe the same company instead of growing forever");
  assert.equal(dedupedProjectionState.dirtyCompanies[0].reason, "job-success:REFRESH_TASKS", "latest projection repair reason should replace stale reasons");

  const drainedProjections = drainDirtyProjectionCompanies({
    dirtyCompanies: [
      { companyId: "company-1", reason: "job-success:A", requestedAt: "2026-05-18T12:00:00.000Z" },
      { companyId: "company-2", reason: "job-success:B", requestedAt: "2026-05-18T12:01:00.000Z" },
      { companyId: "company-3", reason: "job-success:C", requestedAt: "2026-05-18T12:02:00.000Z" },
    ],
    recentRefreshes: [],
  }, 2);
  assert.deepEqual(
    drainedProjections.drained.map((entry) => entry.companyId),
    ["company-1", "company-2"],
    "projection repair drain should preserve oldest-first touched-company order",
  );
  assert.deepEqual(
    drainedProjections.remaining.map((entry) => entry.companyId),
    ["company-3"],
    "projection repair drain should leave untouched companies behind for later background repair",
  );

  const projectionHistory = recordProjectionRefreshResult(
    normalizeProjectionRefreshState({ dirtyCompanies: [], recentRefreshes: [] }),
    {
      companyId: "company-1",
      companyName: "Alpha",
      reason: "job-success:REFRESH_FLASHCARDS",
      status: "REFRESHED",
      trigger: "snapshot-worker",
    },
    new Date("2026-05-18T12:10:00.000Z"),
  );
  assert.equal(projectionHistory.recentRefreshes.length, 1, "projection observability should record targeted refresh results");
  assert.equal(projectionHistory.recentRefreshes[0].companyName, "Alpha", "projection observability should preserve company labels when known");
  assert.equal(getProjectionBackfillStatus(null), "MISSING", "missing projections must be backfilled");
  assert.equal(getProjectionBackfillStatus({ version: 0, generatedAt: "2026-05-18T12:00:00.000Z" }), "OUTDATED_VERSION", "older projection versions must be backfilled");
  assert.equal(getProjectionBackfillStatus({ version: 1, generatedAt: "not-a-date" }), "MISSING", "invalid projection timestamps must be backfilled");
  assert.equal(
    getProjectionBackfillStatus(
      { version: 1, generatedAt: "2026-05-18T12:00:00.000Z" },
      new Date("2026-05-18T12:30:00.000Z"),
    ),
    "READY",
    "current projections with valid timestamps should not be backfilled",
  );
  assert.equal(
    getProjectionBackfillStatus(
      { version: 1, generatedAt: "2026-05-18T12:00:00.000Z" },
      new Date("2026-05-18T13:01:00.000Z"),
    ),
    "STALE",
    "stale projections must be picked up by snapshot-owned recovery",
  );

  console.log("Runtime hardening tests passed.");
}

main().catch((error) => {
  console.error("[test-runtime-hardening] failed:", error);
  process.exit(1);
});
