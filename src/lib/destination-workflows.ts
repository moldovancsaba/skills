import crypto from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  DestinationArtifactLinkInput,
  DestinationCandidateInput,
  DestinationDraftInput,
  DestinationFactSnapshotInput,
  DestinationKey,
  DestinationSourceDocumentInput,
} from "@/lib/destination-workflow-contract";
import { DestinationWorkflowState } from "@prisma/client";

const DEFAULT_AUTH_REF = "ingest-secret-managed";

function normalizeDestinationName(destinationKey: DestinationKey) {
  return destinationKey === "classscout" ? "ClassScout" : destinationKey;
}

function normalizeJsonRecord(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue {
  return ((value && Object.keys(value).length > 0 ? value : {}) as Prisma.InputJsonValue);
}

function normalizeRequiredJsonRecord(value: Record<string, unknown>): Prisma.InputJsonValue {
  return (value as Prisma.InputJsonValue);
}

function normalizeIsoDate(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function buildFingerprint(parts: unknown[]) {
  const serialized = JSON.stringify(parts);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export function buildCandidateFingerprint(input: Pick<DestinationCandidateInput, "canonicalSourceUrl" | "proposedType">) {
  return buildFingerprint([input.canonicalSourceUrl.trim().toLowerCase(), input.proposedType ?? "unknown"]);
}

export async function getActiveDestinationInstance(companyId: string, destinationKey: DestinationKey) {
  return prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function ensureDestinationInstance(companyId: string, destinationKey: DestinationKey) {
  const existing = await getActiveDestinationInstance(companyId, destinationKey);
  if (existing) return existing;
  const inactive = await prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey, isActive: false },
    orderBy: { updatedAt: "desc" },
  });
  if (inactive) {
    return prisma.destinationInstance.update({
      where: { id: inactive.id },
      data: {
        isActive: true,
        config: normalizeJsonRecord({
          ...(inactive.config && typeof inactive.config === "object" && !Array.isArray(inactive.config)
            ? inactive.config as Record<string, unknown>
            : {}),
          reactivatedAt: new Date().toISOString(),
          reactivatedBy: "destination-workflows.ensureDestinationInstance",
        }),
      },
    });
  }
  return prisma.destinationInstance.create({
    data: {
      companyId,
      destinationKey,
      name: normalizeDestinationName(destinationKey),
      authRef: DEFAULT_AUTH_REF,
      config: {},
    },
  });
}

export async function createDestinationWorkflowRun(input: {
  companyId: string;
  destinationKey: DestinationKey;
  workflowKind: string;
  currentStage: string;
  metadata?: Record<string, unknown> | null;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  return prisma.destinationWorkflowRun.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      workflowKind: input.workflowKind,
      state: DestinationWorkflowState.DISCOVERED,
      currentStage: input.currentStage,
      metadata: normalizeJsonRecord(input.metadata),
    },
  });
}

export async function upsertDestinationSourceDocument(input: DestinationSourceDocumentInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const existing = await prisma.destinationSourceDocument.findFirst({
    where: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      sourceUrl: input.sourceUrl ?? undefined,
      contentHash: input.contentHash ?? undefined,
    },
    orderBy: { updatedAt: "desc" },
  });

  const data = {
    workflowRunId: input.workflowRunId,
    sourceUrl: input.sourceUrl ?? null,
    sourceType: input.sourceType,
    officialnessScore: input.officialnessScore ?? null,
    contentHash: input.contentHash ?? null,
    httpStatus: input.httpStatus ?? null,
    rawText: input.rawText,
    metadata: normalizeJsonRecord(input.metadata),
    fetchedAt: normalizeIsoDate(input.fetchedAt),
  };

  if (existing) {
    return prisma.destinationSourceDocument.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.destinationSourceDocument.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      ...data,
    },
  });
}

export async function upsertDestinationCandidate(input: DestinationCandidateInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const fingerprint = input.candidateFingerprint || buildCandidateFingerprint(input);
  const existing = await prisma.destinationCandidate.findUnique({
    where: {
      companyId_destinationInstanceId_candidateFingerprint: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        candidateFingerprint: fingerprint,
      },
    },
  });

  const data = {
    workflowRunId: input.workflowRunId,
    canonicalSourceUrl: input.canonicalSourceUrl,
    proposedType: input.proposedType ?? null,
    metadata: normalizeJsonRecord(input.metadata),
    status: existing?.status ?? DestinationWorkflowState.DISCOVERED,
  };

  if (existing) {
    return prisma.destinationCandidate.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.destinationCandidate.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      candidateFingerprint: fingerprint,
      dedupeStatus: "UNKNOWN",
      ...data,
    },
  });
}

