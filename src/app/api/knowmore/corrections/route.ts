import { FlashcardCorrectionType, FlashcardSourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  listCompanyFlashcardCorrections,
  recordFlashcardCorrection,
} from "@/lib/flashcards";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";

const VALID_CORRECTIONS = new Set<FlashcardCorrectionType>([
  FlashcardCorrectionType.HIDE,
  FlashcardCorrectionType.MARK_WRONG,
  FlashcardCorrectionType.PIN,
  FlashcardCorrectionType.REQUEST_REFRESH,
  FlashcardCorrectionType.SUPPRESS_SOURCE,
]);

const VALID_SOURCE_TYPES = new Set<FlashcardSourceType>([
  FlashcardSourceType.SOURCE,
  FlashcardSourceType.FILE,
  FlashcardSourceType.AGENT_FOUND,
]);

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  try {
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    const corrections = await listCompanyFlashcardCorrections(companyId);
    return NextResponse.json(corrections);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const correctionType = data.correctionType as FlashcardCorrectionType;
    const sourceType = data.sourceType as FlashcardSourceType | undefined;

    if (!VALID_CORRECTIONS.has(correctionType)) {
      return NextResponse.json({ error: "Invalid correctionType" }, { status: 400 });
    }

    if (sourceType && !VALID_SOURCE_TYPES.has(sourceType)) {
      return NextResponse.json({ error: "Invalid sourceType" }, { status: 400 });
    }

    if (!data.companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, data.companyId);
    if (auth.error) return auth.error;

    const result = await recordFlashcardCorrection({
      companyId: data.companyId,
      flashcardId: data.flashcardId,
      sourceType,
      sourceId: data.sourceId,
      sourcePublicId: data.sourcePublicId,
      sourceName: data.sourceName,
      correctionType,
      note: data.note,
    });

    await recordInteractionEventFromRequest(request, {
      companyId: result.companyId,
      surface: "knowmore-corrections",
      interactionType: `KNOWLEDGE_${correctionType}`,
      entityType: "KNOWLEDGE",
      entityId: data.flashcardId,
      payload: {
        sourceType,
        sourceId: data.sourceId,
        sourcePublicId: data.sourcePublicId,
        sourceName: data.sourceName,
        note: data.note,
      },
      teachingWeight:
        correctionType === FlashcardCorrectionType.PIN
          ? 85
          : correctionType === FlashcardCorrectionType.REQUEST_REFRESH
            ? 60
            : 90,
    });

    await recordOutcomeEvent({
      companyId: result.companyId,
      actorType: "HUMAN",
      entityType: "KNOWLEDGE",
      entityId: data.flashcardId || data.sourceId,
      outcomeType: "FLASHCARD_CORRECTION",
      outcomeValue: correctionType,
      annotation: data.note,
      payload: {
        sourceType,
        sourceId: data.sourceId,
      },
      teachingWeight:
        correctionType === FlashcardCorrectionType.PIN
          ? 85
          : correctionType === FlashcardCorrectionType.REQUEST_REFRESH
            ? 60
            : 90,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("required") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
