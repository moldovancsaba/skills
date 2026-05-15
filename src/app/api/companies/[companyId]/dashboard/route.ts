import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { APP_VERSION, BRAIN_VERSION } from "@/lib/release";

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

    const [
      company,
      members,
      snapshot,
      liveSourceCount,
      liveFileCount,
      liveTopicCount,
      liveFlashcardCount,
      liveGoalCount,
      liveTacticalCount,
      liveChecklistCount,
      liveReviewCount,
    ] = await Promise.all([
      prisma.company.findUnique({ where: { id: cid } }),
      prisma.user.findMany({ where: { companyId: cid } }),
      prisma.intelligenceSnapshot.findUnique({ where: { companyId: cid } }),
      prisma.source.count({ where: { companyId: cid } }),
      prisma.uploadedSourceFile.count({ where: { companyId: cid } }),
      prisma.topic.count({ where: { companyId: cid } }),
      prisma.flashcard.count({
        where: {
          companyId: cid,
          activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        },
      }),
      prisma.goalcard.count({
        where: {
          companyId: cid,
          activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        },
      }),
      prisma.checklistTask.count({
        where: {
          companyId: cid,
          activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        },
      }),
      prisma.checklistTask.count({
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
      prisma.checklistTask.count({
        where: {
          companyId: cid,
          processingStatus: "REVIEW",
          activityState: { in: ["ACTIVE", "STALE"] },
        },
      }),
    ]);

    const topTasks = await prisma.checklistTask.findMany({
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

    const scoreHealth = snapshot?.scoreHealth && typeof snapshot.scoreHealth === "object" ? snapshot.scoreHealth : null;
    const observabilitySummary =
      snapshot?.observabilitySummary && typeof snapshot.observabilitySummary === "object"
        ? snapshot.observabilitySummary as Record<string, unknown>
        : {};
    const queue = observabilitySummary.queue && typeof observabilitySummary.queue === "object"
      ? observabilitySummary.queue as Record<string, unknown>
      : {};

    const counts = {
      sources: liveSourceCount + liveFileCount,
      files: liveFileCount,
      topics: liveTopicCount,
      flashcards: liveFlashcardCount,
      goals: liveGoalCount,
      tacticalCount: liveTacticalCount,
      checklistCount: Math.max(liveChecklistCount, topTasks.length),
      reviewCount: liveReviewCount,
      pipelineJobs: Number(queue.totalActiveJobs ?? 0),
    };

    return NextResponse.json({
      company,
      members,
      counts,
      topTasks,
      analytics: Array.isArray(snapshot?.analyticsHistory) ? snapshot.analyticsHistory : [],
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
