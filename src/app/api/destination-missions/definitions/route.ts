import { NextRequest, NextResponse } from "next/server";
import {
  createDestinationMissionDefinition,
  listDestinationMissionDefinitions,
} from "@/lib/destination-mission-definitions";
import type { DestinationMissionDefinitionConfig } from "@/lib/destination-mission-contract";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const destinationKey = request.nextUrl.searchParams.get("destinationKey");
  const missionKind = request.nextUrl.searchParams.get("missionKind");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const definitions = await listDestinationMissionDefinitions({
    companyId: companyId as string,
    destinationKey: destinationKey === "classscout" ? "classscout" : "classscout",
    missionKind: typeof missionKind === "string" && missionKind.trim() ? missionKind.trim() : undefined,
  });

  return NextResponse.json({ ok: true, definitions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const companyId = String(body.companyId || "");
    const auth = await verifyMembership(request, companyId, "ADMIN");
    if (auth.error) return auth.error;

    if (!companyId || !body.name || !body.destinationKey || !body.missionKind) {
      return NextResponse.json(
        { error: "companyId, destinationKey, missionKind, and name are required" },
        { status: 400 },
      );
    }

    const definition = await createDestinationMissionDefinition({
      companyId,
      destinationKey: String(body.destinationKey) === "classscout" ? "classscout" : "classscout",
      missionKind: String(body.missionKind),
      name: String(body.name),
      config:
        body.config && typeof body.config === "object" && !Array.isArray(body.config)
          ? (body.config as Partial<DestinationMissionDefinitionConfig>)
          : undefined,
      status:
        body.status === "active" || body.status === "paused" || body.status === "archived" || body.status === "draft"
          ? body.status
          : undefined,
      actorId: auth.membership.id || auth.session.email || "webapp-user",
      metadata: {
        source: "api.destination-missions.definitions.create",
      },
    });

    return NextResponse.json({ ok: true, definition });
  } catch (error) {
    console.error("[API:DestinationMissionDefinitions] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
