import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionRun, updateDestinationMissionPolicy } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const run = await getDestinationMissionRun(companyId as string, id);
  if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const policySnapshot =
    body.policySnapshot && typeof body.policySnapshot === "object" && !Array.isArray(body.policySnapshot)
      ? (body.policySnapshot as Record<string, unknown>)
      : null;
  if (!policySnapshot) {
    return NextResponse.json({ error: "policySnapshot is required" }, { status: 400 });
  }

  const { id } = await params;
  const run = await updateDestinationMissionPolicy({
    companyId,
    missionId: id,
    policyPatch: policySnapshot,
    metadata: {
      updatedBy: auth.session.email,
    },
  });
  if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}
