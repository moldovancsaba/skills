export const DESTINATION_MISSION_KINDS = ["rulebook_new_listing"] as const;

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

export type DestinationMissionAttemptOutcome = {
  terminalKind: "rejected" | "retryable_failure" | "review_ready" | "published_verified" | "publish_failed";
  rejectionCode?: string;
  rejectionDetail?: string;
  retryAfterMs?: number;
  retryBudgetRemaining?: number;
  domainRetryCount?: number;
  candidateDomain?: string;
};

export const DEFAULT_CLASSSCOUT_RULEBOOK_POLICY: DestinationRulebookPolicySnapshot = {
  version: "classscout-rulebook@v1",
  executionMode: "manual",
  minimumScarcityScore: 70,
  allowedListingTypes: [
    "Classes",
    "Camps",
    "Birthday Parties",
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
