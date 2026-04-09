import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
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
