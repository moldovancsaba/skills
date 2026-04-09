import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { applyTaskFeedbackToFlashcards } from "@/lib/flashcards";
import { calculateICEScore, normalizeNBAMetrics } from "@/lib/nba-scoring";

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
    
    let iceImpact = 0;
    if (data.action === "ACCEPT") {
      iceImpact = 10;
    } else if (data.action === "MODIFY_ACCEPT") {
      iceImpact = 15;
    } else if (data.action === "DECLINE") {
      iceImpact = -50;
    }
    
    const feedback = await prisma.feedback.create({
      data: {
        nbaItemId: data.nbaItemId,
        action: data.action,
        annotation: data.annotation,
        modifiedTitle: data.modifiedTitle,
        modifiedDescription: data.modifiedDescription,
        iceImpact,
      },
    });
    
    if (data.action === "ACCEPT" || data.action === "DECLINE" || data.action === "MODIFY_ACCEPT") {
      const metrics = normalizeNBAMetrics(item);
      const baseScore = calculateICEScore(metrics);
      const newScore = baseScore * (1 + iceImpact / 100);
      await prisma.nBAItem.update({
        where: { id: data.nbaItemId },
        data: {
          status: data.action === "DECLINE" ? "DECLINED" : "ACCEPTED",
          title: data.action === "MODIFY_ACCEPT" && data.modifiedTitle?.trim() ? data.modifiedTitle.trim() : item.title,
          description:
            data.action === "MODIFY_ACCEPT" && typeof data.modifiedDescription === "string"
              ? data.modifiedDescription.trim()
              : item.description,
          impact: metrics.impact,
          confidence: metrics.confidence,
          ease: metrics.ease,
          iceScore: Math.max(0, Math.min(1000, newScore)),
          userAnnotation: data.annotation,
        },
      });

      await applyTaskFeedbackToFlashcards(
        data.nbaItemId,
        data.action === "DECLINE" ? "DECLINE" : "ACCEPT",
        data.annotation,
      );
    }
    
    return NextResponse.json(feedback);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