export async function createDestinationFactSnapshot(input: DestinationFactSnapshotInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const latest = await prisma.destinationFactSnapshot.findFirst({
    where: { candidateId: input.candidateId },
    orderBy: { version: "desc" },
  });
  const created = await prisma.destinationFactSnapshot.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      candidateId: input.candidateId,
      version: (latest?.version ?? 0) + 1,
      factsJson: normalizeRequiredJsonRecord(input.factsJson),
      provenanceJson: normalizeRequiredJsonRecord(input.provenanceJson),
      extractorVersion: input.extractorVersion,
    },
  });

  await prisma.destinationCandidate.update({
    where: { id: input.candidateId },
    data: {
      latestFactSnapshotId: created.id,
      status: DestinationWorkflowState.INGESTED,
    },
  });

  return created;
}

export async function createDestinationDraft(input: DestinationDraftInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const latest = await prisma.destinationDraft.findFirst({
    where: { candidateId: input.candidateId },
    orderBy: { version: "desc" },
  });
  const created = await prisma.destinationDraft.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      candidateId: input.candidateId,
      version: (latest?.version ?? 0) + 1,
      destinationKey: input.destinationKey,
      adapterVersion: input.adapterVersion,
      draftJson: normalizeRequiredJsonRecord(input.draftJson),
      provenanceJson: normalizeRequiredJsonRecord(input.provenanceJson),
      basedOnFactSnapshotId: input.basedOnFactSnapshotId ?? null,
      reviewState: input.reviewState ?? "DRAFTED",
    },
  });

  await prisma.destinationCandidate.update({
    where: { id: input.candidateId },
    data: {
      latestDraftId: created.id,
      status:
        input.reviewState === "APPROVED"
          ? DestinationWorkflowState.APPROVED
          : input.reviewState === "REJECTED"
            ? DestinationWorkflowState.REJECTED
            : DestinationWorkflowState.DRAFTED,
    },
  });

  return created;
}

export async function linkDestinationArtifacts(input: DestinationArtifactLinkInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const existing = await prisma.destinationArtifactLink.findUnique({
    where: {
      companyId_destinationInstanceId_parentType_parentId_childType_childId_relationshipType: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        parentType: input.parentType,
        parentId: input.parentId,
        childType: input.childType,
        childId: input.childId,
        relationshipType: input.relationshipType,
      },
    },
  });

  if (existing) return existing;

  return prisma.destinationArtifactLink.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      parentType: input.parentType,
      parentId: input.parentId,
      childType: input.childType,
      childId: input.childId,
      relationshipType: input.relationshipType,
      metadata: normalizeJsonRecord(input.metadata),
    },
  });
}

export async function getDestinationCandidateGraph(companyId: string, candidateId: string) {
  const candidate = await prisma.destinationCandidate.findFirst({
    where: { id: candidateId, companyId },
  });
  if (!candidate) return null;

  const [factSnapshots, drafts, artifactLinks] = await Promise.all([
    prisma.destinationFactSnapshot.findMany({
      where: { candidateId },
      orderBy: { version: "asc" },
    }),
    prisma.destinationDraft.findMany({
      where: { candidateId },
      orderBy: { version: "asc" },
    }),
    prisma.destinationArtifactLink.findMany({
      where: {
        companyId,
        OR: [
          { parentId: candidateId, parentType: "candidate" },
          { childId: candidateId, childType: "candidate" },
        ],
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    candidate,
    factSnapshots,
    drafts,
    artifactLinks,
  };
}

export async function listDestinationCandidatesForWorkflow(companyId: string, workflowRunId: string) {
  return prisma.destinationCandidate.findMany({
    where: { companyId, workflowRunId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
    include: {
      factSnapshots: { orderBy: { version: "desc" }, take: 1 },
      drafts: { orderBy: { version: "desc" }, take: 1 },
      reviewPackets: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        include: {
          reviewDecisions: { orderBy: { reviewedAt: "desc" }, take: 1 },
          outcomeMemories: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
}
