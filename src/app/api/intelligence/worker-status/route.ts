import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

/**
 * SOVEREIGN WORKER STATUS PROXY
 * v0.11.3-PRODUCTION
 *
 * Bridges the internal Trinity Worker (Port 10005) to the frontend pill indicator.
 * Kept intentionally minimal — full monitoring belongs in the local status server.
 */
export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch("http://127.0.0.1:10005/health", {
      signal: controller.signal,
      cache: 'no-store'
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({
        online: false,
        state: "offline",
        message: "Worker responded with error status."
      });
    }

    const data = await res.json();
    return NextResponse.json({
      online: true,
      state:          data.progress.state,
      stage:          data.progress.stage,
      pass:           data.progress.pass,
      currentCompany: data.progress.currentCompany,
      cycleCount:     data.progress.cycleCount,
      lastProgressAt: data.progress.lastProgressAt,
      settings: {
        cooldownMs: data.settings.companyCycleCooldownMs
      }
    });
  } catch {
    return NextResponse.json({
      online: false,
      state: "offline",
      message: "Worker unreachable. Ensure the Guardian is active."
    });
  }
}
