export const DESTINATION_KEYS = ["classscout", "compare"] as const;

export type DestinationKey = (typeof DESTINATION_KEYS)[number];

export type DestinationWorkflowReviewState = "DRAFTED" | "VALIDATED" | "REVIEW_REQUIRED" | "APPROVED" | "REJECTED";

export type DestinationArtifactType =
  | "sourceDocument"
  | "sourceAsset"
  | "candidate"
  | "factSnapshot"
  | "draft";

export interface DestinationSourceDocumentInput {
  companyId: string;
  destinationKey: DestinationKey;
  workflowRunId?: string;
  sourceUrl?: string | null;
  sourceType: string;
  officialnessScore?: number | null;
  contentHash?: string | null;
  httpStatus?: number | null;
  rawText: string;
  metadata?: Record<string, unknown> | null;
  fetchedAt?: string | null;
}

export interface DestinationCandidateInput {
  companyId: string;
  destinationKey: DestinationKey;
  workflowRunId?: string;
  candidateFingerprint?: string;
  canonicalSourceUrl: string;
  proposedType?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DestinationFactSnapshotInput {
  companyId: string;
  destinationKey: DestinationKey;
  candidateId: string;
  factsJson: Record<string, unknown>;
  provenanceJson: Record<string, unknown>;
  extractorVersion: string;
}

export interface DestinationDraftInput {
  companyId: string;
  destinationKey: DestinationKey;
  candidateId: string;
  adapterVersion: string;
  draftJson: Record<string, unknown>;
  provenanceJson: Record<string, unknown>;
  basedOnFactSnapshotId?: string | null;
  reviewState?: DestinationWorkflowReviewState;
}

export interface DestinationArtifactLinkInput {
  companyId: string;
  destinationKey: DestinationKey;
  parentType: DestinationArtifactType;
  parentId: string;
  childType: DestinationArtifactType;
  childId: string;
  relationshipType: string;
  metadata?: Record<string, unknown> | null;
}
