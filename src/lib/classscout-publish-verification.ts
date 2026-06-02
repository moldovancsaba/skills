import { DestinationMissionState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listClassScoutLiveListings } from "@/lib/destination-classscout";

type ListingType = "provider" | "meetupGroup";

export type PublishVerificationStatus =
  | "queued"
  | "verified"
  | "not_found"
  | "schema_mismatch"
  | "image_invalid"
  | "timeout";

export type PublishVerification = {
  runId: string;
  attemptId: string;
  targetListingType: ListingType;
  targetListingId?: string;
  status: PublishVerificationStatus;
  checkedAt: string;
  attempt: number;
  attemptsMax: number;
  publicRecordId?: string;
  evidence?: {
    requestUrl: string;
    fieldMatches: boolean;
    imageUrlMatch: boolean;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asListingType(value: unknown): ListingType | null {
  return value === "provider" || value === "meetupGroup" ? value : null;
}

function readVerificationHistory(metadata: unknown): PublishVerification[] {
  const record = asRecord(metadata);
  return Array.isArray(record?.publishVerificationHistory)
    ? record.publishVerificationHistory.filter((item): item is PublishVerification => Boolean(asRecord(item)))
    : [];
}

function inferTarget(input: {
  requestTargetListingId?: string | null;
  requestTargetListingType?: ListingType | null;
  requestExpectedTitle?: string | null;
  requestExpectedImageUrl?: string | null;
  mission: NonNullable<Awaited<ReturnType<typeof prisma.destinationMissionRun.findFirst>>>;
  activeAttempt: NonNullable<Awaited<ReturnType<typeof prisma.destinationMissionAttempt.findFirst>>> | null;
}) {
  const missionMetadata = asRecord(input.mission.metadata);
  const attemptMetadata = asRecord(input.activeAttempt?.metadata);
  const outcome = asRecord(attemptMetadata?.outcome);
  const liveListing = asRecord(attemptMetadata?.liveListing) ?? asRecord(outcome?.liveListing) ?? asRecord(missionMetadata?.liveListing);
  const targetListingType =
    input.requestTargetListingType ??
    asListingType(liveListing?.type) ??
    asListingType(liveListing?.listingType) ??
    asListingType(attemptMetadata?.listingType) ??
    asListingType(missionMetadata?.listingType);
  const targetListingId =
    input.requestTargetListingId ??
    (typeof liveListing?.id === "string" ? liveListing.id : null) ??
    (typeof attemptMetadata?.listingId === "string" ? attemptMetadata.listingId : null) ??
    (typeof missionMetadata?.listingId === "string" ? missionMetadata.listingId : null);
  const expectedTitle =
    input.requestExpectedTitle ??
    (typeof liveListing?.title === "string" ? liveListing.title : null) ??
    (typeof attemptMetadata?.title === "string" ? attemptMetadata.title : null) ??
    (typeof missionMetadata?.title === "string" ? missionMetadata.title : null);
  const expectedImageUrl =
    input.requestExpectedImageUrl ??
    (typeof liveListing?.imageUrl === "string" ? liveListing.imageUrl : null) ??
    (typeof attemptMetadata?.imageUrl === "string" ? attemptMetadata.imageUrl : null) ??
    (typeof missionMetadata?.imageUrl === "string" ? missionMetadata.imageUrl : null);

  return { targetListingType, targetListingId, expectedTitle, expectedImageUrl };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function runClassScoutPublishVerificationTick(input: {
  companyId: string;
  missionId: string;
  targetListingId?: string | null;
  targetListingType?: ListingType | null;
  expectedTitle?: string | null;
  expectedImageUrl?: string | null;
  attemptsMax?: number;
}) {
  const mission = await prisma.destinationMissionRun.findFirst({
    where: {
      id: input.missionId,
      companyId: input.companyId,
      destinationKey: "classscout",
    },
  });
  if (!mission) {
    return { ok: false as const, status: 404, error: "Mission run not found" };
  }
  if (mission.state === DestinationMissionState.PUBLISHED_VERIFIED) {
    return {
      ok: true as const,
      terminal: true,
      verification: readVerificationHistory(mission.metadata).at(-1) ?? null,
      run: mission,
    };
  }

  const activeAttempt = mission.activeAttemptId
    ? await prisma.destinationMissionAttempt.findFirst({
        where: { id: mission.activeAttemptId, companyId: input.companyId, missionRunId: mission.id },
      })
    : null;
  const target = inferTarget({
    requestTargetListingId: input.targetListingId,
    requestTargetListingType: input.targetListingType,
    requestExpectedTitle: input.expectedTitle,
    requestExpectedImageUrl: input.expectedImageUrl,
    mission,
    activeAttempt,
  });
  if (!target.targetListingType) {
    return { ok: false as const, status: 422, error: "targetListingType is required or must be inferable" };
  }

  const history = readVerificationHistory(mission.metadata);
  const attempt = history.length + 1;
  const attemptsMax = Math.max(1, Math.min(input.attemptsMax ?? 3, 10));
  const requestUrl = `/api/destination-review/live-listings?companyId=${encodeURIComponent(input.companyId)}&destinationKey=classscout&listingType=${target.targetListingType}`;
  const listingResult = await listClassScoutLiveListings({
    companyId: input.companyId,
    listingType: target.targetListingType,
  });
  if (!listingResult.ok) {
    return { ok: false as const, status: listingResult.status, error: listingResult.error ?? "ClassScout public listing fetch failed" };
  }

  const publicRecord = Array.isArray(listingResult.items)
    ? listingResult.items.find((item) =>
        target.targetListingId
          ? item.id === target.targetListingId
          : target.expectedTitle
            ? normalizeText(item.title) === normalizeText(target.expectedTitle)
            : false,
      )
    : null;
  const fieldMatches = Boolean(publicRecord && (!target.expectedTitle || normalizeText(publicRecord.title) === normalizeText(target.expectedTitle)));
  const imageUrlMatch = Boolean(publicRecord && (!target.expectedImageUrl || publicRecord.imageUrl === target.expectedImageUrl));
  const status: PublishVerificationStatus = !publicRecord
    ? (attempt >= attemptsMax ? "timeout" : "not_found")
    : !fieldMatches
      ? "schema_mismatch"
      : !imageUrlMatch
        ? "image_invalid"
        : "verified";
  const verification: PublishVerification = {
    runId: mission.id,
    attemptId: activeAttempt?.id ?? mission.activeAttemptId ?? "unknown",
    targetListingType: target.targetListingType,
    ...(target.targetListingId ? { targetListingId: target.targetListingId } : {}),
    status,
    checkedAt: new Date().toISOString(),
    attempt,
    attemptsMax,
    ...(publicRecord?.id ? { publicRecordId: publicRecord.id } : {}),
    evidence: {
      requestUrl,
      fieldMatches,
      imageUrlMatch,
    },
  };
  const nextHistory = [...history, verification].slice(-10);
  const nextMetadata = {
    ...(asRecord(mission.metadata) ?? {}),
    publishVerification: verification,
    publishVerificationHistory: nextHistory,
  };

  if (status === "verified") {
    const run = await prisma.destinationMissionRun.update({
      where: { id: mission.id },
      data: {
        state: DestinationMissionState.PUBLISHED_VERIFIED,
        successCandidateId: activeAttempt?.candidateId ?? mission.successCandidateId,
        failureCode: null,
        failureDetail: null,
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
      include: {
        policySnapshot: true,
        missionDefinition: true,
        missionDefinitionRevision: true,
        attempts: { orderBy: { ordinal: "asc" } },
      },
    });
    return { ok: true as const, terminal: true, verification, run };
  }

  const shouldFailRecoverably = attempt >= attemptsMax || status === "schema_mismatch" || status === "image_invalid";
  const run = await prisma.destinationMissionRun.update({
    where: { id: mission.id },
    data: {
      state: shouldFailRecoverably ? DestinationMissionState.FAILED_RECOVERABLE : mission.state,
      failureCode: shouldFailRecoverably ? `publish_verification_${status}` : mission.failureCode,
      failureDetail: shouldFailRecoverably
        ? `ClassScout publish verification did not pass: ${status}.`
        : mission.failureDetail,
      metadata: nextMetadata as Prisma.InputJsonValue,
    },
    include: {
      policySnapshot: true,
      missionDefinition: true,
      missionDefinitionRevision: true,
      attempts: { orderBy: { ordinal: "asc" } },
    },
  });

  return { ok: true as const, terminal: shouldFailRecoverably, verification, run };
}
