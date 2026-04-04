import { NextRequest, NextResponse } from "next/server";

const LOCAL_SYNC_URL = process.env.LOCAL_SYNC_URL || "http://127.0.0.1:3001";
const LOCAL_SYNC_SECRET = process.env.LOCAL_SYNC_SECRET = "checklist-sync-2024";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    
    if (authHeader !== `Bearer ${LOCAL_SYNC_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { companyId, dataType, action } = body;

    try {
      await fetch(`${LOCAL_SYNC_URL}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, dataType, action }),
      });
    } catch (e) {
      console.log("Local sync unavailable, will process on next sync");
    }

    return NextResponse.json({ success: true, triggered: Date.now() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: Date.now() });
}