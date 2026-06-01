import "server-only";

import { prisma } from "@/lib/db";
import { getVisitorBlueprint, getVisitorTaxonomy, resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { listVisitorSourceDatacards, listVisitorSourceRefreshQueue, validateVisitorSourceGraph } from "@/lib/visitor-source-graph";
import { listVisitorFlashcards } from "@/lib/visitor-knowledge-pack";
import { listVisitorCandidates } from "@/lib/visitor-candidate-pipeline";
import { listVisitorFeedbackMemory, listVisitorRefinementRuns } from "@/lib/visitor-learning";
import { getVisitorPublicVerificationSummary } from "@/lib/visitor-public-verification";
import { ensureDestinationInstance } from "@/lib/destination-workflows";

export async function getVisitorOpsSnapshot(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await ensureDestinationInstance(companyId, destinationKey);

  const [
    blueprint,
    taxonomy,
    sources,
    refreshQueue,
    sourceGraphValidation,
    flashcards,
    candidates,
    feedbackMemory,
    refinementRuns,
    publicVerification,
    reviewPackets,
  ] = await Promise.all([
    getVisitorBlueprint(companyId, visitorKey, destinationKeyHint),
    getVisitorTaxonomy(companyId, visitorKey, destinationKeyHint),
    listVisitorSourceDatacards(companyId, visitorKey, destinationKeyHint),
    listVisitorSourceRefreshQueue(companyId, visitorKey, destinationKeyHint),
    validateVisitorSourceGraph(companyId, visitorKey, destinationKeyHint),
    listVisitorFlashcards(companyId, visitorKey, destinationKeyHint),
    listVisitorCandidates(companyId, visitorKey, destinationKeyHint),
    listVisitorFeedbackMemory(companyId, visitorKey, destinationKeyHint),
    listVisitorRefinementRuns(companyId, visitorKey, destinationKeyHint),
    getVisitorPublicVerificationSummary(companyId, visitorKey, destinationKeyHint),
    prisma.destinationReviewPacket.findMany({
      where: {
        companyId,
        destinationInstanceId: instance.id,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        candidateId: true,
        packetState: true,
        submittedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const published = candidates.filter((candidate) => candidate.status === "PUBLISHED" || candidate.status === "PUBLIC_VERIFIED");
  const reviewQueue = reviewPackets.filter((packet) => packet.packetState === "AWAITING_REVIEW");

  return {
    checkedAt: new Date().toISOString(),
    visitorKey: visitorKey.toLowerCase(),
    destinationKey,
    blueprint,
    taxonomy,
    sources,
    refreshQueue,
    sourceGraphValidation,
    flashcards,
    candidates,
    reviewPackets,
    reviewQueueCount: reviewQueue.length,
    published,
    feedbackMemory,
    refinementRuns,
    publicVerification,
  };
}
