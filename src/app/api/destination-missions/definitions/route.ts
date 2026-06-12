import { NextRequest, NextResponse } from "next/server";
import {
  createDestinationMissionDefinition,
  listDestinationMissionDefinitions,
} from "@/lib/destination-mission-definitions";
import type { DestinationMissionDefinitionConfig } from "@/lib/destination-mission-contract";
import { resolveDestinationKeyForCompany } from "@/lib/destination-key-resolution";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const destinationKey = request.nextUrl.searchParams.get("destinationKey");
  const missionKind = request.nextUrl.searchParams.get("missionKind");
  if (destinationKey && !normalizeDestinationKey(destinationKey)) {
    return NextResponse.json({ error: "destinationKey must be supported by checklist" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  const resolvedDestinationKey = await resolveDestinationKeyForCompany(companyId, destinationKey);

  const definitions = await listDestinationMissionDefinitions({
    companyId,
    destinationKey: resolvedDestinationKey,
    missionKind: typeof missionKind === "string" && missionKind.trim() ? missionKind.trim() : undefined,
  });

  return NextResponse.json({ ok: true, definitions });
}

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => null);
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    const destinationKeyRaw = typeof body.destinationKey === "string" ? body.destinationKey : "";
    const missionKind = typeof body.missionKind === "string" ? body.missionKind.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!companyId || !name || !destinationKeyRaw || !missionKind) {
      return NextResponse.json(
        { error: "companyId, destinationKey, missionKind, and name are required" },
        { status: 400 },
      );
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    if (!destinationKey) {
      return NextResponse.json(
        { error: "destinationKey must be supported by checklist" },
        { status: 400 },
      );
    }
    const auth = await verifyMembership(request, companyId, "ADMIN");
    if (auth.error) return auth.error;

    const definition = await createDestinationMissionDefinition({
      companyId,
      destinationKey,
      missionKind,
      name,
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
