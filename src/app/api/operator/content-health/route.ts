import { NextRequest, NextResponse } from "next/server";
import { readAppSession } from "@/lib/auth";
import { CONTENT_HEALTH_OPERATOR_EMAIL, buildOperatorContentHealth } from "@/lib/operator-content-health";
import { isSuperAdminEmail } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function verifyContentHealthAccess(request: NextRequest) {
  const session = await readAppSession(request);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const email = session.email.trim().toLowerCase();
  if (email === CONTENT_HEALTH_OPERATOR_EMAIL || await isSuperAdminEmail(email)) {
    return { session };
  }

  return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function GET(request: NextRequest) {
  const auth = await verifyContentHealthAccess(request);
  if (auth.error) return auth.error;

  const hours = Number(request.nextUrl.searchParams.get("hours") || "");
  const timezone = request.nextUrl.searchParams.get("timezone");
  try {
    const dashboard = await buildOperatorContentHealth({ hours, timezone });

    return NextResponse.json({
      ok: true,
      dashboard,
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to build operator content health dashboard", error);
    return NextResponse.json({ error: "Dashboard unavailable" }, { status: 500 });
  }
}
