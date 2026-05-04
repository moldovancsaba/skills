
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { APP_VERSION, BRAIN_VERSION } from "@/lib/release";

export const dynamic = 'force-dynamic';

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
    
    // 1. Parallel Batch Query for Metadata
    const [company, members, sourcesCount, filesCount, topicsCount, knowmoreCount, nbaItemsCount] = await Promise.all([
      prisma.company.findUnique({ where: { id: cid } }),
      prisma.user.findMany({ where: { companyId: cid } }),
      prisma.source.count({ where: { companyId: cid } }),
      prisma.uploadedSourceFile.count({ where: { companyId: cid } }),
      prisma.topic.count({ where: { companyId: cid } }),
      prisma.flashcard.count({ where: { companyId: cid, activityState: { in: ["ACTIVE", "STALE"] } } }),
      prisma.nBAItem.count({ where: { companyId: cid, activityState: { in: ["ACTIVE", "STALE"] } } }),
    ]);

    // 2. Fetch Top Tasks (Checklist)
    const topTasks = await prisma.nBAItem.findMany({
      where: {
        companyId: cid,
        kanbanColumn: "CHECKLIST",
        activityState: { in: ["ACTIVE", "STALE"] },
        OR: [
          { scheduledDate: null },
          { scheduledDate: { lte: now } }
        ]
      },
      orderBy: { iceScore: "desc" },
      take: 3
    });

    // 3. Analytics History (Compressed logic from analytics/counts)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const [hSources, hFiles, hTopics, hFlashcards, hNBA] = await Promise.all([
      prisma.source.findMany({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      prisma.uploadedSourceFile.findMany({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      prisma.topic.findMany({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      prisma.flashcard.findMany({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      prisma.nBAItem.findMany({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    ]);

    // Pre-calculate baseline counts
    const [bSources, bFiles, bTopics, bFlashcards, bNBA] = await Promise.all([
      prisma.source.count({ where: { companyId: cid, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.uploadedSourceFile.count({ where: { companyId: cid, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.topic.count({ where: { companyId: cid, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.flashcard.count({ where: { companyId: cid, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.nBAItem.count({ where: { companyId: cid, createdAt: { lt: thirtyDaysAgo } } }),
    ]);

    const history = [];
    let curS = bSources + bFiles;
    let curT = bTopics;
    let curK = bFlashcards;
    let curN = bNBA;

    for (let i = 0; i <= 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().split('T')[0];

      curS += hSources.filter(s => s.createdAt.toISOString().split('T')[0] === dayStr).length;
      curS += hFiles.filter(f => f.createdAt.toISOString().split('T')[0] === dayStr).length;
      curT += hTopics.filter(t => t.createdAt.toISOString().split('T')[0] === dayStr).length;
      curK += hFlashcards.filter(f => f.createdAt.toISOString().split('T')[0] === dayStr).length;
      curN += hNBA.filter(n => n.createdAt.toISOString().split('T')[0] === dayStr).length;

      history.push({ date: dayStr, sources: curS, topics: curT, flashcards: curK, nba: curN });
    }

    // 4. Return Unified Context
    return NextResponse.json({
      company,
      members,
      counts: {
        sources: sourcesCount,
        files: filesCount,
        topics: topicsCount,
        flashcards: knowmoreCount,
        nbaItems: nbaItemsCount,
        pendingTasks: topTasks.length
      },
      topTasks,
      analytics: history,
      versions: {
        app: APP_VERSION,
        brain: BRAIN_VERSION
      }
    });

  } catch (error) {
    console.error("[API:DashboardSummary] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
