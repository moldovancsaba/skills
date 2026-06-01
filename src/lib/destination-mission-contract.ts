export const DESTINATION_MISSION_KINDS = ["rulebook_new_listing", "VISITOR_CONTENT_CURATION"] as const;

export type DestinationMissionKind = (typeof DESTINATION_MISSION_KINDS)[number];

export const DESTINATION_MISSION_STATES = [
  "QUEUED",
  "CATALOG_INSPECTED",
  "DISCOVERING",
  "CANDIDATE_IN_REVIEW",
  "PUBLISHING",
  "PUBLISHED_VERIFIED",
  "FAILED_RECOVERABLE",
  "FAILED_TERMINAL",
  "EXHAUSTED",
  "PAUSED",
] as const;

export type DestinationMissionState = (typeof DESTINATION_MISSION_STATES)[number];

export type DestinationRulebookPolicySnapshot = {
  version: string;
  executionMode: "manual" | "guarded" | "autopilot";
  minimumScarcityScore: number;
  allowedListingTypes: string[];
  requireOfficialSource: boolean;
  requireImgBbImage: boolean;
  requireRecurringProgramsWhenAvailable: boolean;
  maxCandidatesPerMission: number;
  maxDomainRetries: number;
  maxContinuousPasses: number;
  stopCondition: "one_live_verified_listing";
};

export type DestinationMissionCadence = "manual-only" | "scheduled";

export type DestinationMissionDefinitionConfig = {
  version: string;
  geographyScope: {
    boroughs: string[];
    neighborhoods: string[];
  };
  listingTypeScope: string[];
  executionPolicy: {
    mode: "manual" | "guarded" | "autopilot";
    cadence: DestinationMissionCadence;
    cronEnabled: boolean;
    requireHumanPublishApproval: boolean;
  };
  rulebookPolicy: DestinationRulebookPolicySnapshot;
};

export type DestinationMissionAttemptOutcome = {
  terminalKind: "rejected" | "retryable_failure" | "review_ready" | "published_verified" | "publish_failed";
  rejectionCode?: string;
  rejectionDetail?: string;
  retryAfterMs?: number;
  retryBudgetRemaining?: number;
  domainRetryCount?: number;
  candidateDomain?: string;
};

export const DEFAULT_DESTINATION_RULEBOOK_POLICY: DestinationRulebookPolicySnapshot = {
  version: "classscout-rulebook@v1",
  executionMode: "manual",
  minimumScarcityScore: 70,
  allowedListingTypes: [
    "Classes",
    "Camps",
    "Competitions",
    "Drop-In Activities",
    "Meet-Up Groups",
  ],
  requireOfficialSource: true,
  requireImgBbImage: true,
  requireRecurringProgramsWhenAvailable: true,
  maxCandidatesPerMission: 12,
  maxDomainRetries: 2,
  maxContinuousPasses: 3,
  stopCondition: "one_live_verified_listing",
};

export const DEFAULT_COMPARE_RULEBOOK_POLICY: DestinationRulebookPolicySnapshot = {
  version: "compare-visitor-rulebook@v1",
  executionMode: "manual",
  minimumScarcityScore: 70,
  allowedListingTypes: [
    "Shooting Ranges",
    "Sport Shooting Clubs",
    "Shooting Courses",
    "Competitions",
    "Hunting Associations",
    "Hunting Courses",
    "Hunting Expos",
  ],
  requireOfficialSource: true,
  requireImgBbImage: false,
  requireRecurringProgramsWhenAvailable: false,
  maxCandidatesPerMission: 12,
  maxDomainRetries: 2,
  maxContinuousPasses: 3,
  stopCondition: "one_live_verified_listing",
};

export const DEFAULT_DESTINATION_MISSION_DEFINITION: DestinationMissionDefinitionConfig = {
  version: "classscout-mission-definition@v1",
  geographyScope: {
    boroughs: [],
    neighborhoods: [],
  },
  listingTypeScope: [...DEFAULT_DESTINATION_RULEBOOK_POLICY.allowedListingTypes],
  executionPolicy: {
    mode: DEFAULT_DESTINATION_RULEBOOK_POLICY.executionMode,
    cadence: "manual-only",
    cronEnabled: false,
    requireHumanPublishApproval: true,
  },
  rulebookPolicy: { ...DEFAULT_DESTINATION_RULEBOOK_POLICY },
};

