import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { upsertVisitorFlashcard } from "@/lib/visitor-knowledge-pack";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const payload = await request.json().catch(() => null);
  const body = asRecord(payload);
  if (!body) return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const card = asRecord(body.flashcard);
  if (!card) return NextResponse.json({ ok: false, error: "flashcard is required" }, { status: 400 });

  const { visitorKey } = await params;
  const destinationKey = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
  try {
    const saved = await upsertVisitorFlashcard(companyId, visitorKey, {
      ...card,
      flashcardId: typeof card.flashcardId === "string" ? card.flashcardId : randomUUID(),
    }, destinationKey);
    return NextResponse.json({ ok: true, flashcard: saved });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
