import { prisma } from "@/lib/db";
import {
  createDestinationDraft,
  createDestinationFactSnapshot,
  createDestinationWorkflowRun,
  ensureDestinationInstance,
  upsertDestinationCandidate,
  upsertDestinationSourceDocument,
} from "@/lib/destination-workflows";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { submitDestinationReviewPacket } from "@/lib/destination-review-bridge";

type LiveListingType = "provider" | "meetupGroup";

export interface LiveListingReference {
  id: string;
  type: LiveListingType;
  title: string;
  canonicalSourceUrl: string;
  websiteUrl?: string | null;
  publicUrl?: string | null;
  adminUrl?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  imageUrl?: string | null;
}

export interface LiveRevisionIntakeInput {
  companyId: string;
  destinationKey: DestinationKey;
  bridgeVersion: string;
  adapterVersion: string;
  liveListing: LiveListingReference;
  factsJson: Record<string, unknown>;
  provenanceJson?: Record<string, unknown> | null;
  draftPayload: Record<string, unknown>;
  evidenceSummary?: Record<string, unknown> | null;
  diagnostics?: Record<string, unknown> | null;
  mediaSummary?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

function buildLiveListingFingerprint(liveListing: LiveListingReference) {
  return `classscout-live:${liveListing.type}:${liveListing.id}`;
}

function buildRevisionFingerprint(input: LiveRevisionIntakeInput) {
  return JSON.stringify([
    input.liveListing.type,
    input.liveListing.id,
    input.liveListing.updatedAt ?? null,
    input.liveListing.publishedAt ?? null,
    input.draftPayload,
  ]);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function packetMatchesLiveListing(
  packet: {
    metadata: unknown;
  },
  liveListing: Pick<LiveListingReference, "id" | "type">,
) {
  const metadata = asRecord(packet.metadata);
  const listing = asRecord(metadata?.liveListing);
  return listing?.id === liveListing.id && listing?.type === liveListing.type;
}

function buildPacketMetadata(input: LiveRevisionIntakeInput, revisionFingerprint: string) {
  return {
    source: "classscout-live-listing-revision",
    entityKind: input.liveListing.type,
    adapterVersion: input.adapterVersion,
    revisionFingerprint,
    liveListing: input.liveListing,
    ...(input.metadata ?? {}),
  };
}

export async function intakeLiveDestinationRevision(input: LiveRevisionIntakeInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const candidateFingerprint = buildLiveListingFingerprint(input.liveListing);
  const revisionFingerprint = buildRevisionFingerprint(input);

  const candidate = await upsertDestinationCandidate({
    companyId: input.companyId,
    destinationKey: input.destinationKey,
    candidateFingerprint,
    canonicalSourceUrl: input.liveListing.canonicalSourceUrl,
    proposedType: input.liveListing.type,
    metadata: {
      liveListing: input.liveListing,
      source: "classscout-live-listing-revision",
      revisionFingerprint,
    },
  });

  const existingPacket = await prisma.destinationReviewPacket.findFirst({
    where: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      candidateId: candidate.id,
      packetState: {
        in: ["AWAITING_REVIEW", "REVIEW_REQUIRED", "APPROVED", "REWORK_REQUESTED"],
      },
    },
    orderBy: { submittedAt: "desc" },
    include: {
      outcomeMemories: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      reviewDecisions: {
        orderBy: { reviewedAt: "desc" },
        take: 1,
      },
    },
  });

  if (existingPacket && packetMatchesLiveListing(existingPacket, input.liveListing)) {
    const metadata = asRecord(existingPacket.metadata);
    if (metadata?.revisionFingerprint === revisionFingerprint) {
      return {
        reused: true,
        workflowRunId: existingPacket.workflowRunId,
        candidateId: existingPacket.candidateId,
        draftId: existingPacket.draftId,
        reviewPacketId: existingPacket.id,
        packetState: existingPacket.packetState,
      };
    }
  }

  const workflowRun = await createDestinationWorkflowRun({
    companyId: input.companyId,
    destinationKey: input.destinationKey,
    workflowKind: "live_listing_revision",
    currentStage: "review_intake",
    metadata: {
      source: "classscout-live-listing-revision",
      liveListing: input.liveListing,
      revisionFingerprint,
    },
  });

  await upsertDestinationSourceDocument({
    companyId: input.companyId,
    destinationKey: input.destinationKey,
    workflowRunId: workflowRun.id,
    sourceUrl: input.liveListing.canonicalSourceUrl,
    sourceType: "LIVE_LISTING_EXPORT",
    rawText: JSON.stringify({
      liveListing: input.liveListing,
      evidenceSummary: input.evidenceSummary ?? {},
    }),
    metadata: {
      liveListing: input.liveListing,
      websiteUrl: input.liveListing.websiteUrl ?? null,
      publicUrl: input.liveListing.publicUrl ?? null,
      adminUrl: input.liveListing.adminUrl ?? null,
    },
  });

  const factSnapshot = await createDestinationFactSnapshot({
    companyId: input.companyId,
    destinationKey: input.destinationKey,
    candidateId: candidate.id,
    factsJson: input.factsJson,
    provenanceJson: {
      source: "classscout-live-listing-export",
      liveListing: input.liveListing,
      ...(input.provenanceJson ?? {}),
    },
    extractorVersion: "classscout-live-listing-export@v1",
  });

  const draft = await createDestinationDraft({
    companyId: input.companyId,
    destinationKey: input.destinationKey,
    candidateId: candidate.id,
    adapterVersion: input.adapterVersion,
    draftJson: input.draftPayload,
    provenanceJson: {
      source: "classscout-live-listing-export",
      liveListing: input.liveListing,
      ...(input.provenanceJson ?? {}),
    },
    basedOnFactSnapshotId: factSnapshot.id,
    reviewState: "REVIEW_REQUIRED",
  });

  const packet = await submitDestinationReviewPacket({
    companyId: input.companyId,
    destinationKey: input.destinationKey,
    workflowRunId: workflowRun.id,
    candidateId: candidate.id,
    draftId: draft.id,
    bridgeVersion: input.bridgeVersion,
    draftPayload: input.draftPayload,
    evidenceSummary: {
      liveListing: input.liveListing,
      ...(input.evidenceSummary ?? {}),
    },
    diagnostics:
      input.diagnostics ?? {
        source: "classscout-live-listing-revision",
        notes: [],
      },
    mediaSummary:
      input.mediaSummary ??
      {
        source: "classscout-live-listing-revision",
        imageUrl: input.liveListing.imageUrl ?? null,
      },
    metadata: buildPacketMetadata(input, revisionFingerprint),
  });

  return {
    reused: false,
    workflowRunId: workflowRun.id,
    candidateId: candidate.id,
    factSnapshotId: factSnapshot.id,
    draftId: draft.id,
    reviewPacketId: packet.id,
    packetState: packet.packetState,
  };
}

export async function getLiveListingRevisionStatus(input: {
  companyId: string;
  destinationKey: DestinationKey;
  listingId: string;
  listingType: LiveListingType;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const packets = await prisma.destinationReviewPacket.findMany({
    where: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
    },
    orderBy: { submittedAt: "desc" },
    take: 50,
    include: {
      reviewDecisions: {
        orderBy: { reviewedAt: "desc" },
        take: 1,
      },
      outcomeMemories: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  const matches = packets.filter((packet) =>
    packetMatchesLiveListing(packet, {
      id: input.listingId,
      type: input.listingType,
    }),
  );

  const latest = matches[0] ?? null;
  return {
    listingId: input.listingId,
    listingType: input.listingType,
    hasActiveRevision: matches.some((packet) =>
      ["AWAITING_REVIEW", "REVIEW_REQUIRED", "APPROVED", "REWORK_REQUESTED"].includes(packet.packetState),
    ),
    latestPacket: latest
      ? {
          id: latest.id,
          packetState: latest.packetState,
          submittedAt: latest.submittedAt,
          workflowRunId: latest.workflowRunId,
          candidateId: latest.candidateId,
          draftId: latest.draftId,
          latestDecision: latest.reviewDecisions[0]
            ? {
                decision: latest.reviewDecisions[0].decision,
                reasonCode: latest.reviewDecisions[0].decisionReasonCode,
                reviewedAt: latest.reviewDecisions[0].reviewedAt,
              }
            : null,
          latestOutcome: latest.outcomeMemories[0]
            ? {
                eventType: latest.outcomeMemories[0].eventType,
                reasonCode: latest.outcomeMemories[0].reasonCode,
                createdAt: latest.outcomeMemories[0].createdAt,
              }
            : null,
          metadata: asRecord(latest.metadata),
        }
      : null,
    packetCount: matches.length,
  };
}
