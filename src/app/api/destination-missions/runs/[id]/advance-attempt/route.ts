import { NextRequest, NextResponse } from "next/server";
import { advanceDestinationMissionAttempt } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  const run = await advanceDestinationMissionAttempt({
    companyId,
    missionId: id,
    candidateId: typeof body.candidateId === "string" ? body.candidateId : null,
    workflowRunId: typeof body.workflowRunId === "string" ? body.workflowRunId : null,
    candidateFingerprint: typeof body.candidateFingerprint === "string" ? body.candidateFingerprint : null,
    outcome:
      body.outcome && typeof body.outcome === "object" && !Array.isArray(body.outcome)
        ? body.outcome
        : null,
    metadata:
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : { advancedBy: auth.session.email },
  });
  if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}
