import "server-only";

import { prisma } from "@/lib/db";
import { getVisitorTaxonomy, resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { evaluateVisitorQualityGate } from "@/lib/visitor-quality-gate";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function validateVisitorTaxonomyAgainstLive(companyId: string, visitorKey: string, limit = 500, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await ensureDestinationInstance(companyId, destinationKey);
  const taxonomy = await getVisitorTaxonomy(companyId, visitorKey, destinationKeyHint);
  if (!taxonomy) {
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      totalChecked: 0,
      failingCandidates: [],
      error: "taxonomy_missing",
    };
  }
  const candidates = await prisma.destinationCandidate.findMany({
    where: {
      companyId,
      destinationInstanceId: instance.id,
    },
    select: {
      id: true,
      proposedType: true,
      canonicalSourceUrl: true,
      metadata: true,
    },
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(limit, 2000)),
  });

  const failingCandidates: Array<{ candidateId: string; reasons: string[]; contentType: string }> = [];
  for (const candidate of candidates) {
    const metadata = asRecord(candidate.metadata) ?? {};
    const classification = asRecord(metadata.classification) ?? {};
    const contentType = asString(classification.contentType || candidate.proposedType).toLowerCase();
    const gate = evaluateVisitorQualityGate({
      taxonomy,
      contentType,
      sourceUrl: candidate.canonicalSourceUrl,
      extractedFacts: asRecord(metadata.extractedFacts) ?? {},
      metadata,
    });
    if (!gate.pass) {
      failingCandidates.push({
        candidateId: candidate.id,
        contentType,
        reasons: [...gate.blockingReasons, ...gate.reviewReasons],
      });
    }
  }

  return {
    ok: failingCandidates.length === 0,
    checkedAt: new Date().toISOString(),
    totalChecked: candidates.length,
    failCount: failingCandidates.length,
    failingCandidates,
  };
}
