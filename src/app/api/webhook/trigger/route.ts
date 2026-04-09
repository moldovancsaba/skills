import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, dataType, action } = body;
    return NextResponse.json({
      success: true,
      queued: true,
      companyId,
      dataType,
      action,
      message: "The hosted webapp does not contact the local AI worker. The worker should poll the shared database instead.",
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "passive",
    timestamp: Date.now(),
    message: "Webhook trigger is disabled. Local AI must poll the shared database.",
  });
}
