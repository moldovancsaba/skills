import { NextRequest, NextResponse } from "next/server";

import { recordDecisionEvent, recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { listCompanyFlashcards } from "@/lib/flashcards";
import { verifyMembership } from "@/lib/permissions";
import { normalizeKnowledgeScores } from "@/lib/scoring-contract";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const flashcards = await listCompanyFlashcards(companyId);
    return NextResponse.json(flashcards);
  } catch (error) {
    console.error("[API:FLASHCARDS] Get failure:", error);
    return NextResponse.json([]);
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const existing = await prisma.flashcard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const data = await request.json();
    const normalizedScores = normalizeKnowledgeScores({
      impact: data.impact ?? existing.impact,
      confidence: data.confidenceScore ?? data.confidence ?? existing.confidenceScore ?? existing.confidence,
      weight: data.weight ?? existing.weight,
    });

    const updated = await prisma.flashcard.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        body: data.body ?? existing.body,
        confidence: normalizedScores.confidence,
        confidenceScore: normalizedScores.confidenceScore,
        impact: normalizedScores.impact,
        weight: normalizedScores.weight,
        iceScore: normalizedScores.iceScore,
        processingStatus: data.processingStatus ?? existing.processingStatus,
        activityState: data.activityState ?? existing.activityState,
        updatedAt: new Date(),
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "knowmore",
      interactionType: "KNOWLEDGE_EDIT",
      entityType: "FLASHCARD",
      entityId: existing.id,
      beforeState: {
        title: existing.title,
        body: existing.body,
        impact: existing.impact,
        confidenceScore: existing.confidenceScore,
        weight: existing.weight,
        processingStatus: existing.processingStatus,
      },
      afterState: {
        title: updated.title,
        body: updated.body,
        impact: updated.impact,
        confidenceScore: updated.confidenceScore,
        weight: updated.weight,
        processingStatus: updated.processingStatus,
      },
      teachingWeight: 100,
    });

    await recordDecisionEvent({
      companyId: existing.companyId,
      decisionMaker: "human-review",
      decisionType: "FLASHCARD_SCORE_OVERRIDE",
      entityType: "FLASHCARD",
      entityId: existing.id,
      beforeState: {
        iceScore: existing.iceScore,
        impact: existing.impact,
        confidenceScore: existing.confidenceScore,
        weight: existing.weight,
      },
      afterState: {
        iceScore: updated.iceScore,
        impact: updated.impact,
        confidenceScore: updated.confidenceScore,
        weight: updated.weight,
      },
      teachingWeight: 90,
    });

    if (updated.processingStatus !== existing.processingStatus) {
      await recordOutcomeEvent({
        companyId: existing.companyId,
        actorType: "USER",
        entityType: "FLASHCARD",
        entityId: existing.id,
        outcomeType: updated.processingStatus,
        outcomeValue: updated.processingStatus,
        beforeState: { processingStatus: existing.processingStatus },
        afterState: { processingStatus: updated.processingStatus },
        teachingWeight: updated.processingStatus === "CHECKED" ? 90 : 60,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API:FLASHCARDS] Patch failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
