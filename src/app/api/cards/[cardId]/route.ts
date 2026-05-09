import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function normalizeCardPayload(card: any, entityType: "TASK" | "GOAL" | "KNOWLEDGE", companyId: string) {
  return {
    id: card.id,
    companyId,
    entityType,
    title: card.title,
    body: entityType === "KNOWLEDGE" ? card.body : card.description ?? card.body ?? "",
    processingStatus: card.processingStatus,
    iceScore: card.iceScore ?? 0,
    hashtags: Array.isArray(card.hashtags) ? card.hashtags : [],
    createdAt: card.createdAt ?? null,
    updatedAt: card.updatedAt ?? null,
    publicId: card.publicId ?? null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await params;

  const [task, goal, knowledge] = await Promise.all([
    prisma.nBAItem.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        title: true,
        description: true,
        processingStatus: true,
        iceScore: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.goalcard.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        title: true,
        body: true,
        processingStatus: true,
        iceScore: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.flashcard.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        title: true,
        body: true,
        processingStatus: true,
        iceScore: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const found =
    task
      ? { entityType: "TASK" as const, companyId: task.companyId, data: normalizeCardPayload(task, "TASK", task.companyId) }
      : goal
        ? { entityType: "GOAL" as const, companyId: goal.companyId, data: normalizeCardPayload(goal, "GOAL", goal.companyId) }
        : knowledge
          ? { entityType: "KNOWLEDGE" as const, companyId: knowledge.companyId, data: normalizeCardPayload(knowledge, "KNOWLEDGE", knowledge.companyId) }
          : null;

  if (!found) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const auth = await verifyMembership(request, found.companyId);
  if (auth.error) return auth.error;

  return NextResponse.json(found.data, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
