import { NextRequest, NextResponse } from "next/server";
import { syncCompanyKnowledge } from "@/lib/flashcards";

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    await syncCompanyKnowledge(companyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
