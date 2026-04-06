import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyTaskFeedbackToFlashcards, syncCompanyKnowledge } from "@/lib/flashcards";
import { calculateICEScore, normalizeNBAMetrics } from "@/lib/nba-scoring";

export async function GET(request: NextRequest) {
  try {
    const nbaItemId = request.nextUrl.searchParams.get("nbaItemId");
    
    const where = nbaItemId ? { nbaItemId } : {};
    const feedbacks = await prisma.feedback.findMany({
      where,
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
      const item = await prisma.nBAItem.findUnique({
        where: { id: data.nbaItemId },
      });
      
      if (item) {
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

        await syncCompanyKnowledge(item.companyId);
      }
    }
    
    return NextResponse.json(feedback);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
