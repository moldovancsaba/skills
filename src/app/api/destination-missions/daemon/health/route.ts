import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listSchedulableDestinationMissionKinds } from "@/lib/check-lifecycle/topology-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const missionKinds = listSchedulableDestinationMissionKinds();
  const authConfigured = Boolean(process.env.CRON_SECRET?.trim() || process.env.INGEST_SECRET?.trim());
  const [configuredCompanyCount, activeDefinitionCount, recoverableRunCount] = await Promise.all([
    prisma.destinationMissionDefinition.groupBy({
      by: ["companyId"],
      where: {
        status: "active",
        missionKind: { in: missionKinds },
      },
    }).then((rows) => rows.length),
    prisma.destinationMissionDefinition.count({
      where: {
        status: "active",
        missionKind: { in: missionKinds },
      },
    }),
    prisma.destinationMissionRun.count({
      where: {
        missionKind: { in: missionKinds },
        state: { in: ["QUEUED", "CATALOG_INSPECTED", "DISCOVERING", "FAILED_RECOVERABLE", "CANDIDATE_IN_REVIEW", "PUBLISHING"] },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    ready: authConfigured,
    serviceId: "destination-daemon",
    lane: "PLAYLIST",
    jobType: "DESTINATION_MISSION_DAEMON",
    authConfigured,
    configuredCompanyCount,
    activeDefinitionCount,
    recoverableRunCount,
    missionKinds,
    defaults: {
      cooldownMs: 30 * 60 * 1000,
      queueBreakerId: "destination-service-unavailable",
    },
    generatedAt: new Date().toISOString(),
  });
}
