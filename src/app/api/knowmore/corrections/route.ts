import { FlashcardCorrectionType, FlashcardSourceType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  listCompanyFlashcardCorrections,
  recordFlashcardCorrection,
  syncCompanyKnowledge,
} from "@/lib/flashcards";

const VALID_CORRECTIONS = new Set<FlashcardCorrectionType>([
  FlashcardCorrectionType.HIDE,
  FlashcardCorrectionType.MARK_WRONG,
  FlashcardCorrectionType.PIN,
  FlashcardCorrectionType.REQUEST_REFRESH,
  FlashcardCorrectionType.SUPPRESS_SOURCE,
]);

const VALID_SOURCE_TYPES = new Set<FlashcardSourceType>([
  FlashcardSourceType.PRODUCT,
  FlashcardSourceType.CUSTOMER,
  FlashcardSourceType.COMPETITOR,
  FlashcardSourceType.FILE,
  FlashcardSourceType.AGENT_FOUND,
]);

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  try {
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

    await syncCompanyKnowledge(result.companyId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("required") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
