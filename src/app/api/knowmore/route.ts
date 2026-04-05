import { NextRequest, NextResponse } from "next/server";
import { listCompanyFlashcards } from "@/lib/flashcards";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  try {
    const flashcards = await listCompanyFlashcards(companyId);
    return NextResponse.json(flashcards);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
