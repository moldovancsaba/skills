import { NextRequest, NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

/**
 * SOVEREIGN DEFIBRILLATOR API
 * v0.11.6
 *
 * Proxies a force-trigger request to the internal Trinity Worker.
 * Bypasses scheduling cooldowns to reanimate the system on demand.
 * 
 * Restricted to SuperAdmins only to prevent compute exhaustion.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch("http://127.0.0.1:10005/force", {
      method: "POST",
      signal: controller.signal,
      cache: 'no-store'
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({ 
        success: false, 
        message: "Worker rejected reanimation request." 
      }, { status: 502 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Defibrillator engaged. System reanimating..." 
    });
  } catch (error) {
    console.error("[API:REANIMATE] Failure:", error);
    return NextResponse.json({ 
      success: false, 
      message: "Worker unreachable. Reanimation failed." 
    }, { status: 503 });
  }
}
