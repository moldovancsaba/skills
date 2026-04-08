import { NextRequest, NextResponse } from "next/server";
import { listCompanyFlashcards } from "@/lib/flashcards";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const flashcards = await listCompanyFlashcards(companyId as string);
    return NextResponse.json(flashcards, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
