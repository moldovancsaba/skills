import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

/**
 * SOVEREIGN WORKER STATUS API (Decoupled)
 * v0.12.0
 *
 * Reads operational status from the shared GlobalSetting table.
 * This allows Vercel to see the Local AI Server's state via MongoDB Atlas.
 */
export async function GET() {
  try {
    const setting = await prisma.globalSetting.findUnique({
      where: { key: "core_synthesis_progress" }
    });

    if (!setting) {
      return NextResponse.json({
        online: false,
        state: "offline",
        message: "Worker has never reported status."
      });
    }

    const data = setting.value as any;
    const lastUpdate = new Date(setting.updatedAt).getTime();
    const isStale = (Date.now() - lastUpdate) > 10 * 60 * 1000; // 10 minutes tolerance

    if (isStale) {
      return NextResponse.json({
        online: false,
        state: "offline",
        message: "Worker heartbeat is stale. Local server may be down."
      });
    }

    return NextResponse.json({
      online: true,
      state:          data.state,
      stage:          data.stage,
      pass:           data.pass,
      currentCompany: data.currentCompany,
      cycleCount:     data.cycleCount,
      lastProgressAt: data.lastProgressAt,
      timestamp:      data.timestamp
    });
  } catch (error) {
    console.error("[API:WORKER-STATUS] Failure:", error);
    return NextResponse.json({
      online: false,
      state: "offline",
      message: "Database connection failure."
    }, { status: 500 });
  }
}
