import { NextRequest, NextResponse } from "next/server";
import {
  getDestinationMissionDefinition,
  updateDestinationMissionDefinition,
} from "@/lib/destination-mission-definitions";
import type { DestinationMissionDefinitionConfig } from "@/lib/destination-mission-contract";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const definition = await getDestinationMissionDefinition({
    companyId,
    definitionId: id,
  });
  if (!definition) {
    return NextResponse.json({ error: "Mission definition not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, definition });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const bodyRaw = await request.json().catch(() => null);
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    const auth = await verifyMembership(request, companyId, "ADMIN");
    if (auth.error) return auth.error;

    const { id } = await params;
    const definition = await updateDestinationMissionDefinition({
      companyId,
      definitionId: id,
      name: typeof body.name === "string" ? body.name : undefined,
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
        source: "api.destination-missions.definitions.update",
      },
    });

    if (!definition) {
      return NextResponse.json({ error: "Mission definition not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, definition });
  } catch (error) {
    console.error("[API:DestinationMissionDefinitions] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
