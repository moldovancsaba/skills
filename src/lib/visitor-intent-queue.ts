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
  payload?: Record<string, unknown>;
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
  const metadata = {
    visitorIntent: {
      visitorKey: input.visitorKey,
      destinationKey: input.destinationKey ?? null,
      intentKind: input.intentKind,
      candidateId: input.candidateId ?? null,
      payload: input.payload ?? {},
      queuedAt: new Date().toISOString(),
    },
  };
  const updatedJob = job?.id
    ? await prisma.pipelineJob.update({
        where: { id: job.id },
        data: { metadata: metadata as never },
      })
    : null;
  return {
    ok: true,
    queued: true,
    lane: "LOCAL_AI",
    jobType: "RESEARCH_BACKFILL",
    jobId: updatedJob?.id ?? job?.id ?? null,
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    destinationKey: input.destinationKey ?? null,
    intentKind: input.intentKind,
    candidateId: input.candidateId ?? null,
    payload: input.payload ?? {},
  };
}
