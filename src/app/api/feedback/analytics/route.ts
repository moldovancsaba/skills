import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const snapshot = await prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: { feedbackAnalytics: true },
    });

    const analytics = snapshot?.feedbackAnalytics;
    return NextResponse.json(analytics && typeof analytics === "object" ? analytics : {
      overview: {
        totalItems: 0,
        itemsWithFeedback: 0,
        accepted: 0,
        declined: 0,
        pending: 0,
        overallAcceptanceRate: "0.0",
      },
      recommendationTypeStats: [],
      declinePatterns: [],
      trends: {
        sevenDayAcceptanceRate: "0.0",
        thirtyDayAcceptanceRate: "0.0",
        avgAcceptedIceScore: "0.0",
        avgDeclinedIceScore: "0.0",
      },
      insights: [],
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
