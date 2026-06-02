import { prisma } from "@/lib/db";
import { escalateCompanyPipelineJob } from "@/lib/pipeline-queue";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

export type DestinationMissionQueueAction =
  | "discover-candidates"
  | "extract-candidate"
  | "score-candidate"
  | "prepare-candidate"
  | "execute-next-attempt"
  | "execute-until-blocked";

export async function queueDestinationMissionRunAction({
  companyId,
  missionId,
  destinationScope,
  actorId,
  action,
}: {
  companyId: string;
  missionId: string;
  destinationScope: DestinationKey | null;
  actorId: string;
  action: DestinationMissionQueueAction;
}) {
  const job = await escalateCompanyPipelineJob(
    prisma,
    companyId,
    "DESTINATION_MISSION_DAEMON",
    "DESTINATION_MISSION_RUN",
    missionId,
  );

  return {
    ok: true,
    queued: true,
    lane: "PLAYLIST",
    jobType: "DESTINATION_MISSION_DAEMON",
    jobId: job?.id ?? null,
    companyId,
    missionId,
    destinationScope,
    action,
    actorId,
    message: "Destination mission work was queued for CHECK Local instead of executing in the webapp.",
  };
}
