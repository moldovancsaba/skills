import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const goalcards = await prisma.goalcard.findMany({
    where: { 
      companyId,
      activityState: "ACTIVE"
    },
    orderBy: { createdAt: "desc" },
    include: {
      sources: true,
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

  await prisma.goalcard.update({
    where: { id },
    data: { activityState: "ARCHIVED" }
  });

  return NextResponse.json({ success: true });
}
