import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

/**
 * SOVEREIGN DEFIBRILLATOR API (Decoupled)
 * v0.12.0
 *
 * Signals a reanimation request by updating a timestamp in the shared database.
 * The Local AI Worker polls this setting to detect manual triggers from the cloud.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;

    const signal = {
      timestamp: new Date().toISOString(),
      requestedBy: "Dashboard"
    };

    await prisma.globalSetting.upsert({
      where: { key: "core_synthesis_reanimate_requested_at" },
      create: { key: "core_synthesis_reanimate_requested_at", value: signal },
      update: { value: signal, updatedAt: new Date() }
    });

    return NextResponse.json({ 
      success: true, 
      message: "Defibrillator signal dispatched to MongoDB. System will reanimate shortly." 
    });
  } catch (error) {
    console.error("[API:REANIMATE] Failure:", error);
    return NextResponse.json({ 
      success: false, 
      message: "Failed to dispatch reanimation signal to database." 
    }, { status: 500 });
  }
}
