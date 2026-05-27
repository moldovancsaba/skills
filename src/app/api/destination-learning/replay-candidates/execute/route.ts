import { NextRequest, NextResponse } from "next/server";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { replayDestinationWorkflowRun } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = String(body.companyId || "");
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const candidateKind = String(body.candidateKind || "");
    if (candidateKind === "review-packet") {
      const result = await publishDestinationReviewPacket({
        companyId,
        reviewPacketId: String(body.reviewPacketId || ""),
        reviewedBy: auth.session.email,
      });
      return NextResponse.json(result, { status: result.status });
    }

    if (candidateKind === "workflow-run") {
      const replayed = await replayDestinationWorkflowRun({
        companyId,
        runId: String(body.workflowRunId || ""),
        fromStage: typeof body.fromStage === "string" && body.fromStage.trim() ? body.fromStage : "DISCOVER_SOURCE",
        reason: typeof body.reason === "string" ? body.reason : "destination-learning-replay",
      });

      if (!replayed) {
        return NextResponse.json({ ok: false, error: "Workflow run not found" }, { status: 404 });
      }

      return NextResponse.json({ ok: true, replayed });
    }

    return NextResponse.json({ ok: false, error: "Unsupported replay candidate kind" }, { status: 400 });
  } catch (error) {
    console.error("[API:DestinationLearning:ReplayExecute] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
