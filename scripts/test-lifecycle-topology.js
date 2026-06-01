const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const {
  CORE_UNIT_PIPELINE_JOBS,
  getDestinationDaemonJobIdentity,
  getDestinationMissionKinds,
  getDestinationTopology,
  getLegacyDestinationDaemonJobIdentities,
  getUnitLifecycleRequirements,
  listLifecycleDestinationKeys,
  listSchedulableDestinationMissionKinds,
} = require("../src/lib/check-lifecycle/topology-registry");

const root = process.cwd();

assert.deepEqual(
  listLifecycleDestinationKeys().sort(),
  ["classscout", "compare"],
  "lifecycle registry must include ClassScout and Compare destinations",
);

assert.equal(
  CORE_UNIT_PIPELINE_JOBS.includes("DESTINATION_MISSION_DAEMON"),
  false,
  "base Unit jobs should not force a destination daemon without an active destination",
);

assert.deepEqual(
  getDestinationDaemonJobIdentity(),
  {
    jobType: "DESTINATION_MISSION_DAEMON",
    entityType: "DESTINATION_SERVICE",
    entityId: "destination-service",
  },
  "destination daemon identity must be destination-agnostic",
);

assert.equal(
  getLegacyDestinationDaemonJobIdentities().some((identity) => identity.entityId === "classscout"),
  true,
  "legacy ClassScout daemon identity must be declared for migration/reconciliation",
);

assert.deepEqual(
  getDestinationMissionKinds("classscout"),
  ["rulebook_new_listing"],
  "ClassScout must keep the legacy rulebook mission kind",
);

assert.deepEqual(
  getDestinationMissionKinds("compare"),
  ["VISITOR_CONTENT_CURATION"],
  "Compare must use the Visitor content curation mission kind",
);

assert.deepEqual(
  getDestinationMissionKinds("compare", { includeLegacy: true }).sort(),
  ["VISITOR_CONTENT_CURATION", "rulebook_new_listing"].sort(),
  "Compare must declare legacy mission compatibility for migration",
);

assert.equal(
  listSchedulableDestinationMissionKinds().includes("VISITOR_CONTENT_CURATION"),
  true,
  "queue sync must see Compare Visitor missions as schedulable",
);

const compareTopology = getDestinationTopology("compare");
assert.equal(compareTopology.blockId, "miniapp", "Compare must remain a Miniapp destination");
assert.equal(
  compareTopology.requiredHealthGates.includes("feedback_policy_applied"),
  true,
  "Compare lifecycle must include feedback policy health",
);

const compareRequirements = getUnitLifecycleRequirements({ destinationKeys: ["compare"] });
assert.equal(
  compareRequirements.requiredPipelineJobs.includes("DESTINATION_MISSION_DAEMON"),
  true,
  "Unit with Compare enabled must require the destination daemon job",
);
assert.equal(
  compareRequirements.requiredMissionKinds.includes("VISITOR_CONTENT_CURATION"),
  true,
  "Unit with Compare enabled must require Visitor content curation missions",
);

const pipelineQueueSource = readFileSync(join(root, "src/lib/pipeline-queue.js"), "utf8");
assert.match(
  pipelineQueueSource,
  /listSchedulableDestinationMissionKinds/,
  "pipeline queue must discover destination mission kinds from lifecycle topology",
);
assert.doesNotMatch(
  pipelineQueueSource,
  /missionKind:\s*"rulebook_new_listing"/,
  "pipeline queue daemon sync must not be hardcoded to only rulebook_new_listing",
);
assert.doesNotMatch(
  pipelineQueueSource,
  /entityId:\s*"classscout"/,
  "pipeline queue daemon sync must not create ClassScout-only daemon identity",
);

const daemonSource = readFileSync(join(root, "src/lib/destination-mission-daemon.ts"), "utf8");
assert.match(
  daemonSource,
  /getDestinationMissionKinds/,
  "destination mission daemon must resolve mission kinds through lifecycle topology",
);
assert.doesNotMatch(
  daemonSource,
  /missionKind:\s*"rulebook_new_listing"/,
  "destination mission daemon execution must not be hardcoded to only rulebook_new_listing",
);

console.log("Lifecycle topology contract tests passed.");
