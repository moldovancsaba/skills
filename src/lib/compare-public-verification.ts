import "server-only";

import { prisma } from "@/lib/db";
import { evaluateCompareProjectionGate } from "@/lib/visitor-public-projection-gate";

export type ComparePublicVerificationSummary = {
  checkedAt: string;
  totalCandidatesChecked: number;
  blockedCount: number;
  blockedByReason: Record<string, number>;
  status: "ok" | "blocked";
};

export async function getComparePublicVerificationSummary(companyId: string): Promise<ComparePublicVerificationSummary> {
  const candidates = await prisma.destinationCandidate.findMany({
    where: {
      companyId,
      destinationInstance: {
        destinationKey: "compare",
      },
    },
    select: {
      metadata: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const blockedByReason: Record<string, number> = {};
  let blockedCount = 0;

  for (const candidate of candidates) {
    const gate = evaluateCompareProjectionGate({ metadata: candidate.metadata });
    if (!gate.blocked) continue;
    blockedCount += 1;
    for (const reason of gate.blockedReasons) {
      blockedByReason[reason] = (blockedByReason[reason] ?? 0) + 1;
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    totalCandidatesChecked: candidates.length,
    blockedCount,
    blockedByReason,
    status: blockedCount > 0 ? "blocked" : "ok",
  };
}
