import { FlashcardActionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { recordFlashcardAction } from "@/lib/flashcards";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { sanitizeOptionalUserFacingText } from "@/lib/ui-utils";

const VALID_ACTIONS = new Set<FlashcardActionType>([
  FlashcardActionType.ACCEPT,
  FlashcardActionType.DECLINE,
  FlashcardActionType.MODIFY_ACCEPT,
]);

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = payload as any;
    const action = data.action as FlashcardActionType;
    const sanitizedAnnotation = sanitizeOptionalUserFacingText(data.annotation);

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

    const flashcard = await prisma.flashcard.findUnique({
      where: { id: data.flashcardId },
      select: { companyId: true },
    });

    if (!flashcard) {
      return NextResponse.json(
        { error: "Flashcard not found" },
        { status: 404 },
      );
    }

    const auth = await verifyMembership(request, flashcard.companyId);
    if (auth.error) return auth.error;

    const result = await recordFlashcardAction({
      flashcardId: data.flashcardId,
      action,
      annotation: sanitizedAnnotation ?? undefined,
      modifiedTitle: data.modifiedTitle,
      modifiedBody: data.modifiedBody,
    });

    await recordInteractionEventFromRequest(request, {
      companyId: result.companyId,
      surface: "knowmore-review",
      interactionType:
        action === FlashcardActionType.ACCEPT
          ? "KNOWLEDGE_ACCEPT"
          : action === FlashcardActionType.DECLINE
            ? "KNOWLEDGE_DECLINE"
            : "KNOWLEDGE_MODIFY_ACCEPT",
      entityType: "KNOWLEDGE",
      entityId: result.flashcard.id,
      afterState: {
        processingStatus: result.flashcard.processingStatus,
        activityState: result.flashcard.activityState,
        title: result.flashcard.title,
      },
      payload: {
        annotation: sanitizedAnnotation,
        modifiedTitle: data.modifiedTitle,
        modifiedBody: data.modifiedBody,
      },
      teachingWeight:
        action === FlashcardActionType.MODIFY_ACCEPT
          ? 100
          : action === FlashcardActionType.DECLINE
            ? 95
            : 90,
    });

    await recordOutcomeEvent({
      companyId: result.companyId,
      actorType: "HUMAN",
      entityType: "KNOWLEDGE",
      entityId: result.flashcard.id,
      outcomeType: "FLASHCARD_REVIEW_ACTION",
      outcomeValue: action,
      annotation: sanitizedAnnotation ?? undefined,
      afterState: {
        processingStatus: result.flashcard.processingStatus,
        activityState: result.flashcard.activityState,
      },
      teachingWeight:
        action === FlashcardActionType.MODIFY_ACCEPT
          ? 100
          : action === FlashcardActionType.DECLINE
            ? 95
            : 90,
    });

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
