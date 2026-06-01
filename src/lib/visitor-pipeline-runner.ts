import "server-only";

import {
  classifyVisitorCandidate,
  discoverVisitorCandidates,
  extractVisitorCandidate,
  listVisitorCandidates,
  prepareVisitorReviewPacket,
  scoreVisitorCandidate,
} from "@/lib/visitor-candidate-pipeline";
import { submitDestinationReviewDecision } from "@/lib/destination-review-bridge";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function runVisitorPipelineOnce(input: {
  companyId: string;
  visitorKey: string;
  discoverLimit?: number;
  processLimit?: number;
  destinationKey?: string;
  autoApprove?: boolean;
  autoPublish?: boolean;
}) {
  const discoverLimit = Math.max(1, Math.min(200, Number(input.discoverLimit) || 30));
  const processLimit = Math.max(1, Math.min(100, Number(input.processLimit) || 20));

  const discover = await discoverVisitorCandidates(input.companyId, input.visitorKey, discoverLimit, input.destinationKey);
  const candidates = await listVisitorCandidates(input.companyId, input.visitorKey, input.destinationKey);
  const pending = candidates
    .filter((candidate) => {
      const status = asString(candidate.status).toUpperCase();
      return status === "DISCOVERED" || status === "FACTS_EXTRACTED" || status === "CLASSIFIED" || status === "REWORK_REQUIRED";
    })
    .slice(0, processLimit);

  const results: Array<Record<string, unknown>> = [];
  for (const candidate of pending) {
    try {
      const metadata = candidate.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata)
        ? candidate.metadata as Record<string, unknown>
        : {};
      const autoPublishEligible = metadata.autoPublishEligible === true;
      const facts = await extractVisitorCandidate(input.companyId, input.visitorKey, String(candidate.id), input.destinationKey);
      const classification = await classifyVisitorCandidate(input.companyId, input.visitorKey, String(candidate.id), {
        contentType: asString((candidate as Record<string, unknown>).proposedType) || undefined,
      }, input.destinationKey);
      const score = await scoreVisitorCandidate(input.companyId, input.visitorKey, String(candidate.id), autoPublishEligible
        ? {
            sourceTrustScore: 0.95,
            evidenceCompleteness: 0.9,
            taxonomyFit: 0.9,
            locationFit: 0.9,
            audienceFit: 0.9,
          }
        : {}, input.destinationKey);
      const review = await prepareVisitorReviewPacket(input.companyId, input.visitorKey, String(candidate.id), input.destinationKey);
      let approval: unknown = null;
      let publish: unknown = null;
      if (input.autoApprove && autoPublishEligible && review?.latestReviewPacketId) {
        approval = await submitDestinationReviewDecision({
          companyId: input.companyId,
          reviewPacketId: review.latestReviewPacketId,
          bridgeVersion: "visitor-auto-review@v1",
          decision: "APPROVE",
          decisionReasonCode: "source_verified_auto_approval",
          decisionNotes: "CHECK Local auto-approved a trusted Visitor candidate with source-verified public draft payload.",
          reviewedBy: "CHECK Local Visitor Auto Approval",
          metadata: {
            visitorKey: input.visitorKey,
            destinationKey: input.destinationKey,
            autoPublishEligible,
          },
        });
        if (input.autoPublish) {
          publish = await publishDestinationReviewPacket({
            companyId: input.companyId,
            reviewPacketId: review.latestReviewPacketId,
            reviewedBy: "CHECK Local Visitor Auto Publish",
          });
        }
      }
      results.push({
        candidateId: candidate.id,
        ok: true,
        facts,
        classification,
        score,
        review,
        approval,
        publish,
      });
    } catch (error) {
      results.push({
        candidateId: candidate.id,
        ok: false,
        error: String(error),
      });
    }
  }

  return {
    discovered: discover.createdCount,
    processed: results.length,
    failures: results.filter((item) => item.ok === false).length,
    results,
  };
}
