import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    return NextResponse.json({
      success: true,
      queued: true,
      message: "The webapp does not call the local AI directly. Start the local worker against the shared database to generate results.",
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
