import type { DestinationKey } from "@/lib/destination-workflow-contract";

export const LIFECYCLE_TOPOLOGY_REGISTRY_VERSION: 1;
export const CORE_UNIT_PIPELINE_JOBS: readonly string[];

export type DestinationTopology = {
  destinationKey: DestinationKey;
  label: string;
  blockId: string;
  requiredModules: readonly string[];
  missionKinds: readonly string[];
  legacyMissionKinds?: readonly string[];
  requiredDaemonLane: {
    jobType: "DESTINATION_MISSION_DAEMON";
    entityType: "DESTINATION_SERVICE";
    entityId: "destination-service";
  };
  requiredHealthGates: readonly string[];
};

export const DESTINATION_TOPOLOGY: Readonly<Record<DestinationKey, DestinationTopology>>;

export function getDestinationDaemonJobIdentity(): {
  jobType: "DESTINATION_MISSION_DAEMON";
  entityType: "DESTINATION_SERVICE";
  entityId: "destination-service";
};

export function getDestinationMissionKinds(destinationKey: DestinationKey | string, options?: { includeLegacy?: boolean }): string[];
export function getDestinationTopology(destinationKey: DestinationKey | string): DestinationTopology | null;
export function getLegacyDestinationDaemonJobIdentities(): Array<{
  jobType: "DESTINATION_MISSION_DAEMON";
  entityType: "DESTINATION_SERVICE";
  entityId: string;
}>;
export function getUnitLifecycleRequirements(profile?: { destinationKeys?: string[] }): {
  schemaVersion: 1;
  unit: { requiredPipelineJobs: readonly string[] };
  destinations: DestinationTopology[];
  requiredPipelineJobs: string[];
  requiredMissionKinds: string[];
  requiredHealthGates: string[];
};
export function listLifecycleDestinationKeys(): DestinationKey[];
export function listSchedulableDestinationMissionKinds(): string[];
