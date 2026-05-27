import { NextRequest, NextResponse } from "next/server";
import { duplicateDestinationMissionDefinition } from "@/lib/destination-mission-definitions";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  const definition = await duplicateDestinationMissionDefinition({
    companyId,
    definitionId: id,
    actorId: auth.membership.id || auth.session.email || "webapp-user",
  });
  if (!definition) return NextResponse.json({ error: "Mission definition not found" }, { status: 404 });
  return NextResponse.json({ ok: true, definition });
}
