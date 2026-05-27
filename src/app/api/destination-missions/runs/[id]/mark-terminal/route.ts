import { NextRequest, NextResponse } from "next/server";
import { markDestinationMissionTerminal } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  if (
    body.outcome !== "FAILED_TERMINAL" &&
    body.outcome !== "FAILED_RECOVERABLE" &&
    body.outcome !== "EXHAUSTED" &&
    body.outcome !== "PUBLISHED_VERIFIED"
  ) {
    return NextResponse.json({ error: "Invalid terminal outcome" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const run = await markDestinationMissionTerminal({
      companyId,
      missionId: id,
      outcome: body.outcome,
      failureCode: typeof body.failureCode === "string" ? body.failureCode : null,
      failureDetail: typeof body.failureDetail === "string" ? body.failureDetail : null,
      successCandidateId: typeof body.successCandidateId === "string" ? body.successCandidateId : null,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata
          : { terminalBy: auth.session.email },
    });
    if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 409 });
  }
}
