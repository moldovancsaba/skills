import { prisma } from "@/lib/db";
import { escalateCompanyPipelineJob } from "@/lib/pipeline-queue";

export type VisitorIntentKind =
  | "candidate.classify"
  | "candidate.extract"
  | "candidate.prepareReview"
  | "candidate.score"
  | "candidate.discover"
  | "research.burst"
  | "research.gates.evaluate"
  | "research.opportunities.promote"
  | "research.tasks.plan";

export async function queueVisitorLocalIntent(input: {
  companyId: string;
  visitorKey: string;
  intentKind: VisitorIntentKind;
  candidateId?: string | null;
  destinationKey?: string | null;
}) {
  const entityId = [
    input.visitorKey,
    input.destinationKey || "default",
    input.intentKind,
    input.candidateId || "unit",
  ].join(":");
  const job = await escalateCompanyPipelineJob(
    prisma as never,
    input.companyId,
    "RESEARCH_BACKFILL",
    "MINIAPP_RESEARCH_INTENT",
    entityId,
  );
  return {
    ok: true,
    queued: true,
    lane: "LOCAL_AI",
    jobType: "RESEARCH_BACKFILL",
    jobId: job?.id ?? null,
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    destinationKey: input.destinationKey ?? null,
    intentKind: input.intentKind,
    candidateId: input.candidateId ?? null,
  };
}
