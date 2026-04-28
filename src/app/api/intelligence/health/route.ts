import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

/**
 * Reports the health of the background synthesis engine.
 * Instead of proxying to a local port, we read the 'core_synthesis_progress' 
 * setting from the database, which the worker updates every 60 seconds.
 */
export async function GET(request: NextRequest) {
  try {
    const setting = await prisma.globalSetting.findUnique({
      where: { key: "core_synthesis_progress" }
    });

    if (!setting) {
      return NextResponse.json({ 
        status: "OFFLINE", 
        error: "Engine progress record not found in database." 
      }, { status: 200 });
    }

    const data = setting.value as any;
    const lastUpdate = new Date(setting.updatedAt).getTime();
    const now = Date.now();
    
    // Consider it offline if no heartbeat for > 10 minutes
    const isStale = (now - lastUpdate) > 10 * 60 * 1000;

    return NextResponse.json({
      status: isStale ? "OFFLINE" : "ONLINE",
      uptime: data.uptime || "unknown",
      timestamp: new Date(setting.updatedAt).toISOString(),
      metrics: {
        total_cycles: data.cycleCount || 0,
        avg_cycle_duration: data.metrics?.avg_cycle_duration || "0",
        total_operations: data.metrics?.totalOpsThisCycle || 0,
        failure_rate: data.metrics?.failureRate || "0",
        backlog: data.backlog || { draft_cards: 0, checked_cards: 0 },
        cycleHistory: data.metrics?.cycleHistory || []
      },
      errorStats: data.errorStats || { attempts: 0, failures: 0, rate: "0", streak: 0 }
    });
  } catch (error) {
    console.error("[API:IntelligenceHealth] Failure:", error);
    return NextResponse.json({ 
      status: "OFFLINE", 
      error: "Internal database connection error" 
    }, { status: 200 });
  }
}
