import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { getDestinationReviewPacket } from "@/lib/destination-review-bridge";
import { replayDestinationWorkflowRun } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => null);
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
    }
    const destinationKeyRaw = body.destinationKey;
    if (destinationKeyRaw !== undefined && !normalizeDestinationKey(destinationKeyRaw)) {
      return NextResponse.json({ ok: false, error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const candidateKind = typeof body.candidateKind === "string" ? body.candidateKind : "";
    if (candidateKind === "review-card") {
      const reviewPacketId = typeof body.reviewPacketId === "string" ? body.reviewPacketId : "";
      if (!reviewPacketId) {
        return NextResponse.json({ ok: false, error: "reviewPacketId is required" }, { status: 400 });
      }
      if (destinationKey) {
        const packet = await getDestinationReviewPacket(companyId, reviewPacketId);
        if (!packet || packet.destinationInstance?.destinationKey !== destinationKey) {
          return NextResponse.json({ ok: false, error: "Review card not found" }, { status: 404 });
        }
      }
      const result = await publishDestinationReviewPacket({
        companyId,
        reviewPacketId,
        reviewedBy: auth.session.email,
      });
      return NextResponse.json(result, { status: result.status });
    }

    if (candidateKind === "workflow-run") {
      const workflowRunId = typeof body.workflowRunId === "string" ? body.workflowRunId : "";
      if (!workflowRunId) {
        return NextResponse.json({ ok: false, error: "workflowRunId is required" }, { status: 400 });
      }
      if (destinationKey) {
        const run = await prisma.destinationWorkflowRun.findFirst({
          where: { id: workflowRunId, companyId },
          select: { destinationInstance: { select: { destinationKey: true } } },
        });
        if (!run || normalizeDestinationKey(run.destinationInstance.destinationKey) !== destinationKey) {
          return NextResponse.json({ ok: false, error: "Workflow run not found" }, { status: 404 });
        }
      }
      const replayed = await replayDestinationWorkflowRun({
        companyId,
        runId: workflowRunId,
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
