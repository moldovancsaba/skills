import { NextRequest, NextResponse } from "next/server";
import { transitionDestinationMissionState } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  try {
    const run = await transitionDestinationMissionState({
      companyId,
      missionId: id,
      nextState: "DISCOVERING",
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : { resumedBy: auth.session.email },
    });
    if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 409 });
  }
}
