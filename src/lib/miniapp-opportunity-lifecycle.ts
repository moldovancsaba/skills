import "server-only";

import crypto from "crypto";
import { DestinationWorkflowState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { assertMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";
import { MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE, type MiniappEvidenceArtifact } from "@/lib/miniapp-evidence-runtime";
import { contentQualityScoreFromOpportunity } from "@/lib/miniapp-content-quality";

export type MiniappOpportunityStatus = "LEAD" | "CANDIDATE" | "REWORK_REQUIRED";

export type MiniappOpportunityCard = {
  id: string;
  miniappKey: string;
  destinationKey: string;
  contractKey: string;
  evidenceArtifactId: string;
  candidateId?: string;
  sourceUrl: string;
  title: string;
  expectedEvidenceType: string;
  evidenceScore: number;
  sourceAuthorityScore: number;
  candidateScore: number;
  contentQualityScore: number;
  status: MiniappOpportunityStatus;
  blockingReasons: string[];
  createdAt: string;
  updatedAt: string;
};

type PromoteInput = {
  companyId: string;
  visitorKey: string;
  destinationKeyHint?: unknown;
  limit?: number;
};

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

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function readEvidenceArtifact(row: {
  id: string;
  sourceUrl: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): MiniappEvidenceArtifact | null {
  const metadata = asRecord(row.metadata);
  const artifact = asRecord(metadata?.miniappEvidenceArtifact);
  if (!artifact) return null;
  const sourceUrl = normalizeUrl(asString(artifact.sourceUrl) || asString(row.sourceUrl));
  const finalUrl = normalizeUrl(asString(artifact.finalUrl) || sourceUrl);
  if (!sourceUrl && !finalUrl) return null;
  return {
    id: row.id,
    miniappKey: asString(artifact.miniappKey),
    destinationKey: asString(artifact.destinationKey),
    contractKey: asString(artifact.contractKey),
    taskId: asString(artifact.taskId),
    taskFingerprint: asString(artifact.taskFingerprint),
    sourceUrl,
    finalUrl,
    title: asString(artifact.title),
    snippet: asString(artifact.snippet),
    textSnippet: asString(artifact.textSnippet),
    provider: asString(artifact.provider),
    evidenceType: asString(artifact.evidenceType),
    authorityScore: asNumber(artifact.authorityScore),
    relevanceScore: asNumber(artifact.relevanceScore),
    httpStatus: asNumber(artifact.httpStatus),
    status: asString(artifact.status) as MiniappEvidenceArtifact["status"],
    fetchedAt: asString(artifact.fetchedAt) || row.updatedAt.toISOString(),
  };
}

function scoreOpportunity(artifact: MiniappEvidenceArtifact) {
  const evidenceScore = Math.max(0, Math.min(100, artifact.relevanceScore));
  const sourceAuthorityScore = Math.max(0, Math.min(100, artifact.authorityScore));
  const candidateScore = Math.round(evidenceScore * 0.55 + sourceAuthorityScore * 0.45);
  const contentQualityScore = contentQualityScoreFromOpportunity({
    evidenceScore,
    sourceAuthorityScore,
    candidateScore,
  });
  return { evidenceScore, sourceAuthorityScore, candidateScore, contentQualityScore };
}

function buildOpportunity(input: {
  artifact: MiniappEvidenceArtifact;
  candidateId?: string;
  status: MiniappOpportunityStatus;
  blockingReasons: string[];
  nowIso: string;
}) {
  const scores = scoreOpportunity(input.artifact);
  return {
    id: `miopp_${hashValue(`${input.artifact.contractKey}:${input.artifact.finalUrl || input.artifact.sourceUrl}`).slice(0, 24)}`,
    miniappKey: input.artifact.miniappKey,
    destinationKey: input.artifact.destinationKey,
    contractKey: input.artifact.contractKey,
    evidenceArtifactId: input.artifact.id,
    candidateId: input.candidateId,
    sourceUrl: input.artifact.finalUrl || input.artifact.sourceUrl,
    title: input.artifact.title,
    expectedEvidenceType: input.artifact.evidenceType,
    ...scores,
    status: input.status,
    blockingReasons: input.blockingReasons,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  } satisfies MiniappOpportunityCard;
}

async function resolveContext(input: PromoteInput) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(input.visitorKey, input.destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const contract = assertMiniappIntelligenceContract({ destinationKeyHint: destinationKey });
  const instance = await ensureDestinationInstance(input.companyId, destinationKey);
  return { destinationKey, contract, instance };
}

export async function listMiniappOpportunityCards(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const { instance } = await resolveContext({ companyId, visitorKey, destinationKeyHint });
  const rows = await prisma.destinationCandidate.findMany({
    where: {
      companyId,
      destinationInstanceId: instance.id,
    },
    select: {
      id: true,
      canonicalSourceUrl: true,
      proposedType: true,
      status: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return rows
    .map((row) => {
      const metadata = asRecord(row.metadata);
      const opportunity = asRecord(metadata?.miniappOpportunityCard);
      if (!opportunity) return null;
      return {
        id: asString(opportunity.id),
        candidateId: row.id,
        miniappKey: asString(opportunity.miniappKey),
        destinationKey: asString(opportunity.destinationKey),
        contractKey: asString(opportunity.contractKey),
        evidenceArtifactId: asString(opportunity.evidenceArtifactId),
        sourceUrl: asString(opportunity.sourceUrl) || row.canonicalSourceUrl,
        title: asString(opportunity.title) || row.canonicalSourceUrl,
        expectedEvidenceType: asString(opportunity.expectedEvidenceType) || asString(row.proposedType),
        evidenceScore: asNumber(opportunity.evidenceScore),
        sourceAuthorityScore: asNumber(opportunity.sourceAuthorityScore),
        candidateScore: asNumber(opportunity.candidateScore),
        contentQualityScore: asNumber(opportunity.contentQualityScore),
        status: asString(opportunity.status) as MiniappOpportunityStatus,
        blockingReasons: asStringArray(opportunity.blockingReasons),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      } satisfies MiniappOpportunityCard;
    })
    .filter(Boolean) as MiniappOpportunityCard[];
}

export async function promoteMiniappEvidenceToOpportunities(input: PromoteInput) {
  const { destinationKey, contract, instance } = await resolveContext(input);
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 25));
  const rows = await prisma.destinationSourceDocument.findMany({
    where: {
      companyId: input.companyId,
      destinationInstanceId: instance.id,
      sourceType: MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE,
    },
    select: {
      id: true,
      sourceUrl: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const nowIso = new Date().toISOString();
  const artifacts = rows
    .map(readEvidenceArtifact)
    .filter((artifact): artifact is MiniappEvidenceArtifact => artifact !== null && artifact.status === "FOUND")
    .slice(0, limit);

  let promotedCount = 0;
  let reworkCount = 0;
  const opportunities: MiniappOpportunityCard[] = [];
  for (const artifact of artifacts) {
    const scores = scoreOpportunity(artifact);
    const blockingReasons = [
      scores.evidenceScore < contract.promotionPolicy.minimumEvidenceScore ? "evidence_score_below_contract" : "",
      scores.sourceAuthorityScore < contract.promotionPolicy.minimumSourceAuthorityScore ? "source_authority_below_contract" : "",
      scores.candidateScore < contract.promotionPolicy.minimumCandidateScore ? "candidate_score_below_contract" : "",
      scores.contentQualityScore < contract.promotionPolicy.minimumContentQualityScore ? "content_quality_below_contract" : "",
      artifact.httpStatus >= 400 ? "http_status_not_ok" : "",
    ].filter(Boolean);
    const solid = blockingReasons.length === 0;
    let candidateId: string | undefined;
    const opportunityDraft = buildOpportunity({
      artifact,
      status: solid ? "CANDIDATE" : "REWORK_REQUIRED",
      blockingReasons,
      nowIso,
    });

    if (solid) {
      const candidateFingerprint = hashValue(`${contract.key}:${artifact.finalUrl || artifact.sourceUrl}`);
      const existing = await prisma.destinationCandidate.findUnique({
        where: {
          companyId_destinationInstanceId_candidateFingerprint: {
            companyId: input.companyId,
            destinationInstanceId: instance.id,
            candidateFingerprint,
          },
        },
        select: { id: true, metadata: true, status: true },
      });
      const metadata = {
        ...(asRecord(existing?.metadata) ?? {}),
        miniappOpportunityCard: {
          ...opportunityDraft,
          candidateId: existing?.id,
        },
        visitorCandidateState: "OPPORTUNITY_CANDIDATE",
        sovereignMiniappContractKey: contract.key,
        sourceCardInventoryIsSuccess: false,
        successMetric: contract.promotionPolicy.successMetric,
        classification: {
          contentType: artifact.evidenceType,
          primaryCategory: artifact.evidenceType,
          categoryAffinities: [
            {
              category: artifact.evidenceType,
              confidence: Math.min(1, scores.candidateScore / 100),
              evidence: [artifact.title, artifact.snippet].filter(Boolean),
              sourceUrls: [artifact.finalUrl || artifact.sourceUrl],
              reason: "Promoted from sovereign miniapp evidence artifact.",
            },
          ],
        },
        qualityGate: {
          passed: true,
          evidenceScore: scores.evidenceScore,
          sourceAuthorityScore: scores.sourceAuthorityScore,
          candidateScore: scores.candidateScore,
          contentQualityScore: scores.contentQualityScore,
          blockingReasons: [],
        },
      };
      const data = {
        canonicalSourceUrl: artifact.finalUrl || artifact.sourceUrl,
        proposedType: artifact.evidenceType,
        metadata: metadata as never,
        status: existing?.status ?? DestinationWorkflowState.DISCOVERED,
      };
      const candidate = existing
        ? await prisma.destinationCandidate.update({ where: { id: existing.id }, data, select: { id: true } })
        : await prisma.destinationCandidate.create({
            data: {
              companyId: input.companyId,
              destinationInstanceId: instance.id,
              candidateFingerprint,
              dedupeStatus: "UNKNOWN",
              ...data,
            },
            select: { id: true },
          });
      candidateId = candidate.id;
      promotedCount += 1;
    } else {
      reworkCount += 1;
    }

    const opportunity = { ...opportunityDraft, candidateId };
    opportunities.push(opportunity);
    await prisma.destinationSourceDocument.update({
      where: { id: artifact.id },
      data: {
        metadata: {
          ...(asRecord(rows.find((row) => row.id === artifact.id)?.metadata) ?? {}),
          miniappEvidencePromotion: {
            status: opportunity.status,
            candidateId,
            blockingReasons,
            promotedAt: solid ? nowIso : null,
            reworkAt: solid ? null : nowIso,
          },
        } as never,
      },
    });
  }

  return {
    ok: true,
    visitorKey: input.visitorKey.toLowerCase(),
    destinationKey,
    contractKey: contract.key,
    sourceCardInventoryIsSuccess: false,
    checkedEvidenceCount: artifacts.length,
    promotedCount,
    reworkCount,
    opportunities,
  };
}
