import { NextRequest, NextResponse } from "next/server";
import {
  listDestinationMissionRuns,
  startDestinationMissionRun,
} from "@/lib/destination-missions";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const destinationKey = request.nextUrl.searchParams.get("destinationKey");
  const missionKind = request.nextUrl.searchParams.get("missionKind");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const runs = await listDestinationMissionRuns({
    companyId: companyId as string,
    destinationKey: destinationKey === "classscout" ? "classscout" : undefined,
    missionKind: missionKind === "rulebook_new_listing" ? "rulebook_new_listing" : undefined,
  });
  return NextResponse.json({ ok: true, runs });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.companyId || !body.destinationKey || !body.missionKind) {
      return NextResponse.json(
        { error: "companyId, destinationKey, and missionKind are required" },
        { status: 400 },
      );
    }

    const membership = await verifyMembership(request, String(body.companyId), "ADMIN");
    const ingestAuth = membership.error ? await verifyIngestSecret(request) : null;
    if (membership.error && ingestAuth?.error) {
      return membership.error;
    }

    const run = await startDestinationMissionRun({
      companyId: String(body.companyId),
      destinationKey: String(body.destinationKey) as DestinationKey,
      missionKind: String(body.missionKind) as "rulebook_new_listing",
      policySnapshot:
        body.policySnapshot && typeof body.policySnapshot === "object" && !Array.isArray(body.policySnapshot)
          ? body.policySnapshot
          : undefined,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : undefined,
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    console.error("[API:DestinationMissions:Runs] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
