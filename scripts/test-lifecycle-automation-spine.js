const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const {
  buildDestinationDaemonLane,
  buildLifecycleTelemetry,
  buildMaintenanceDiff,
  buildProvisioningPlan,
  evaluateVisitorFeedbackPolicy,
  normalizeVisitorFeedbackDecision,
  scoreVisitorContentHealth,
} = require("../src/lib/check-lifecycle/lifecycle-spine");

const provisioningPlan = buildProvisioningPlan({
  companyId: "unit_1",
  destinationKeys: ["compare", "compare"],
  actorId: "operator_1",
  idempotencyKey: "idem_1",
});

assert.equal(provisioningPlan.type, "provisioning_plan", "provisioning plan must be typed");
assert.equal(
  provisioningPlan.steps.some((step) => step.id === "mission:compare:VISITOR_CONTENT_CURATION"),
  true,
  "provisioning must include Compare Visitor content curation mission",
);
assert.equal(
  provisioningPlan.steps.some((step) => step.id === "audit-event"),
  true,
  "provisioning must include audit event step",
);

const maintenanceDiff = buildMaintenanceDiff({
  destinationKeys: ["compare"],
  existingPipelineJobs: [],
  existingMissionKinds: [],
  stalePublicProjectionIds: ["content_1"],
});

assert.equal(maintenanceDiff.state, "repairing", "missing lifecycle state must produce repairing state");
assert.equal(
  maintenanceDiff.safeRepairs.some((repair) => repair.reasonCode === "missing_pipeline_job"),
  true,
  "maintenance diff must repair missing pipeline jobs",
);
assert.equal(
  maintenanceDiff.heavyRepairs.some((repair) => repair.reasonCode === "stale_public_projection"),
  true,
  "maintenance diff must enqueue stale public projection verification",
);

const lowMemoryDiff = buildMaintenanceDiff({ destinationKeys: ["compare"], memoryState: "low" });
assert.equal(lowMemoryDiff.state, "paused_low_memory", "low memory must surface as explicit pause");
assert.equal(lowMemoryDiff.metrics.skipped > 0, true, "low memory pause must report skipped work");

const daemonLane = buildDestinationDaemonLane({
  destinationKeys: ["compare", "compare"],
  activeDefinitionIds: ["definition_1"],
  activeRunIds: ["run_1"],
});

assert.equal(daemonLane.jobType, "DESTINATION_MISSION_DAEMON", "daemon lane must use destination daemon job");
assert.equal(daemonLane.entityId, "destination-service", "daemon lane identity must be destination-agnostic");
assert.equal(daemonLane.metadata.serviceLane, "multi", "multi-destination unit must use multi lane metadata");
assert.equal(
  daemonLane.metadata.missionKinds.includes("VISITOR_CONTENT_CURATION"),
  true,
  "daemon lane must include Visitor content curation mission kind",
);

const blockedContent = scoreVisitorContentHealth({
  sourceTrust: 1,
  freshness: 1,
  taxonomyFit: 1,
  evidenceCompleteness: 1,
  feedbackFit: 1,
  sourceOnly: true,
});

assert.equal(blockedContent.score, 0, "source-only records must hard-block publish score");
assert.equal(blockedContent.state, "invalid", "source-only records must be invalid");
assert.equal(blockedContent.publishEligible, false, "source-only records cannot publish");

const healthyContent = scoreVisitorContentHealth({
  sourceTrust: 1,
  freshness: 1,
  taxonomyFit: 1,
  evidenceCompleteness: 1,
  feedbackFit: 1,
  published: true,
  publicVerificationFresh: true,
});
assert.equal(healthyContent.state, "published_verified", "verified published content must surface verified state");

const rule = normalizeVisitorFeedbackDecision({
  ruleType: "forbidden_category",
  severity: "block",
  category: "birthday_party",
  audience: "hunters",
  actorId: "operator_1",
  examples: ["birthday party is wrong for hunting"],
});

assert.equal(rule.severity, "block", "feedback rule must preserve block severity");
assert.deepEqual(rule.appliesTo, ["candidate", "published_content"], "feedback applies to future and existing content");

const policyDecision = evaluateVisitorFeedbackPolicy({
  candidate: { category: "birthday_party", audience: "hunters" },
  rules: [rule],
});

assert.equal(policyDecision.decision, "blocked", "block rule must override candidate publish eligibility");
assert.equal(policyDecision.publishEligible, false, "blocked feedback policy cannot publish");
assert.equal(policyDecision.refinementRequired, true, "feedback block must trigger refinement");

const telemetry = buildLifecycleTelemetry("LIFECYCLE_MAINTENANCE_RUN", {
  companyId: "unit_1",
  destinationKeys: ["compare"],
  reasonCode: maintenanceDiff.reasonCode,
  metrics: maintenanceDiff.metrics,
});

assert.equal(telemetry.event, "LIFECYCLE_MAINTENANCE_RUN", "telemetry event must be preserved");
assert.equal(telemetry.destinationKeys.includes("compare"), true, "telemetry must include destination keys");

const maintenanceEngineSource = readFileSync(join(process.cwd(), "src/lib/check-lifecycle/maintenance-engine.js"), "utf8");
assert.match(maintenanceEngineSource, /buildMaintenanceDiff/, "maintenance engine must expose lifecycle diff");
assert.match(maintenanceEngineSource, /buildDestinationDaemonLane/, "maintenance engine must expose daemon lane metadata");
assert.match(maintenanceEngineSource, /buildLifecycleTelemetry/, "maintenance engine must expose lifecycle telemetry");

console.log("Lifecycle automation spine contract tests passed.");
