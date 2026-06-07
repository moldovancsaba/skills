import { NextRequest, NextResponse } from "next/server";
import { verifyBackgroundJobSecret } from "@/lib/ingest-auth";
import { CONTENT_HEALTH_DEFAULT_TIMEZONE, CONTENT_HEALTH_MAX_HOURS, buildOperatorContentHealth } from "@/lib/operator-content-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await verifyBackgroundJobSecret(request);
  if (auth.error) return auth.error;

  try {
    const hours = Number(request.nextUrl.searchParams.get("hours") || CONTENT_HEALTH_MAX_HOURS);
    const timezone = request.nextUrl.searchParams.get("timezone") || CONTENT_HEALTH_DEFAULT_TIMEZONE;
    const dashboard = await buildOperatorContentHealth({ hours, timezone, persistSnapshots: true });

    return NextResponse.json({
      ok: true,
      cron: true,
      generatedAt: dashboard.generatedAt,
      status: dashboard.health.status,
      alert: dashboard.health.alert,
      anomalies: dashboard.health.anomalies,
      snapshots: dashboard.snapshots,
      message: "Operator content health snapshots refreshed.",
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to refresh operator content health snapshots", error);
    return NextResponse.json({ error: "Operator content health cron failed" }, { status: 500 });
  }
}
