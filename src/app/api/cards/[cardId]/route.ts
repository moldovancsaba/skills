import { NextRequest, NextResponse } from "next/server";
import { resolveSharedCardById } from "@/lib/shared-card";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await params;

  const found = await resolveSharedCardById(cardId);
  if (!found) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  return NextResponse.json(found, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
