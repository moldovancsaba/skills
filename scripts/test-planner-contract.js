const assert = require("node:assert/strict");

const {
  comparePlannerPromotionPriority,
  getCompanyOperatingMode,
  canMoveTaskToLane,
} = require("../src/lib/planner-contract");
const {
  buildPlannerStateSnapshot,
  buildPlannerEventSummary,
  getWorkerBuildIdentity,
} = require("./lib/planner/telemetry");
const { withPlannerTimeout } = require("./lib/planner/timeout");
const {
  PIPELINE_JOB_TYPES,
  GLOBAL_PIPELINE_SYNC_INTERVAL_MS,
  shouldRunGlobalPipelineSync,
} = require("../src/lib/pipeline-queue");

function createMockPrisma() {
  const store = new Map();
  return {
    _store: store,
    globalSetting: {
      async findUnique({ where }) {
        if (!store.has(where.key)) return null;
        return { key: where.key, value: store.get(where.key) };
      },
      async upsert({ where, create, update }) {
        const value = store.has(where.key) ? update.value : create.value;
        store.set(where.key, value);
        return { key: where.key, value };
      },
    },
  };
}

async function main() {
  assert.equal(
    getCompanyOperatingMode({ datacardCount: 0, flashcardCount: 0, laneCounts: {} }),
    "INACTIVE",
    "company without datacards must be inactive",
  );
  assert.equal(
    getCompanyOperatingMode({
      datacardCount: 1,
      flashcardCount: 4,
      laneCounts: { CHECKLIST: 0, TODO: 0, BACKLOG: 0, ROADMAP: 0, IDEABANK: 0 },
    }),
    "BOOTSTRAP",
    "company below flashcard minimum must stay in bootstrap",
  );
  assert.equal(
    getCompanyOperatingMode({
      datacardCount: 2,
      flashcardCount: 12,
      laneCounts: { CHECKLIST: 3, TODO: 3, BACKLOG: 3, ROADMAP: 3, IDEABANK: 3 },
    }),
    "MAINTENANCE",
    "company at all targets must enter maintenance",
  );

  const ranked = [
    { title: "Zulu", iceScore: 7, ease: 5, confidenceScore: 5 },
    { title: "Alpha", iceScore: 7, ease: 5, confidenceScore: 5 },
    { title: "Bravo", iceScore: 7, ease: 8, confidenceScore: 5 },
    { title: "Charlie", iceScore: 9, ease: 1, confidenceScore: 1 },
  ].sort(comparePlannerPromotionPriority);
  assert.deepEqual(
    ranked.map((item) => item.title),
    ["Charlie", "Bravo", "Alpha", "Zulu"],
    "promotion ordering must follow ICE, ease, confidence, title",
  );

  const cooldownTask = {
    kanbanColumn: "BACKLOG",
    manualLaneFloorColumn: "BACKLOG",
    manualLaneCooldownUntil: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(canMoveTaskToLane(cooldownTask, "ROADMAP"), false, "manual cooldown must block demotion below floor");
  assert.equal(canMoveTaskToLane(cooldownTask, "TODO"), true, "manual cooldown must still allow promotion");

  const plannerState = buildPlannerStateSnapshot({
    mode: "BOOTSTRAP",
    datacardCount: 1,
    flashcardCount: 6,
    activeManualCooldownCount: 2,
    laneCounts: { CHECKLIST: 1, TODO: 3, BACKLOG: 2, ROADMAP: 3, IDEABANK: 3 },
  });
  assert.equal(plannerState.unmetFlashcardTarget, 4, "planner state must expose flashcard gap");
  assert.deepEqual(
    plannerState.unmetLaneTargets.map((item) => item.lane),
    ["CHECKLIST", "BACKLOG"],
    "planner state must expose unmet lane targets",
  );

  const eventSummary = buildPlannerEventSummary([
    { eventType: "TIMEOUT" },
    { eventType: "QUALITY_CEILING_APPLIED" },
    { eventType: "MANUAL_COOLDOWN_BLOCK" },
    { eventType: "RESEARCH_POLICY_RUN" },
    { eventType: "RESEARCH_POLICY_SKIP" },
    { eventType: "NOVELTY_BLOCKED" },
    { eventType: "FEEDBACK_PRESSURE_BLOCK" },
    { eventType: "FEEDBACK_PRESSURE_SKIP" },
    { eventType: "EDITORIAL_GATE_DOWNGRADE" },
    { eventType: "TIMEOUT" },
  ]);
  assert.equal(eventSummary.timeoutCount, 2, "timeout count must be aggregated");
  assert.equal(eventSummary.qualityCeilingCount, 1, "quality ceiling count must be aggregated");
  assert.equal(eventSummary.manualCooldownBlockCount, 1, "manual cooldown count must be aggregated");
  assert.equal(eventSummary.researchRunCount, 1, "research run count must be aggregated");
  assert.equal(eventSummary.researchSkipCount, 1, "research skip count must be aggregated");
  assert.equal(eventSummary.noveltyBlockedCount, 1, "novelty block count must be aggregated");
  assert.equal(eventSummary.feedbackPressureBlockCount, 1, "feedback pressure block count must be aggregated");
  assert.equal(eventSummary.feedbackPressureSkipCount, 1, "feedback pressure skip count must be aggregated");
  assert.equal(eventSummary.editorialDowngradeCount, 1, "editorial downgrade count must be aggregated");

  const prisma = createMockPrisma();
  await assert.rejects(
    withPlannerTimeout(
      prisma,
      {
        companyId: "company-1",
        label: "planner-timeout-test",
        timeoutMs: 10,
        metadata: { stage: "unit-test" },
      },
      () => new Promise(() => {}),
    ),
    /PLANNER_TIMEOUT/,
    "planner timeout wrapper must reject on timeout",
  );
  const storedEvents = prisma._store.get("planner_telemetry_events");
  assert.equal(Array.isArray(storedEvents), true, "timeout wrapper must persist telemetry");
  assert.equal(storedEvents[0].eventType, "TIMEOUT", "timeout telemetry must be recorded");

  assert.equal(PIPELINE_JOB_TYPES.includes("ENSURE_CHECKLIST_MINIMUM"), true, "explicit checklist planner job must be managed");
  assert.equal(PIPELINE_JOB_TYPES.includes("REFRESH_GOALS"), true, "explicit goal refresh job must be managed");
  assert.equal(PIPELINE_JOB_TYPES.includes("MINE_FLASHCARD_OPPORTUNITIES"), true, "flashcard opportunity mining must be a managed queue job");
  assert.equal(PIPELINE_JOB_TYPES.includes("MINE_TASK_OPPORTUNITIES"), true, "task opportunity mining must be a managed queue job");
  assert.equal(PIPELINE_JOB_TYPES.includes("FEEDBACK_PRESSURE_REGENERATION"), true, "feedback pressure regeneration must be a managed queue job");
  assert.equal(
    shouldRunGlobalPipelineSync(0, 1_000, GLOBAL_PIPELINE_SYNC_INTERVAL_MS),
    true,
    "queue sync must run when there is no previous sync timestamp",
  );
  assert.equal(
    shouldRunGlobalPipelineSync(10_000, 10_000 + GLOBAL_PIPELINE_SYNC_INTERVAL_MS - 1, GLOBAL_PIPELINE_SYNC_INTERVAL_MS),
    false,
    "queue sync must not rerun before the hardening interval elapses",
  );
  assert.equal(
    shouldRunGlobalPipelineSync(10_000, 10_000 + GLOBAL_PIPELINE_SYNC_INTERVAL_MS, GLOBAL_PIPELINE_SYNC_INTERVAL_MS),
    true,
    "queue sync must rerun once the hardening interval elapses",
  );

  const buildIdentity = getWorkerBuildIdentity();
  assert.equal(typeof buildIdentity.appVersion, "string", "build identity must expose app version");
  assert.equal(Boolean(buildIdentity.checkoutPath), true, "build identity must expose checkout path");
  assert.equal(typeof buildIdentity.gitDirty, "boolean", "build identity must expose dirty checkout state");

  console.log("Planner contract tests passed.");
}

main().catch((error) => {
  console.error("[test-planner-contract] failed:", error);
  process.exit(1);
});
