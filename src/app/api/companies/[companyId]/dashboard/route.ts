import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { APP_VERSION, BRAIN_VERSION } from "@/lib/release";
import { computeCompanyScoreHealth } from "@/lib/score-health";

export const dynamic = "force-dynamic";

/**
 * Unit dashboard summary API.
 *
 * Returns the canonical company summary used by the dashboard and nav.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const cid = companyId;
    const now = new Date();

    const [company, members, snapshot, scoreHealth, liveCounts] = await Promise.all([
      prisma.company.findUnique({ where: { id: cid } }),
      prisma.user.findMany({ where: { companyId: cid } }),
      prisma.intelligenceSnapshot.findUnique({ where: { companyId: cid } }),
      computeCompanyScoreHealth(cid, prisma),
      Promise.all([
        prisma.source.count({ where: { companyId: cid } }),
        prisma.uploadedSourceFile.count({ where: { companyId: cid } }),
        prisma.topic.count({ where: { companyId: cid } }),
        prisma.flashcard.count({
          where: {
            companyId: cid,
            activityState: { in: ["ACTIVE", "STALE"] },
          },
        }),
        prisma.goalcard.count({
          where: {
            companyId: cid,
            activityState: { in: ["ACTIVE", "STALE"] },
          },
        }),
        prisma.nBAItem.count({
          where: {
            companyId: cid,
            activityState: { in: ["ACTIVE", "STALE"] },
          },
        }),
        prisma.nBAItem.count({
          where: {
            companyId: cid,
            kanbanColumn: "CHECKLIST",
            activityState: { in: ["ACTIVE", "STALE"] },
            processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
            OR: [
              { scheduledDate: null },
              { scheduledDate: { lte: now } },
            ],
          },
        }),
        prisma.nBAItem.count({
          where: {
            companyId: cid,
            processingStatus: "REVIEW",
            activityState: { in: ["ACTIVE", "STALE"] },
          },
        }),
        prisma.pipelineJob.count({
          where: {
            companyId: cid,
            status: { in: ["ACTIVE", "RUNNING", "FAILED"] },
            queueColumn: { not: "PARKED" },
          },
        }),
      ]).then(([
        sourceCount,
        fileCount,
        topicCount,
        flashcardCount,
        goalCount,
        nbaItemCount,
        checklistCount,
        reviewCount,
        pipelineJobCount,
      ]) => ({
        sources: sourceCount + fileCount,
        files: fileCount,
        topics: topicCount,
        flashcards: flashcardCount,
        goals: goalCount,
        nbaItems: nbaItemCount,
        checklistCount,
        reviewCount,
        pipelineJobs: pipelineJobCount,
      })),
    ]);

    const topTasks = await prisma.nBAItem.findMany({
      where: {
        companyId: cid,
        kanbanColumn: "CHECKLIST",
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [
          { scheduledDate: null },
          { scheduledDate: { lte: now } }
        ]
      },
      orderBy: { iceScore: "desc" },
      take: 3
    });

    const counts = {
      sources: Math.max(snapshot?.dataIngressCount ?? 0, liveCounts.sources),
      files: liveCounts.files,
      topics: Math.max(snapshot?.topicSynthesisCount ?? 0, liveCounts.topics),
      flashcards: Math.max(snapshot?.knowmoreCount ?? 0, liveCounts.flashcards),
      goals: Math.max(snapshot?.strategicGoalsCount ?? 0, liveCounts.goals),
      nbaItems: Math.max(snapshot?.tacticalBoardCount ?? 0, liveCounts.nbaItems),
      checklistCount: Math.max(snapshot?.checklistCount ?? 0, liveCounts.checklistCount, topTasks.length),
      reviewCount: Math.max(snapshot?.reviewGatewayCount ?? 0, liveCounts.reviewCount),
      pipelineJobs: liveCounts.pipelineJobs,
    };

    return NextResponse.json({
      company,
      members,
      counts,
      topTasks,
      analytics: snapshot?.analyticsHistory || [],
      metrics: {
        synthesisYield: snapshot?.synthesisYield || 0,
        confidenceAvg: snapshot?.confidenceAvg || 0,
        iceScoreAvg: snapshot?.iceScoreAvg || 0,
        easeScoreAvg: snapshot?.easeScoreAvg || 0,
        scoreHealth,
      },
      versions: {
        app: APP_VERSION,
        brain: BRAIN_VERSION
      },
      state: {
        engineStatus: snapshot?.engineStatus || "OFFLINE",
        activeContext: snapshot?.activeContext || "IDLE",
        activeTask: snapshot?.activeTask || "Scanning...",
        stage: snapshot?.stage || "STANDBY",
        updatedAt: snapshot?.updatedAt
      }
    });

  } catch (error) {
    console.error("[API:DashboardSummary] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
