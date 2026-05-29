import { NextRequest, NextResponse } from "next/server";
import { recordDecisionEvent, recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { decorateWithBoardState, SURFACE_BOARD_CONFIG, updateBoardEntityState } from "@/lib/board-state";
import { verifyMembership } from "@/lib/permissions";
import { normalizeGoalScores } from "@/lib/scoring-contract";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(req, companyId);
  if (auth.error) return auth.error;

  const limit = limitParam ? Number(limitParam) : null;
  const offset = offsetParam ? Number(offsetParam) : 0;
  const safeLimit = limit && Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : null;
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;

  const baseWhere = {
    companyId,
    activityState: "ACTIVE" as const,
  };

  const goalcards = await prisma.goalcard.findMany({
    where: baseWhere,
    orderBy: [
      { iceScore: "desc" },
      { confidenceScore: "desc" },
      { updatedAt: "desc" },
      { publicId: "asc" },
    ],
    select: {
      id: true,
      publicId: true,
      companyId: true,
      title: true,
      body: true,
      confidence: true,
      impact: true,
      weight: true,
      processingStatus: true,
      activityState: true,
      confidenceScore: true,
      refreshedAt: true,
      createdAt: true,
      updatedAt: true,
      lastActionAt: true,
      userAnnotation: true,
      hashtags: true,
      intelligenceType: true,
      iceScore: true,
    },
    ...(safeLimit ? { skip: safeOffset, take: safeLimit } : {}),
  });

  const decorated = await decorateWithBoardState(companyId, SURFACE_BOARD_CONFIG.goals, goalcards);

  if (safeLimit) {
    const total = await prisma.goalcard.count({ where: baseWhere });
    return NextResponse.json({
      items: decorated,
      total,
      hasMore: safeOffset + decorated.length < total,
    });
  }

  return NextResponse.json(decorated);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, title, body: content, hashtags, intelligenceType, iceScore } = body;

    if (!companyId || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const auth = await verifyMembership(req, companyId);
    if (auth.error) return auth.error;

    const normalizedScores = normalizeGoalScores({
      impact: body.impact ?? 5,
      confidence: body.confidenceScore ?? body.confidence ?? 5,
      weight: body.weight ?? 5,
    });

    const goalcard = await prisma.goalcard.create({
      data: {
        companyId,
        title,
        body: content || "",
        hashtags: hashtags || [],
        intelligenceType: intelligenceType || "INTERNAL",
        confidence: normalizedScores.confidence,
        confidenceScore: normalizedScores.confidenceScore,
        impact: normalizedScores.impact,
        weight: normalizedScores.weight,
        iceScore: normalizedScores.iceScore,
        processingStatus: "ACCEPTED",
        kind: "GOAL",
      }
    });

    await recordInteractionEventFromRequest(req, {
      companyId,
      surface: "goals",
      interactionType: "DATACARD_PROMOTE_GOAL",
      entityType: "GOALCARD",
      entityId: goalcard.id,
      afterState: {
        title: goalcard.title,
        hashtags: goalcard.hashtags,
        intelligenceType: goalcard.intelligenceType,
      },
      teachingWeight: 50,
    });

    return NextResponse.json(goalcard);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const existing = await prisma.goalcard.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const auth = await verifyMembership(req, existing.companyId);
    if (auth.error) return auth.error;

    if (typeof body.destinationColumn === "string") {
      const updatedBoardState = await updateBoardEntityState({
        companyId: existing.companyId,
        config: SURFACE_BOARD_CONFIG.goals,
        entityId: existing.id,
        destinationColumn: body.destinationColumn,
        beforeId: typeof body.beforeId === "string" ? body.beforeId : null,
        afterId: typeof body.afterId === "string" ? body.afterId : null,
      });
      return NextResponse.json({
        ...existing,
        boardState: {
          boardKey: updatedBoardState.boardKey,
          entityType: updatedBoardState.entityType,
          columnKey: updatedBoardState.columnKey,
          orderRank: Number(updatedBoardState.orderRank ?? 0),
          priority: Number(updatedBoardState.priority ?? 0),
        },
      });
    }

    const normalizedScores = normalizeGoalScores({
      impact: body.impact ?? existing.impact,
      confidence: body.confidenceScore ?? body.confidence ?? existing.confidenceScore ?? existing.confidence,
      weight: body.weight ?? existing.weight,
    });

    const updated = await prisma.goalcard.update({
      where: { id },
      data: {
        title: body.title ?? existing.title,
        body: body.content || body.body,
        hashtags: body.hashtags,
        intelligenceType: body.intelligenceType,
        confidence: normalizedScores.confidence,
        confidenceScore: normalizedScores.confidenceScore,
        impact: normalizedScores.impact,
        weight: normalizedScores.weight,
        iceScore: normalizedScores.iceScore,
        processingStatus: body.processingStatus,
        activityState: body.activityState,
      }
    });

    await recordInteractionEventFromRequest(req, {
      companyId: existing.companyId,
      surface: "goals",
      interactionType: "GOAL_REVIEW_EDIT",
      entityType: "GOALCARD",
      entityId: existing.id,
      beforeState: {
        title: existing.title,
        body: existing.body,
        hashtags: existing.hashtags,
        processingStatus: existing.processingStatus,
      },
      afterState: {
        title: updated.title,
        body: updated.body,
        hashtags: updated.hashtags,
        processingStatus: updated.processingStatus,
      },
      teachingWeight: 95,
    });

    await recordDecisionEvent({
      companyId: existing.companyId,
      decisionMaker: "human-review",
      decisionType: "GOALCARD_OVERRIDE",
      entityType: "GOALCARD",
      entityId: existing.id,
      beforeState: existing,
      afterState: updated,
      teachingWeight: 90,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = await prisma.goalcard.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await verifyMembership(req, existing.companyId);
  if (auth.error) return auth.error;

  await prisma.goalcard.update({
    where: { id },
    data: { activityState: "ARCHIVED" }
  });

  await recordInteractionEventFromRequest(req, {
    companyId: existing.companyId,
    surface: "goals",
    interactionType: "GOAL_REVIEW_DECLINE",
    entityType: "GOALCARD",
    entityId: existing.id,
    beforeState: existing,
    afterState: { activityState: "ARCHIVED" },
    teachingWeight: 90,
  });

  await recordOutcomeEvent({
    companyId: existing.companyId,
    actorType: "USER",
    entityType: "GOALCARD",
    entityId: existing.id,
    outcomeType: "ARCHIVED",
    outcomeValue: "DECLINED",
    teachingWeight: 90,
  });

  return NextResponse.json({ success: true });
}
