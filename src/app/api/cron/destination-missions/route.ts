import { NextRequest, NextResponse } from "next/server";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { verifyBackgroundJobSecret } from "@/lib/ingest-auth";
import { prisma } from "@/lib/db";
import { escalateCompanyPipelineJob } from "@/lib/pipeline-queue";

export const dynamic = "force-dynamic";

function parseCompanyIds(request: NextRequest) {
  const queryIds = request.nextUrl.searchParams.getAll("companyId");
  const csvIds = request.nextUrl.searchParams.get("companyIds");
  const explicitIds = [
    ...queryIds,
    ...(csvIds ? csvIds.split(",") : []),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return explicitIds.length
    ? Array.from(new Set(explicitIds))
    : Array.from(new Set((process.env.DESTINATION_MISSION_DAEMON_COMPANY_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean)));
}

export async function GET(request: NextRequest) {
  const auth = await verifyBackgroundJobSecret(request);
  if (auth.error) return auth.error;
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);

  const companyIds = parseCompanyIds(request);
  if (!companyIds.length) {
    return NextResponse.json(
      { error: "No daemon companies configured. Set DESTINATION_MISSION_DAEMON_COMPANY_IDS or pass companyId query params." },
      { status: 400 },
    );
  }

  const queued = [];
  for (const companyId of companyIds) {
    const job = await escalateCompanyPipelineJob(prisma, companyId, "DESTINATION_MISSION_DAEMON", "DESTINATION_SERVICE", "destination-service");
    queued.push({
      companyId,
      destinationKey: destinationKey ?? null,
      jobId: job?.id ?? null,
      queued: Boolean(job),
    });
  }

  return NextResponse.json({
    ok: true,
    cron: true,
    queued: true,
    lane: "PLAYLIST",
    jobType: "DESTINATION_MISSION_DAEMON",
    companyIds,
    destinationScope: destinationKey ?? null,
    results: queued,
    message: "Cron destination mission work was queued for CHECK Local instead of executing directly.",
  });
}
