import { NextResponse } from "next/server";
import { recordDecisionEvent, recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(req as any, companyId);
  if (auth.error) return auth.error;

  const goalcards = await prisma.goalcard.findMany({
    where: { 
      companyId,
      activityState: "ACTIVE"
    },
    orderBy: { createdAt: "desc" },
    include: {
      sources: true,
      actions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      corrections: {
        orderBy: { createdAt: "desc" },
        take: 5,
      }
    }
  });

  return NextResponse.json(goalcards);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyId, title, body: content, hashtags, intelligenceType, iceScore } = body;

    if (!companyId || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const auth = await verifyMembership(req as any, companyId);
    if (auth.error) return auth.error;

    const goalcard = await prisma.goalcard.create({
      data: {
        companyId,
        title,
        body: content || "",
        hashtags: hashtags || [],
        intelligenceType: intelligenceType || "INTERNAL",
        confidence: 50,
        impact: iceScore ? Math.floor(iceScore / 10) : 5,
        weight: 5,
        processingStatus: "ACCEPTED",
        kind: "GOAL",
      }
    });

    await recordInteractionEventFromRequest(req as any, {
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

export async function PATCH(req: Request) {
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

    const auth = await verifyMembership(req as any, existing.companyId);
    if (auth.error) return auth.error;

    const updated = await prisma.goalcard.update({
      where: { id },
      data: {
        title: body.title,
        body: body.content || body.body,
        hashtags: body.hashtags,
        intelligenceType: body.intelligenceType,
        processingStatus: body.processingStatus,
        activityState: body.activityState,
      }
    });

    await recordInteractionEventFromRequest(req as any, {
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

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = await prisma.goalcard.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await verifyMembership(req as any, existing.companyId);
  if (auth.error) return auth.error;

  await prisma.goalcard.update({
    where: { id },
    data: { activityState: "ARCHIVED" }
  });

  await recordInteractionEventFromRequest(req as any, {
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
