import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionRun, updateDestinationMissionPolicy } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be supported by checklist" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const run = await getDestinationMissionRun(companyId, id);
  if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  if (destinationKey && run.destinationKey !== destinationKey) {
    return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, run });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const bodyRaw = await request.json().catch(() => null);
  if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = bodyRaw as Record<string, unknown>;
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const destinationKeyRaw = body.destinationKey;
  if (destinationKeyRaw !== undefined && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be supported by checklist" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
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
  if (destinationKey) {
    const existingRun = await getDestinationMissionRun(companyId, id);
    if (!existingRun || existingRun.destinationKey !== destinationKey) {
      return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
    }
  }
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
