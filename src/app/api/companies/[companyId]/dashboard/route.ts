import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { APP_VERSION, BRAIN_VERSION } from "@/lib/release";

export const dynamic = 'force-dynamic';

/**
 * UNIT DASHBOARD SUMMARY API
 * v0.16.0
 * 
 * Implements State Snapshot Architecture:
 * - READ-ONLY: All metrics fetched from IntelligenceSnapshot.
 * - ZERO CALCULATION: No on-the-fly counts or filters.
 * - AUTHORITATIVE: Only updated by Local AI Server.
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
    
    // 1. Fetch Company, Members, and the Absolute Snapshot
    const [company, members, snapshot] = await Promise.all([
      prisma.company.findUnique({ where: { id: cid } }),
      prisma.user.findMany({ where: { companyId: cid } }),
      prisma.intelligenceSnapshot.findUnique({ where: { companyId: cid } })
    ]);

    // 2. Fetch Active Top Tasks (The only real-time query allowed for operational flow)
    const topTasks = await prisma.nBAItem.findMany({
      where: {
        companyId: cid,
        kanbanColumn: "CHECKLIST",
        activityState: "ACTIVE",
        OR: [
          { scheduledDate: null },
          { scheduledDate: { lte: now } }
        ]
      },
      orderBy: { iceScore: "desc" },
      take: 3
    });

    // 3. Fallback logic if Local AI hasn't pushed a snapshot yet
    const counts = snapshot ? {
      sources: snapshot.dataIngressCount,
      files: 0, // Consolidated in dataIngress
      topics: snapshot.topicSynthesisCount,
      flashcards: snapshot.knowmoreCount,
      goals: snapshot.strategicGoalsCount,
      nbaItems: snapshot.tacticalBoardCount,
      checklistCount: snapshot.checklistCount ?? topTasks.length,
      reviewCount: snapshot.reviewGatewayCount
    } : {
      sources: 0,
      files: 0,
      topics: 0,
      flashcards: 0,
      goals: 0,
      nbaItems: 0,
      checklistCount: 0,
      reviewCount: 0
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
