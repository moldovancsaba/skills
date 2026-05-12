import { NextRequest, NextResponse } from "next/server";
import { listCompanyFlashcards } from "@/lib/flashcards";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const offsetParam = request.nextUrl.searchParams.get("offset");
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
            source.entityTag === "AGENT_FOUND" ||
            (metadata && typeof metadata === "object" && (
              metadata.origin === "research-harvest" || 
              metadata.type === "RESEARCH_HARVEST"
            ))
          );
        })
        .map((source) => source.id)
    );

    const serialized = flashcards.map((flashcard) => {
      const lineage = flashcard as typeof flashcard & {
        generatedFromIds?: string[];
        versionFamilyId?: string | null;
        duplicateClusterId?: string | null;
        refinedFromId?: string | null;
      };

      return ({
      id: flashcard.id,
      publicId: flashcard.publicId ?? null,
      kind: flashcard.kind,
      title: flashcard.title,
      body: flashcard.body,
      confidenceScore: flashcard.confidenceScore,
      impact: flashcard.impact,
      weight: flashcard.weight,
      processingStatus: flashcard.processingStatus,
      activityState: flashcard.activityState,
      userAnnotation: flashcard.userAnnotation,
      hashtags: flashcard.hashtags,
      createdAt: flashcard.createdAt,
      updatedAt: flashcard.updatedAt,
      lastActionAt: flashcard.lastActionAt,
      refreshedAt: flashcard.refreshedAt,
      intelligenceType: flashcard.intelligenceType,
      iceScore: flashcard.iceScore,
      conflictDetected: flashcard.conflictDetected,
      conflictSummary: flashcard.conflictSummary,
      generatedFromIds: lineage.generatedFromIds ?? [],
      versionFamilyId: lineage.versionFamilyId ?? null,
      duplicateClusterId: lineage.duplicateClusterId ?? null,
      refinedFromId: lineage.refinedFromId ?? null,
      sources: flashcard.sources.map((source) => ({
        id: source.id,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourcePublicId: source.sourcePublicId ?? null,
        sourceName: source.sourceName,
        relationRole: source.relationRole,
      })),
      actions: flashcard.actions.map((action) => ({
        id: action.id,
        action: action.action,
        annotation: action.annotation ?? null,
        modifiedTitle: action.modifiedTitle ?? null,
        modifiedBody: action.modifiedBody ?? null,
        createdAt: action.createdAt,
      })),
      corrections: flashcard.corrections.map((correction) => ({
        id: correction.id,
        correctionType: correction.correctionType,
        note: correction.note ?? null,
        sourceType: correction.sourceType ?? null,
        sourceId: correction.sourceId ?? null,
        sourcePublicId: correction.sourcePublicId ?? null,
        sourceName: correction.sourceName ?? null,
        createdAt: correction.createdAt,
      })),
      ischecklistResearch: flashcard.sources.some((source) => source.sourceType === "SOURCE" && researchHarvestIds.has(source.sourceId)),
    });
    });

    const limit = limitParam ? Number(limitParam) : null;
    const offset = offsetParam ? Number(offsetParam) : 0;

    if (limit && Number.isFinite(limit) && limit > 0) {
      const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
      const items = serialized.slice(safeOffset, safeOffset + limit);
      return NextResponse.json({
        items,
        hasMore: safeOffset + limit < serialized.length,
        total: serialized.length,
      }, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    return NextResponse.json(serialized, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[API:KNOWMORE] Get failure:", error);
    // Iron-Clad: Return empty array to prevent frontend 'filter' crash
    return NextResponse.json([]);
  }
}
