import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { listCompanyFlashcards } from "@/lib/flashcards";
import { verifyMembership } from "@/lib/permissions";

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
    const confidenceInput = data.confidenceScore ?? data.confidence;
    const normalizedConfidence = confidenceInput !== undefined
      ? Math.max(1, Math.min(100, Number(confidenceInput)))
      : existing.confidenceScore;
    const normalizedImpact = data.impact !== undefined
      ? Math.max(1, Math.min(10, Number(data.impact)))
      : existing.impact;
    const normalizedWeight = data.weight !== undefined
      ? Math.max(1, Math.min(10, Number(data.weight)))
      : existing.weight;
    const nextIceScore = normalizedImpact * (normalizedConfidence / 10) * normalizedWeight;

    const updated = await prisma.flashcard.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        body: data.body ?? existing.body,
        confidence: Math.round(normalizedConfidence),
        confidenceScore: normalizedConfidence,
        impact: normalizedImpact,
        weight: normalizedWeight,
        iceScore: nextIceScore,
        processingStatus: data.processingStatus ?? existing.processingStatus,
        activityState: data.activityState ?? existing.activityState,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API:FLASHCARDS] Patch failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
