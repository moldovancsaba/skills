import { NextRequest, NextResponse } from "next/server";
import { listCompanyFlashcards } from "@/lib/flashcards";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const flashcards = await listCompanyFlashcards(companyId as string);
    const sourceIds = [...new Set(
      flashcards
        .flatMap((flashcard) => flashcard.sources || [])
        .filter((source) => source.sourceType === "SOURCE")
        .map((source) => source.sourceId)
    )];
    const researchHarvestSources = sourceIds.length > 0
      ? await prisma.source.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, entityTag: true, metadata: true },
        })
      : [];
    const researchHarvestIds = new Set(
      researchHarvestSources
        .filter((source) => {
          const metadata = (source.metadata as Record<string, unknown>) || {};
          return (
            source.entityTag === "research-harvest" ||
            (metadata && typeof metadata === "object" && metadata.origin === "research-harvest")
          );
        })
        .map((source) => source.id)
    );

    return NextResponse.json(flashcards.map((flashcard) => ({
      ...flashcard,
      isSovereignResearch: flashcard.sources.some((source) => source.sourceType === "SOURCE" && researchHarvestIds.has(source.sourceId)),
    })), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
