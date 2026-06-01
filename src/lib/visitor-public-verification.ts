import "server-only";

import { prisma } from "@/lib/db";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { evaluateCompareProjectionGate } from "@/lib/visitor-public-projection-gate";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

export async function getVisitorPublicVerificationSummary(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await ensureDestinationInstance(companyId, destinationKey);

  const candidates = await prisma.destinationCandidate.findMany({
    where: {
      companyId,
      destinationInstanceId: instance.id,
    },
    select: {
      metadata: true,
      status: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const blockedByReason: Record<string, number> = {};
  let publishedCount = 0;
  let blockedCount = 0;
  for (const candidate of candidates) {
    if (candidate.status === "PUBLISHED") publishedCount += 1;
    const metadata = asRecord(candidate.metadata) ?? {};
    const qualityGate = asRecord(metadata.qualityGate) ?? {};
    let blockingReasons = asStringArray(qualityGate.blockingReasons);

    if (destinationKey === "compare") {
      const projection = evaluateCompareProjectionGate({ metadata });
      if (projection.blocked) {
        blockingReasons = [...new Set([...blockingReasons, ...projection.blockedReasons])];
      }
    }

    if (blockingReasons.length) {
      blockedCount += 1;
      for (const reason of blockingReasons) {
        blockedByReason[reason] = (blockedByReason[reason] ?? 0) + 1;
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    visitorKey: visitorKey.toLowerCase(),
    totalCandidatesChecked: candidates.length,
    publishedCount,
    blockedCount,
    blockedByReason,
    status: blockedCount > 0 ? "blocked" : "ok",
  };
}
