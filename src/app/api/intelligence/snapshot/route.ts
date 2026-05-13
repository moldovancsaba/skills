import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

/**
 * Intelligence snapshot ingestion API.
 *
 * Receives the authoritative dashboard snapshot from the local AI worker
 * over the bridge-secret protected channel.
 */

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-bridge-secret");
  const providedSecretHash = secret ? crypto.createHash("sha256").update(secret).digest("hex") : null;

  // Simple secret check (ideally this matches a setting in the DB or ENV)
  const masterSecret = process.env.BRIDGE_SECRET;
  const masterSecretHash = masterSecret ? crypto.createHash("sha256").update(masterSecret).digest("hex") : null;

  if (!providedSecretHash || providedSecretHash !== masterSecretHash) {
    return NextResponse.json({ error: "Unauthorized. Intelligence authority rejected." }, { status: 401 });
  }

  try {
    const data = await request.json();
    const { companyId, metrics, counts, state } = data;

    if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

    const scoreHealth = data.scoreHealth || {};
    const knowmoreHealth = data.knowmoreHealth || {};
    const observabilitySummary = data.observabilitySummary || {};

    const snapshot = await prisma.intelligenceSnapshot.upsert({
      where: { companyId },
      update: {
        dataIngressCount: counts.dataIngress,
        topicSynthesisCount: counts.topicSynthesis,
        knowmoreCount: counts.knowmore,
        strategicGoalsCount: counts.strategicGoals,
        checklistCount: counts.checklist,
        tacticalBoardCount: counts.tacticalBoard,
        reviewGatewayCount: counts.reviewGateway,
        synthesisYield: metrics.synthesisYield,
        confidenceAvg: metrics.confidenceAvg,
        iceScoreAvg: metrics.iceScoreAvg,
        easeScoreAvg: metrics.easeScoreAvg,
        engineStatus: state.engineStatus,
        activeContext: state.activeContext,
        activeTask: state.activeTask,
        stage: state.stage,
        analyticsHistory: data.analytics || [],
        scoreHealth,
        knowmoreHealth,
        observabilitySummary,
      },
      create: {
        companyId,
        dataIngressCount: counts.dataIngress,
        topicSynthesisCount: counts.topicSynthesis,
        knowmoreCount: counts.knowmore,
        strategicGoalsCount: counts.strategicGoals,
        checklistCount: counts.checklist,
        tacticalBoardCount: counts.tacticalBoard,
        reviewGatewayCount: counts.reviewGateway,
        synthesisYield: metrics.synthesisYield,
        confidenceAvg: metrics.confidenceAvg,
        iceScoreAvg: metrics.iceScoreAvg,
        easeScoreAvg: metrics.easeScoreAvg,
        engineStatus: state.engineStatus,
        activeContext: state.activeContext,
        activeTask: state.activeTask,
        stage: state.stage,
        analyticsHistory: data.analytics || [],
        scoreHealth,
        knowmoreHealth,
        observabilitySummary,
      }
    });

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    console.error("[INTELLIGENCE:SNAPSHOT:PUSH] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
