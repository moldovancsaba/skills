const assert = require("node:assert/strict");

const {
  buildTaskFamilyKeys,
  deriveFeedbackPressureDelta,
  applyFeedbackPressure,
  getPressureForFamilyKeys,
  isAnyFamilyBlocked,
} = require("./lib/planner/feedback-pressure");

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
  const task = {
    id: "task-1",
    duplicateClusterId: "dup-1",
    versionFamilyId: "vf-1",
    sourceFlashcardIds: ["fc-1", "fc-2"],
  };
  const familyKeys = buildTaskFamilyKeys(task);
  assert.equal(familyKeys.includes("task-duplicate:dup-1"), true, "duplicate cluster should become a family key");
  assert.equal(familyKeys.includes("flashcard:fc-1"), true, "source flashcards should become family keys");

  assert.equal(deriveFeedbackPressureDelta({ action: "DELIVER" }), 3, "deliver should create a strong positive signal");
  assert.equal(deriveFeedbackPressureDelta({ action: "DECLINE", declineClass: "WRONG" }) < 0, true, "negative feedback should reduce pressure");

  const prisma = createMockPrisma();
  await applyFeedbackPressure(prisma, "company-1", { action: "DELIVER" }, { ...task, companyId: "company-1" });
  const indexAfterPositive = prisma._store.get("planner_feedback_pressure_index");
  assert.equal(getPressureForFamilyKeys(indexAfterPositive, ["flashcard:fc-1"]) > 0, true, "positive feedback should raise family pressure");
  assert.equal(isAnyFamilyBlocked(indexAfterPositive, ["flashcard:fc-1"]), false, "positive feedback must not block the family");

  await applyFeedbackPressure(prisma, "company-1", { action: "DECLINE", declineClass: "WRONG" }, { ...task, companyId: "company-1" });
  await applyFeedbackPressure(prisma, "company-1", { action: "DECLINE", declineClass: "WRONG" }, { ...task, companyId: "company-1" });
  await applyFeedbackPressure(prisma, "company-1", { action: "DECLINE", declineClass: "WRONG" }, { ...task, companyId: "company-1" });
  const indexAfterNegative = prisma._store.get("planner_feedback_pressure_index");
  assert.equal(isAnyFamilyBlocked(indexAfterNegative, ["flashcard:fc-1"]), true, "repeated negative feedback should block the family");

  console.log("Feedback pressure tests passed.");
}

main().catch((error) => {
  console.error("[test-feedback-pressure] failed:", error);
  process.exit(1);
});
