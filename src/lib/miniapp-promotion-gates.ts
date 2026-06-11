import "server-only";

import { DestinationWorkflowState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { assertMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";
import { evaluateCompareProjectionGate } from "@/lib/visitor-public-projection-gate";
import { readContentQualityScore } from "@/lib/miniapp-content-quality";

export type MiniappPromotionGateResult = {
  candidateId: string;
  passed: boolean;
  nextState: "NEEDS_REVIEW" | "REWORK_REQUIRED";
  blockingReasons: string[];
  reviewReasons: string[];
  checkedAt: string;
};

type GateInput = {
  companyId: string;
  visitorKey: string;
  destinationKeyHint?: unknown;
  candidateId?: string;
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

function includesForbiddenSignal(text: string, forbiddenSignals: string[]) {
  const lower = text.toLowerCase();
  return forbiddenSignals.filter((signal) => signal && lower.includes(signal.toLowerCase()));
}

async function resolveContext(input: GateInput) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(input.visitorKey, input.destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const contract = assertMiniappIntelligenceContract({ destinationKeyHint: destinationKey });
  const instance = await ensureDestinationInstance(input.companyId, destinationKey);
  return { destinationKey, contract, instance };
}

export async function evaluateMiniappPromotionGates(input: GateInput) {
  const { destinationKey, contract, instance } = await resolveContext(input);
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 25));
  const candidates = await prisma.destinationCandidate.findMany({
    where: {
      companyId: input.companyId,
      destinationInstanceId: instance.id,
      ...(input.candidateId ? { id: input.candidateId } : {}),
    },
    select: {
      id: true,
      canonicalSourceUrl: true,
      proposedType: true,
      metadata: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const checkedAt = new Date().toISOString();
  const results: MiniappPromotionGateResult[] = [];
  for (const candidate of candidates) {
    const metadata = asRecord(candidate.metadata) ?? {};
    const opportunity = asRecord(metadata.miniappOpportunityCard);
    if (!opportunity) continue;
    const blockingReasons: string[] = [];
    const reviewReasons: string[] = [];
    const evidenceScore = asNumber(opportunity.evidenceScore);
    const sourceAuthorityScore = asNumber(opportunity.sourceAuthorityScore);
    const candidateScore = asNumber(opportunity.candidateScore);
    const contentQualityScore = readContentQualityScore({
      metadata,
      fallbackCandidateScore: candidateScore,
    });
    const sourceUrl = asString(opportunity.sourceUrl) || candidate.canonicalSourceUrl;
    const title = asString(opportunity.title);
    const text = [
      title,
      sourceUrl,
      asString(opportunity.expectedEvidenceType),
      asString(asRecord(metadata.classification)?.contentType),
      ...asStringArray(opportunity.blockingReasons),
    ].join(" ");

    if (!sourceUrl) blockingReasons.push("missing_source_url");
    if (!title || title.length < 3) blockingReasons.push("missing_title");
    if (evidenceScore < contract.promotionPolicy.minimumEvidenceScore) blockingReasons.push("evidence_score_below_contract");
    if (sourceAuthorityScore < contract.promotionPolicy.minimumSourceAuthorityScore) blockingReasons.push("source_authority_below_contract");
    if (candidateScore < contract.promotionPolicy.minimumCandidateScore) blockingReasons.push("candidate_score_below_contract");
    if (contentQualityScore < contract.promotionPolicy.minimumContentQualityScore) blockingReasons.push("content_quality_below_contract");
    const forbiddenSignals = includesForbiddenSignal(text, contract.domainProfile.forbiddenSignals);
    for (const signal of forbiddenSignals) blockingReasons.push(`forbidden_signal:${signal}`);

    if (destinationKey === "compare") {
      const projection = evaluateCompareProjectionGate({ metadata });
      if (projection.blocked) blockingReasons.push(...projection.blockedReasons);
    }

    if (!asRecord(metadata.extractedFacts)) reviewReasons.push("facts_snapshot_needed");
    if (!asRecord(metadata.publicDraftPayload)) reviewReasons.push("draft_payload_needed");

    const passed = blockingReasons.length === 0;
    const nextState: MiniappPromotionGateResult["nextState"] = passed ? "NEEDS_REVIEW" : "REWORK_REQUIRED";
    const result: MiniappPromotionGateResult = {
      candidateId: candidate.id,
      passed,
      nextState,
      blockingReasons: [...new Set(blockingReasons)],
      reviewReasons: [...new Set(reviewReasons)],
      checkedAt,
    };
    results.push(result);
    await prisma.destinationCandidate.update({
      where: { id: candidate.id },
      data: {
        status: passed ? DestinationWorkflowState.REVIEW_REQUIRED : DestinationWorkflowState.FAILED,
        metadata: {
          ...metadata,
          visitorCandidateState: nextState,
          miniappPromotionGate: result,
          qualityGate: {
            ...(asRecord(metadata.qualityGate) ?? {}),
            passed,
            blockingReasons: result.blockingReasons,
            reviewReasons: result.reviewReasons,
            evidenceScore,
            sourceAuthorityScore,
            candidateScore,
            contentQualityScore,
            minimumContentQualityScore: contract.promotionPolicy.minimumContentQualityScore,
          },
          sourceCardInventoryIsSuccess: false,
          successMetric: contract.promotionPolicy.successMetric,
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
    evaluatedCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    blockedCount: results.filter((result) => !result.passed).length,
    results,
  };
}
