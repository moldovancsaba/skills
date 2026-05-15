const assert = require("node:assert/strict");

const {
  assessEditorialQuality,
  applyEditorialQualityGate,
} = require("./lib/planner/editorial-gate");

async function main() {
  const weakTask = applyEditorialQualityGate("TASK", {
    title: "task",
    description: "maybe do stuff!!!",
    processingStatus: "DRAFT",
  }, { bodyLimit: 1200 });

  assert.equal(weakTask.editorialGate.shouldDowngrade, true, "weak copy should be downgraded by the editorial gate");
  assert.equal(weakTask.processingStatus, "REVIEW", "weak copy should route to review");

  const strongTask = assessEditorialQuality("TASK", {
    title: "Run renewal objection interviews with at-risk enterprise accounts",
    description: "Interview five at-risk enterprise accounts, summarize pricing objections, and document recommended responses before the renewal workshop next week.",
  });

  assert.equal(strongTask.aggregate > weakTask.editorialGate.aggregate, true, "strong editorial quality should score above weak copy");
  assert.equal(strongTask.shouldDowngrade, false, "strong copy should pass the editorial gate");

  console.log("Editorial gate tests passed.");
}

main().catch((error) => {
  console.error("[test-editorial-gate] failed:", error);
  process.exit(1);
});
