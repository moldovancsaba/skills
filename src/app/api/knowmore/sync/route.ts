import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => ({}));
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const { companyId } = bodyRaw as Record<string, unknown>;

    if (typeof companyId !== "string" || !companyId.trim()) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      queued: true,
      message: "The hosted webapp does not run local AI. The local worker must poll the shared database.",
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
