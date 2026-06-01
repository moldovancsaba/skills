import assert from "node:assert/strict";
import { buildHumanApprovedBurstChildPlans } from "../src/lib/human-approved-burst.ts";

const plans = buildHumanApprovedBurstChildPlans({
  parentBurstId: "burst_compare_30",
  approvedAt: "2026-06-01T12:00:00.000Z",
  request: {
    approvedBy: "operator@example.com",
    reason: "Stress test Compare Visitor content generation",
    requestedOutputCount: 30,
    shardSize: 7,
    maxConcurrency: 2,
    minFreeMemoryMb: 4096,
    timeoutSeconds: 3600,
    target: { companyId: "company_1", destinationKey: "compare" },
    rollbackMode: "REWORK_CHILD_OUTPUTS",
  },
});

assert.equal(plans.length, 5);
assert.deepEqual(plans.map((plan) => plan.requestedOutputCount), [7, 7, 7, 7, 2]);
assert.equal(plans[0].metadata.lane, "HUMAN_APPROVED_BURST_CHILD");
assert.equal(plans[0].metadata.approval.approvedBy, "operator@example.com");
assert.equal(plans[0].metadata.target.destinationKey, "compare");
assert.equal(plans[0].metadata.executionOptions.batchLimitOverride, 7);
assert.equal(plans[4].metadata.executionOptions.selectionOffset, 28);
assert.equal(plans.every((plan) => plan.queueColumn === "NOW"), true);

assert.throws(
  () =>
    buildHumanApprovedBurstChildPlans({
      parentBurstId: "burst_bad",
      request: {
        approvedBy: "",
        reason: "Missing approval",
        requestedOutputCount: 1,
        shardSize: 1,
        maxConcurrency: 1,
        minFreeMemoryMb: 1,
        timeoutSeconds: 1,
        target: { destinationKey: "compare" },
        rollbackMode: "PARK_CHILD_JOBS",
      },
    }),
  (error) => error?.code === "BURST_APPROVAL_REQUIRED",
);

console.log("Human-approved burst planner tests passed.");
