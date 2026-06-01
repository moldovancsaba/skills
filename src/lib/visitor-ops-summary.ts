import "server-only";

import { listVisitorCandidates } from "@/lib/visitor-candidate-pipeline";
import { getVisitorBlueprint, getVisitorTaxonomy } from "@/lib/visitor-blueprints";
import { listVisitorFeedbackMemory, listVisitorRefinementRuns } from "@/lib/visitor-learning";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

export async function getVisitorOpsSummary(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const [blueprint, taxonomy, candidates, feedbackMemory, refinementRuns] = await Promise.all([
    getVisitorBlueprint(companyId, visitorKey, destinationKeyHint),
    getVisitorTaxonomy(companyId, visitorKey, destinationKeyHint),
    listVisitorCandidates(companyId, visitorKey, destinationKeyHint),
    listVisitorFeedbackMemory(companyId, visitorKey, destinationKeyHint),
    listVisitorRefinementRuns(companyId, visitorKey, destinationKeyHint),
  ]);

  const countsByState: Record<string, number> = {};
  const blockedByReason: Record<string, number> = {};
  let reviewRequired = 0;
  for (const candidate of candidates) {
    countsByState[candidate.status] = (countsByState[candidate.status] ?? 0) + 1;
    const gate = asRecord(candidate.metadata?.qualityGate);
    const reasons = asStringArray(gate?.blockingReasons);
    for (const reason of reasons) blockedByReason[reason] = (blockedByReason[reason] ?? 0) + 1;
    if (candidate.status === "NEEDS_REVIEW") reviewRequired += 1;
  }

  return {
    checkedAt: new Date().toISOString(),
    visitorKey: visitorKey.toLowerCase(),
    blueprintReady: Boolean(blueprint && blueprint.state === "active"),
    blueprintState: blueprint?.state ?? null,
    taxonomyReady: Boolean(taxonomy),
    feedbackRules: feedbackMemory.length,
    refinementRuns: refinementRuns.length,
    totalCandidates: candidates.length,
    reviewRequired,
    countsByState,
    blockedByReason,
  };
}
