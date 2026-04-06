import { FlashcardActionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { recordFlashcardAction, syncCompanyKnowledge } from "@/lib/flashcards";

const VALID_ACTIONS = new Set<FlashcardActionType>([
  FlashcardActionType.ACCEPT,
  FlashcardActionType.DECLINE,
  FlashcardActionType.MODIFY_ACCEPT,
]);

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const action = data.action as FlashcardActionType;

    if (!data.flashcardId) {
      return NextResponse.json(
        { error: "flashcardId required" },
        { status: 400 },
      );
    }

    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: "Invalid flashcard action" },
        { status: 400 },
      );
    }

    const result = await recordFlashcardAction({
      flashcardId: data.flashcardId,
      action,
      annotation: data.annotation,
      modifiedTitle: data.modifiedTitle,
      modifiedBody: data.modifiedBody,
    });

    await syncCompanyKnowledge(result.companyId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("requires") ||
      message.includes("not found") ||
      message.includes("Only active")
      ? 400
      : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
