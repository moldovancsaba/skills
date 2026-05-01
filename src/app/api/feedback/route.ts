import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const nbaItemId = request.nextUrl.searchParams.get("nbaItemId");
    if (!nbaItemId) {
      return NextResponse.json({ error: "nbaItemId required" }, { status: 400 });
    }

    const item = await prisma.nBAItem.findUnique({
      where: { id: nbaItemId },
      select: { companyId: true }
    });

    if (!item) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, item.companyId);
    if (auth.error) return auth.error;

    const feedbacks = await prisma.feedback.findMany({
      where: { nbaItemId },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json(feedbacks);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    if (!data.nbaItemId) {
      return NextResponse.json({ error: "nbaItemId required" }, { status: 400 });
    }

    const item = await prisma.nBAItem.findUnique({
      where: { id: data.nbaItemId },
    });

    if (!item) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, item.companyId);
    if (auth.error) return auth.error;
    
    // Save feedback for local worker processing
    const feedback = await prisma.feedback.create({
      data: {
        nbaItemId: data.nbaItemId,
        action: data.action,
        annotation: data.annotation,
        modifiedTitle: data.modifiedTitle,
        modifiedDescription: data.modifiedDescription,
        declineClass: data.declineClass,
        deliveryComment: data.deliveryComment,
        actorId: request.headers.get("x-user-id") || null, // Optional tracking if we add headers later
      },
    });
    
    // State transitions are now strictly deferred to the Trinity CandidateState machine
    // (scripts/lib/feedback.js) which handles complex routing like REWORK vs ARCHIVED.
    // The frontend UI optimistically removes the card from view to provide immediate feedback.
    
    return NextResponse.json(feedback);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
