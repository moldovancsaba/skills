import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Initial counts (before 30 days ago)
    const [initialSources, initialFiles, initialTopics, initialFlashcards, initialNBA] = await Promise.all([
      prisma.source.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.uploadedSourceFile.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.topic.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
      prisma.flashcard.count({ 
        where: { 
          companyId, 
          createdAt: { lt: thirtyDaysAgo },
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
          activityState: { in: ["ACTIVE", "STALE"] }
        } 
      }),
      prisma.nBAItem.count({ 
        where: { 
          companyId, 
          createdAt: { lt: thirtyDaysAgo },
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
          activityState: { in: ["ACTIVE", "STALE"] },
          OR: [
            { scheduledDate: null },
            { scheduledDate: { lte: new Date() } }
          ]
        } 
      }),
    ]);

    // Incremental data (last 30 days)
    const [sources, files, topics, flashcards, nba] = await Promise.all([
      prisma.source.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      prisma.uploadedSourceFile.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      prisma.topic.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      prisma.flashcard.findMany({ 
        where: { 
          companyId, 
          createdAt: { gte: thirtyDaysAgo },
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
          activityState: { in: ["ACTIVE", "STALE"] }
        }, 
        select: { createdAt: true } 
      }),
      prisma.nBAItem.findMany({ 
        where: { 
          companyId, 
          createdAt: { gte: thirtyDaysAgo },
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
          activityState: { in: ["ACTIVE", "STALE"] },
          OR: [
            { scheduledDate: null },
            { scheduledDate: { lte: new Date() } }
          ]
        }, 
        select: { createdAt: true } 
      }),
    ]);

    // Group by day
    const history = [];
    let currentSources = initialSources + initialFiles;
    let currentTopics = initialTopics;
    let currentFlashcards = initialFlashcards;
    let currentNBA = initialNBA;

    for (let i = 0; i <= 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().split('T')[0];

      const daySources = sources.filter(s => s.createdAt.toISOString().split('T')[0] === dayStr).length;
      const dayFiles = files.filter(f => f.createdAt.toISOString().split('T')[0] === dayStr).length;
      const dayTopics = topics.filter(t => t.createdAt.toISOString().split('T')[0] === dayStr).length;
      const dayFlashcards = flashcards.filter(f => f.createdAt.toISOString().split('T')[0] === dayStr).length;
      const dayNBA = nba.filter(n => n.createdAt.toISOString().split('T')[0] === dayStr).length;

      currentSources += (daySources + dayFiles);
      currentTopics += dayTopics;
      currentFlashcards += dayFlashcards;
      currentNBA += dayNBA;

      history.push({
        date: dayStr,
        sources: currentSources,
        topics: currentTopics,
        flashcards: currentFlashcards,
        nba: currentNBA,
      });
    }

    return NextResponse.json(history);
  } catch (error) {
    console.error("[API:Analytics] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
