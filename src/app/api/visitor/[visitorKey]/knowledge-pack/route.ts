import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { listVisitorFlashcards } from "@/lib/visitor-knowledge-pack";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  const flashcards = await listVisitorFlashcards(companyId, visitorKey);
  return NextResponse.json({ ok: true, visitorKey, flashcards });
}