export const DEFAULT_CLASSSCOUT_RULEBOOK_POLICY = DEFAULT_DESTINATION_RULEBOOK_POLICY;
export const DEFAULT_CLASSSCOUT_MISSION_DEFINITION = DEFAULT_DESTINATION_MISSION_DEFINITION;

export function getDefaultRulebookPolicyForDestination(destinationKey: string): DestinationRulebookPolicySnapshot {
  return destinationKey === "compare"
    ? { ...DEFAULT_COMPARE_RULEBOOK_POLICY, allowedListingTypes: [...DEFAULT_COMPARE_RULEBOOK_POLICY.allowedListingTypes] }
    : { ...DEFAULT_DESTINATION_RULEBOOK_POLICY, allowedListingTypes: [...DEFAULT_DESTINATION_RULEBOOK_POLICY.allowedListingTypes] };
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

export function normalizeRulebookPolicySnapshot(
  value?: Partial<DestinationRulebookPolicySnapshot> | null,
): DestinationRulebookPolicySnapshot {
  const nextValue = value ?? {};
  return {
    ...DEFAULT_DESTINATION_RULEBOOK_POLICY,
    ...nextValue,
    executionMode:
      nextValue.executionMode === "guarded" || nextValue.executionMode === "autopilot"
        ? nextValue.executionMode
        : DEFAULT_DESTINATION_RULEBOOK_POLICY.executionMode,
    allowedListingTypes:
      cleanStringArray(nextValue.allowedListingTypes).length > 0
        ? cleanStringArray(nextValue.allowedListingTypes)
        : [...DEFAULT_DESTINATION_RULEBOOK_POLICY.allowedListingTypes],
    stopCondition: "one_live_verified_listing",
  };
}

export function normalizeMissionDefinitionConfig(
  value?: Partial<DestinationMissionDefinitionConfig> | null,
): DestinationMissionDefinitionConfig {
  const nextValue = value ?? {};
  const geographyScope =
    nextValue.geographyScope && typeof nextValue.geographyScope === "object" && !Array.isArray(nextValue.geographyScope)
      ? nextValue.geographyScope
      : null;
  const executionPolicy =
    nextValue.executionPolicy && typeof nextValue.executionPolicy === "object" && !Array.isArray(nextValue.executionPolicy)
      ? nextValue.executionPolicy
      : null;
  const rulebookPolicy =
    nextValue.rulebookPolicy && typeof nextValue.rulebookPolicy === "object" && !Array.isArray(nextValue.rulebookPolicy)
      ? nextValue.rulebookPolicy
      : null;

  const normalizedRulebookPolicy = normalizeRulebookPolicySnapshot({
    ...rulebookPolicy,
    allowedListingTypes:
      cleanStringArray(nextValue.listingTypeScope).length > 0
        ? cleanStringArray(nextValue.listingTypeScope)
        : rulebookPolicy?.allowedListingTypes,
    executionMode:
      executionPolicy?.mode === "guarded" || executionPolicy?.mode === "autopilot"
        ? executionPolicy.mode
        : executionPolicy?.mode === "manual"
          ? "manual"
          : rulebookPolicy?.executionMode,
  });

  const listingTypeScope =
    cleanStringArray(nextValue.listingTypeScope).length > 0
      ? cleanStringArray(nextValue.listingTypeScope)
      : [...normalizedRulebookPolicy.allowedListingTypes];

  return {
    version:
      typeof nextValue.version === "string" && nextValue.version.trim()
        ? nextValue.version.trim()
        : DEFAULT_DESTINATION_MISSION_DEFINITION.version,
    geographyScope: {
      boroughs: cleanStringArray(geographyScope?.boroughs),
      neighborhoods: cleanStringArray(geographyScope?.neighborhoods),
    },
    listingTypeScope,
    executionPolicy: {
      mode:
        executionPolicy?.mode === "guarded" || executionPolicy?.mode === "autopilot"
          ? executionPolicy.mode
          : "manual",
      cadence: executionPolicy?.cadence === "scheduled" ? "scheduled" : "manual-only",
      cronEnabled: executionPolicy?.cadence === "scheduled" ? executionPolicy?.cronEnabled !== false : false,
      requireHumanPublishApproval: executionPolicy?.requireHumanPublishApproval !== false,
    },
    rulebookPolicy: {
      ...normalizedRulebookPolicy,
      allowedListingTypes: [...listingTypeScope],
      executionMode:
        executionPolicy?.mode === "guarded" || executionPolicy?.mode === "autopilot"
          ? executionPolicy.mode
          : "manual",
    },
  };
}
