const LIFECYCLE_TOPOLOGY_REGISTRY_VERSION = 1;

const CORE_UNIT_PIPELINE_JOBS = Object.freeze([
  "FEEDBACK_RECONCILIATION",
  "CARD_RESCORING",
  "FRONTIER_RECOMPUTE",
  "SCORE_ALERT_REPAIR",
  "ENSURE_FLASHCARD_MINIMUM",
  "RESEARCH_BACKFILL",
  "ENSURE_IDEABANK_MINIMUM",
  "ENSURE_ROADMAP_MINIMUM",
  "ENSURE_BACKLOG_MINIMUM",
  "ENSURE_TODO_MINIMUM",
  "ENSURE_CHECKLIST_MINIMUM",
  "MINE_FLASHCARD_OPPORTUNITIES",
  "MINE_TASK_OPPORTUNITIES",
  "MINE_OPPORTUNITYCARDS",
  "SEARCH_OPPORTUNITYCARDS",
  "FEEDBACK_PRESSURE_REGENERATION",
  "REFRESH_FLASHCARDS",
  "REFRESH_TASKS",
  "REFRESH_OPPORTUNITYCARDS",
  "REFRESH_DATACARDS",
  "REFRESH_GOALS",
]);

const DESTINATION_TOPOLOGY = Object.freeze({
  classscout: Object.freeze({
    destinationKey: "classscout",
    label: "ClassScout",
    blockId: "miniapp",
    requiredModules: Object.freeze(["data", "knowmore", "review", "analytics"]),
    missionKinds: Object.freeze(["rulebook_new_listing"]),
    requiredDaemonLane: Object.freeze({
      jobType: "DESTINATION_MISSION_DAEMON",
      entityType: "DESTINATION_SERVICE",
      entityId: "destination-service",
    }),
    requiredHealthGates: Object.freeze([
      "visitor_blueprint_active",
      "visitor_taxonomy_ready",
      "source_evidence_present",
      "review_packet_ready",
      "public_verification_fresh",
    ]),
  }),
  compare: Object.freeze({
    destinationKey: "compare",
    label: "Compare",
    blockId: "miniapp",
    requiredModules: Object.freeze(["data", "knowmore", "review", "analytics"]),
    missionKinds: Object.freeze(["VISITOR_CONTENT_CURATION"]),
    legacyMissionKinds: Object.freeze(["rulebook_new_listing"]),
    requiredDaemonLane: Object.freeze({
      jobType: "DESTINATION_MISSION_DAEMON",
      entityType: "DESTINATION_SERVICE",
      entityId: "destination-service",
    }),
    requiredHealthGates: Object.freeze([
      "visitor_blueprint_active",
      "visitor_taxonomy_ready",
      "source_evidence_present",
      "feedback_policy_applied",
      "public_verification_fresh",
    ]),
  }),
});

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function listLifecycleDestinationKeys() {
  return Object.keys(DESTINATION_TOPOLOGY);
}

function getDestinationTopology(destinationKey) {
  return DESTINATION_TOPOLOGY[String(destinationKey || "").trim().toLowerCase()] || null;
}

function getDestinationMissionKinds(destinationKey, options = {}) {
  const topology = getDestinationTopology(destinationKey);
  if (!topology) return [];
  const missionKinds = [...topology.missionKinds];
  if (options.includeLegacy === true && Array.isArray(topology.legacyMissionKinds)) {
    missionKinds.push(...topology.legacyMissionKinds);
  }
  return unique(missionKinds);
}

function listSchedulableDestinationMissionKinds() {
  return unique(
    Object.values(DESTINATION_TOPOLOGY).flatMap((topology) => [
      ...topology.missionKinds,
      ...(Array.isArray(topology.legacyMissionKinds) ? topology.legacyMissionKinds : []),
    ]),
  );
}

function getDestinationDaemonJobIdentity() {
  return {
    jobType: "DESTINATION_MISSION_DAEMON",
    entityType: "DESTINATION_SERVICE",
    entityId: "destination-service",
  };
}

function getLegacyDestinationDaemonJobIdentities() {
  return [
    {
      jobType: "DESTINATION_MISSION_DAEMON",
      entityType: "DESTINATION_SERVICE",
      entityId: "classscout",
    },
  ];
}

function getUnitLifecycleRequirements(profile = {}) {
  const destinationKeys = unique(profile.destinationKeys || []);
  const destinations = destinationKeys
    .map((destinationKey) => getDestinationTopology(destinationKey))
    .filter(Boolean);

  return {
    schemaVersion: LIFECYCLE_TOPOLOGY_REGISTRY_VERSION,
    unit: {
      requiredPipelineJobs: CORE_UNIT_PIPELINE_JOBS,
    },
    destinations,
    requiredPipelineJobs: unique([
      ...CORE_UNIT_PIPELINE_JOBS,
      ...(destinations.length > 0 ? ["DESTINATION_MISSION_DAEMON"] : []),
    ]),
    requiredMissionKinds: unique(destinations.flatMap((destination) => destination.missionKinds)),
    requiredHealthGates: unique(destinations.flatMap((destination) => destination.requiredHealthGates)),
  };
}

module.exports = {
  LIFECYCLE_TOPOLOGY_REGISTRY_VERSION,
  CORE_UNIT_PIPELINE_JOBS,
  DESTINATION_TOPOLOGY,
  getDestinationDaemonJobIdentity,
  getDestinationMissionKinds,
  getDestinationTopology,
  getLegacyDestinationDaemonJobIdentities,
  getUnitLifecycleRequirements,
  listLifecycleDestinationKeys,
  listSchedulableDestinationMissionKinds,
};
