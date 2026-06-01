import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { getVisitorTaxonomy, requireActiveVisitorBlueprint, resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import {
  createDestinationDraft,
  createDestinationFactSnapshot,
  createDestinationWorkflowRun,
  ensureDestinationInstance,
} from "@/lib/destination-workflows";
import { listVisitorSourceDatacards } from "@/lib/visitor-source-graph";
import { evaluateVisitorQualityGate } from "@/lib/visitor-quality-gate";
import { submitDestinationReviewPacket } from "@/lib/destination-review-bridge";
import { listVisitorFeedbackMemory } from "@/lib/visitor-learning";
import { DestinationWorkflowState } from "@prisma/client";

export const VISITOR_CANDIDATE_STATES = [
  "DISCOVERED",
  "SOURCE_FETCHED",
  "FACTS_EXTRACTED",
  "CLASSIFIED",
  "SCORED",
  "NEEDS_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "PUBLIC_VERIFIED",
  "REJECTED",
  "REWORK_REQUIRED",
  "RETIRED",
] as const;

export type VisitorCandidateState = (typeof VISITOR_CANDIDATE_STATES)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeVisitorKey(value: string) {
  return value.trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function hasSuspiciousCopy(value: unknown) {
  const text = asString(value).toLowerCase();
  if (!text) return false;
  return [
    "source-backed",
    "source backed",
    "check local",
    "source verified",
    "source backed listing",
    "should refresh",
    "should be refreshed",
    "should update",
    "before showing",
    "before publishing",
    "published this",
    "this listing is",
    "intentionally marked",
    "not yet extracted",
    "not stable",
    "published by check local",
    "compare listing",
    "should not be shown",
  ].some((token) => text.includes(token));
}

function sanitizeCopyText(value: unknown, fallback: string) {
  const text = asString(value);
  if (!text) return fallback;
  const cleaned = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !hasSuspiciousCopy(sentence))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned && !hasSuspiciousCopy(cleaned) ? cleaned : fallback;
}

function sanitizeComparePayload(input: unknown) {
  const safe = asRecord(input) ?? {};
  const fallbackBadge = "Verified";
  const fallbackShort = `Verified listing for ${asString(safe.name)}.`;
  const fallbackLong = `Listing for ${asString(safe.name)}. Source: ${asString(safe.website) || ""}`.trim();
  const safePayload = { ...safe };
  const shortLegacy = asString(safePayload.short);
  const longLegacy = asString(safePayload.long);
  const announcementBadge = asString(safePayload.announcementBadge) || asString(safePayload.badge) || fallbackBadge;
  const shortDescription = asString(safePayload.shortDescription) || shortLegacy || fallbackShort;
  const longDescription = asString(safePayload.longDescription) || longLegacy || fallbackLong;
  safePayload.announcementBadge = sanitizeCopyText(announcementBadge, fallbackBadge);
  safePayload.shortDescription = sanitizeCopyText(shortDescription, fallbackShort);
  safePayload.longDescription = sanitizeCopyText(longDescription, fallbackLong);
  if (safePayload.announcementBadge === "") safePayload.announcementBadge = fallbackBadge;
  if (safePayload.shortDescription === "") safePayload.shortDescription = fallbackShort;
  if (safePayload.longDescription === "") safePayload.longDescription = fallbackLong;
  if (safePayload.badge && !safePayload.announcementBadge) delete safePayload.badge;
  if (safePayload.short && !safePayload.shortDescription) delete safePayload.short;
  if (safePayload.long && !safePayload.longDescription) delete safePayload.long;
  return safePayload;
}

function readCandidateState(metadata: unknown): VisitorCandidateState {
  const state = asString(asRecord(metadata)?.visitorCandidateState).toUpperCase();
  if ((VISITOR_CANDIDATE_STATES as readonly string[]).includes(state)) return state as VisitorCandidateState;
  return "DISCOVERED";
}

function toWorkflowState(state: VisitorCandidateState): DestinationWorkflowState {
  if (state === "APPROVED") return DestinationWorkflowState.APPROVED;
  if (state === "NEEDS_REVIEW") return DestinationWorkflowState.REVIEW_REQUIRED;
  if (state === "REJECTED" || state === "RETIRED") return DestinationWorkflowState.REJECTED;
  if (state === "PUBLISHED" || state === "PUBLIC_VERIFIED") return DestinationWorkflowState.PUBLISHED;
  if (state === "REWORK_REQUIRED") return DestinationWorkflowState.FAILED;
  return DestinationWorkflowState.DISCOVERED;
}

function fingerprintFromSource(url: string, visitorKey: string, contentTypeHint?: string) {
  return createHash("sha256")
    .update(`${normalizeVisitorKey(visitorKey)}|${url.trim().toLowerCase()}|${asString(contentTypeHint).toLowerCase()}`)
    .digest("hex");
}

async function getInstance(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  return ensureDestinationInstance(companyId, destinationKey);
}

export async function listVisitorCandidates(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const rows = await prisma.destinationCandidate.findMany({
    where: {
      companyId,
      destinationInstanceId: instance.id,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows.map((row) => {
    const metadata = asRecord(row.metadata) ?? {};
    return {
      id: row.id,
      visitorKey: normalizeVisitorKey(visitorKey),
      status: readCandidateState(metadata),
      canonicalSourceUrl: row.canonicalSourceUrl,
      proposedType: row.proposedType,
      extractedFacts: asRecord(metadata.extractedFacts) ?? {},
      classification: asRecord(metadata.classification) ?? null,
      qualityScore: asNumber(metadata.qualityScore) || null,
      uncertaintyReasons: asStringArray(metadata.uncertaintyReasons),
      metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function discoverVisitorCandidates(companyId: string, visitorKey: string, limit = 50, destinationKeyHint?: unknown) {
  await requireActiveVisitorBlueprint(companyId, visitorKey, destinationKeyHint);
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const datacards = await listVisitorSourceDatacards(companyId, visitorKey, destinationKeyHint);
  const feedbackRules = await listVisitorFeedbackMemory(companyId, visitorKey, destinationKeyHint);
  const blockedSourceTerms = new Set(
    feedbackRules
      .filter((rule) => rule.action === "downrank_source" || rule.action === "forbid_mapping")
      .map((rule) => asString(rule.sourceTerm).toLowerCase())
      .filter(Boolean),
  );
  const eligible = datacards
    .filter((card) => card.datacardType === "source_datacard" || card.datacardType === "trusted_source_datacard")
    .filter((card) => card.trustTier !== "blocked")
    .filter((card) => {
      const searchable = `${card.canonicalUrl} ${card.url}`.toLowerCase();
      for (const blockedTerm of blockedSourceTerms) {
        if (searchable.includes(blockedTerm)) return false;
      }
      return true;
    })
    .slice(0, Math.max(1, Math.min(limit, 200)));

  const createdIds: string[] = [];
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  const shouldSanitizeComparePayload = destinationKey === "compare";
  for (const card of eligible) {
    const fingerprint = fingerprintFromSource(card.canonicalUrl, visitorKey);
    const existing = await prisma.destinationCandidate.findFirst({
      where: {
        companyId,
        destinationInstanceId: instance.id,
        candidateFingerprint: fingerprint,
      },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) continue;
    const draftPayload = asRecord(card.publicDraftPayload);
    const payloadForMetadata = shouldSanitizeComparePayload ? sanitizeComparePayload(draftPayload) : draftPayload;
    const sourceFacts = asRecord(card.extractedFacts);
    const draftName = asString(draftPayload?.name);
    const draftLocation = [asString(draftPayload?.neighborhood), asString(draftPayload?.borough)].filter(Boolean).join(", ");
    const candidate = await prisma.destinationCandidate.create({
      data: {
        companyId,
        destinationInstanceId: instance.id,
        candidateFingerprint: fingerprint,
        canonicalSourceUrl: card.canonicalUrl,
        proposedType: card.knownContentTypes[0] ?? "unknown",
        status: DestinationWorkflowState.DISCOVERED,
        metadata: {
          visitorKey: normalizeVisitorKey(visitorKey),
          visitorCandidateState: "DISCOVERED",
          sourceDatacardIds: [card.sourceId],
          sourceTrustTier: card.trustTier,
          sourceKind: card.sourceKind,
          sourceTitle: card.sourceTitle ?? draftName,
          entityKind: card.entityKind,
          adapterVersion: "visitor-public-draft-adapter@v1",
        publicDraftPayload: payloadForMetadata ?? undefined,
          extractedFacts: sourceFacts ?? undefined,
          autoPublishEligible: card.autoPublishEligible === true,
          title: asString(sourceFacts?.title) || draftName,
          provider: asString(sourceFacts?.provider) || draftName,
          location: asString(sourceFacts?.location) || draftLocation,
          discoveredAt: nowIso(),
        } as never,
      },
    });
    createdIds.push(candidate.id);
  }
  return { createdCount: createdIds.length, createdIds };
}

export async function extractVisitorCandidate(companyId: string, visitorKey: string, candidateId: string, destinationKeyHint?: unknown) {
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const row = await prisma.destinationCandidate.findFirst({
    where: { id: candidateId, companyId, destinationInstanceId: instance.id },
  });
  if (!row) return null;
  const metadata = asRecord(row.metadata) ?? {};
  const existingFacts = asRecord(metadata.extractedFacts);
  const draftPayload = asRecord(metadata.publicDraftPayload);
  const facts = {
    sourceUrl: row.canonicalSourceUrl,
    ...(existingFacts ?? {}),
    title: asString(existingFacts?.title) || asString(metadata.name) || asString(metadata.title) || asString(draftPayload?.name) || "",
    provider: asString(existingFacts?.provider) || asString(metadata.provider) || asString(draftPayload?.name) || "",
    location: asString(existingFacts?.location) || asString(metadata.region) || [asString(draftPayload?.neighborhood), asString(draftPayload?.borough)].filter(Boolean).join(", "),
    extractedAt: nowIso(),
  };
  const nextMeta = {
    ...metadata,
    extractedFacts: facts,
    visitorCandidateState: "FACTS_EXTRACTED",
    uncertaintyReasons: Object.values(facts).some((value) => !asString(value)) ? ["missing_fields"] : [],
  };
  await prisma.destinationCandidate.update({
    where: { id: row.id },
    data: {
      status: toWorkflowState("FACTS_EXTRACTED"),
      metadata: nextMeta as never,
    },
  });
  return facts;
}

export async function classifyVisitorCandidate(
  companyId: string,
  visitorKey: string,
  candidateId: string,
  input: { contentType?: string; confidence?: number; forbidden?: boolean; reasons?: string[] } = {},
  destinationKeyHint?: unknown,
) {
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const taxonomy = await getVisitorTaxonomy(companyId, visitorKey, destinationKeyHint);
  const row = await prisma.destinationCandidate.findFirst({
    where: { id: candidateId, companyId, destinationInstanceId: instance.id },
  });
  if (!row) return null;
  const metadata = asRecord(row.metadata) ?? {};
  const feedbackRules = await listVisitorFeedbackMemory(companyId, visitorKey, destinationKeyHint);
  const classification = {
    contentType: asString(input.contentType) || asString(row.proposedType) || "unknown",
    confidence: Math.max(0, Math.min(1, asNumber(input.confidence) || 0.6)),
    forbidden: input.forbidden === true,
    reasons: asStringArray(input.reasons),
    classifiedAt: nowIso(),
  };
  const qualityGate = evaluateVisitorQualityGate({
    taxonomy,
    contentType: classification.contentType,
    sourceUrl: row.canonicalSourceUrl,
    extractedFacts: asRecord(metadata.extractedFacts),
    metadata,
  });
  const forbiddenByFeedbackRule = feedbackRules.some((rule) => {
    if (rule.action !== "forbid_mapping") return false;
    const ruleType = asString(rule.contentType).toLowerCase();
    const ruleSourceTerm = asString(rule.sourceTerm).toLowerCase();
    const typeMatch = ruleType ? ruleType === classification.contentType.toLowerCase() : true;
    const sourceMatch = ruleSourceTerm ? row.canonicalSourceUrl.toLowerCase().includes(ruleSourceTerm) : true;
    return typeMatch && sourceMatch;
  });
  const forbiddenByPolicy = qualityGate.blockingReasons.length > 0;
  const classificationWithPolicy = {
    ...classification,
    forbidden: classification.forbidden || forbiddenByPolicy || forbiddenByFeedbackRule,
    reasons: [
      ...new Set([
        ...classification.reasons,
        ...qualityGate.blockingReasons,
        ...qualityGate.reviewReasons,
        ...(forbiddenByFeedbackRule ? ["blocked_by_feedback_policy"] : []),
      ]),
    ],
  };
  const nextState: VisitorCandidateState = classificationWithPolicy.forbidden ? "REWORK_REQUIRED" : "CLASSIFIED";
  await prisma.destinationCandidate.update({
    where: { id: row.id },
    data: {
      status: toWorkflowState(nextState),
      metadata: {
        ...metadata,
        classification: classificationWithPolicy,
        qualityGate,
        visitorCandidateState: nextState,
      } as never,
    },
  });
  return classificationWithPolicy;
}

export async function scoreVisitorCandidate(
  companyId: string,
  visitorKey: string,
  candidateId: string,
  input: { sourceTrustScore?: number; evidenceCompleteness?: number; taxonomyFit?: number; locationFit?: number; audienceFit?: number } = {},
  destinationKeyHint?: unknown,
) {
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const taxonomy = await getVisitorTaxonomy(companyId, visitorKey, destinationKeyHint);
  const row = await prisma.destinationCandidate.findFirst({
    where: { id: candidateId, companyId, destinationInstanceId: instance.id },
  });
  if (!row) return null;
  const metadata = asRecord(row.metadata) ?? {};
  const sourceTrustScore = Math.max(0, Math.min(1, asNumber(input.sourceTrustScore) || 0.5));
  const evidenceCompleteness = Math.max(0, Math.min(1, asNumber(input.evidenceCompleteness) || 0.5));
  const taxonomyFit = Math.max(0, Math.min(1, asNumber(input.taxonomyFit) || 0.5));
  const locationFit = Math.max(0, Math.min(1, asNumber(input.locationFit) || 0.5));
  const audienceFit = Math.max(0, Math.min(1, asNumber(input.audienceFit) || 0.5));
  const qualityScore =
    0.3 * sourceTrustScore +
    0.3 * evidenceCompleteness +
    0.2 * taxonomyFit +
    0.1 * locationFit +
    0.1 * audienceFit;
  const qualityGate = evaluateVisitorQualityGate({
    taxonomy,
    contentType: asString(asRecord(metadata.classification)?.contentType || row.proposedType),
    sourceUrl: row.canonicalSourceUrl,
    extractedFacts: asRecord(metadata.extractedFacts),
    metadata,
  });
  const nextState: VisitorCandidateState = qualityGate.blockingReasons.length > 0
    ? "REWORK_REQUIRED"
    : qualityScore >= 0.55
      ? "NEEDS_REVIEW"
      : "REWORK_REQUIRED";
  await prisma.destinationCandidate.update({
    where: { id: row.id },
    data: {
      status: toWorkflowState(nextState),
      metadata: {
        ...metadata,
        qualityScore: Number(qualityScore.toFixed(4)),
        qualitySignals: {
          sourceTrustScore,
          evidenceCompleteness,
          taxonomyFit,
          locationFit,
          audienceFit,
        },
        qualityGate,
        visitorCandidateState: nextState,
      } as never,
    },
  });
  return {
    qualityScore: Number(qualityScore.toFixed(4)),
    state: nextState,
    qualityGate,
  };
}

export async function prepareVisitorReviewPacket(companyId: string, visitorKey: string, candidateId: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const row = await prisma.destinationCandidate.findFirst({
    where: { id: candidateId, companyId, destinationInstanceId: instance.id },
    include: {
      reviewPackets: {
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!row) return null;
  const metadata = asRecord(row.metadata) ?? {};
  let packet = row.reviewPackets[0] ?? null;
  if (!packet) {
    const existingRun = row.workflowRunId
      ? await prisma.destinationWorkflowRun.findFirst({
          where: { id: row.workflowRunId, companyId },
        })
      : null;
    const workflowRun =
      existingRun ??
      (await createDestinationWorkflowRun({
        companyId,
        destinationKey,
        workflowKind: "VISITOR_REVIEW_PREP",
        currentStage: "PREPARE_REVIEW",
        metadata: {
          visitorKey: normalizeVisitorKey(visitorKey),
          candidateId: row.id,
        },
      }));

    const facts = asRecord(metadata.extractedFacts) ?? {
      sourceUrl: row.canonicalSourceUrl,
      extractedAt: nowIso(),
    };
    const factSnapshot = await createDestinationFactSnapshot({
      companyId,
      destinationKey,
      candidateId: row.id,
      factsJson: facts,
      provenanceJson: {
        source: "visitor-candidate-pipeline",
        visitorKey: normalizeVisitorKey(visitorKey),
      },
      extractorVersion: "visitor-extractor@v1",
    });

    const publicDraftPayload = asRecord(metadata.publicDraftPayload);
    const draftPayload = publicDraftPayload ?? {
      contentType: asString(asRecord(metadata.classification)?.contentType || row.proposedType || "unknown"),
      sourceUrl: row.canonicalSourceUrl,
      title: asString(facts.title),
      provider: asString(facts.provider),
      location: asString(facts.location),
    };
    const draft = await createDestinationDraft({
      companyId,
      destinationKey,
      candidateId: row.id,
      adapterVersion: asString(metadata.adapterVersion) || "visitor-draft-adapter@v1",
      draftJson: draftPayload,
      provenanceJson: {
        source: "visitor-candidate-pipeline",
        visitorKey: normalizeVisitorKey(visitorKey),
      },
      basedOnFactSnapshotId: factSnapshot.id,
      reviewState: "DRAFTED",
    });

    packet = await submitDestinationReviewPacket({
      companyId,
      destinationKey,
      workflowRunId: workflowRun.id,
      candidateId: row.id,
      draftId: draft.id,
      bridgeVersion: "visitor-review-bridge@v1",
      evidenceSummary: {
        sourceUrl: row.canonicalSourceUrl,
        sourceTrustTier: asString(metadata.sourceTrustTier),
        qualityScore: asNumber(metadata.qualityScore) || null,
      },
      diagnostics: {
        uncertaintyReasons: asStringArray(metadata.uncertaintyReasons),
      },
      mediaSummary: {},
      draftPayload: asRecord(draft.draftJson) ?? {},
      metadata: {
        visitorKey: normalizeVisitorKey(visitorKey),
        entityKind: asString(metadata.entityKind) || undefined,
        adapterVersion: asString(metadata.adapterVersion) || "visitor-draft-adapter@v1",
        autoPublishEligible: metadata.autoPublishEligible === true,
      },
    });
  }
  await prisma.destinationCandidate.update({
    where: { id: row.id },
    data: {
      status: DestinationWorkflowState.REVIEW_REQUIRED,
      metadata: {
        ...metadata,
        visitorCandidateState: "NEEDS_REVIEW",
        reviewPreparedAt: nowIso(),
      } as never,
    },
  });
  return {
    candidateId: row.id,
    latestReviewPacketId: packet.id,
    latestReviewPacketState: packet.packetState,
  };
}
