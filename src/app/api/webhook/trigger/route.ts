import { NextRequest, NextResponse } from "next/server";

const LOCAL_SYNC_URL = process.env.LOCAL_SYNC_URL || "http://127.0.0.1:3001";
const LOCAL_SYNC_SECRET = process.env.LOCAL_SYNC_SECRET || "checklist-sync-2024";

function isAuthorizedRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${LOCAL_SYNC_SECRET}`) {
    return true;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { companyId, dataType, action } = body;

    try {
      const syncResponse = await fetch(`${LOCAL_SYNC_URL}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOCAL_SYNC_SECRET}`,
        },
        body: JSON.stringify({ companyId, dataType, action }),
      });

      if (!syncResponse.ok) {
        const detail = await syncResponse.text();
        return NextResponse.json(
          { error: "Local sync rejected request", detail },
          { status: 502 },
        );
      }
    } catch (e) {
      console.log("Local sync unavailable, will process on next sync");
      return NextResponse.json({ success: true, queued: true, triggered: Date.now() }, { status: 202 });
    }

    return NextResponse.json({ success: true, triggered: Date.now() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: Date.now() });
}
