import { NextRequest, NextResponse } from "next/server";
import { executeClassScoutMissionNextAttempt } from "@/lib/destination-mission-runner";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  const result = await executeClassScoutMissionNextAttempt({
    companyId,
    missionId: id,
    actorId: auth.session.email,
    maxAutoRejections: typeof body.maxAutoRejections === "number" ? body.maxAutoRejections : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Mission execution failed", trail: result.trail ?? [] },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json(result);
}
