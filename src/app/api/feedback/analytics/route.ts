import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface FeedbackPattern {
  pattern: string;
  count: number;
  examples: string[];
}

interface RecommendationTypeStats {
  type: string;
  accepted: number;
  declined: number;
  total: number;
  acceptanceRate: number;
}

interface LearningInsight {
  type: "pattern" | "recommendation" | "warning";
  title: string;
  description: string;
  confidence: number;
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("companyId");
    
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    // Get all NBA items with feedback for this company
    const nbaItems = await prisma.nBAItem.findMany({
      where: { companyId },
      include: { feedback: true },
      orderBy: { createdAt: "desc" },
    });

    // Overall statistics
    const totalItems = nbaItems.length;
    const itemsWithFeedback = nbaItems.filter(item => item.feedback.length > 0);
    const acceptedItems = nbaItems.filter(item => item.status === "ACCEPTED");
    const declinedItems = nbaItems.filter(item => item.status === "DECLINED");
    const pendingItems = nbaItems.filter(item => item.status === "PENDING");

    const overallAcceptanceRate = totalItems > 0 
      ? (acceptedItems.length / (acceptedItems.length + declinedItems.length)) * 100 
      : 0;

    // Acceptance rates by recommendation type (title-based grouping)
    const typeStats: Record<string, { accepted: number; declined: number; total: number }> = {};
    
    nbaItems.forEach(item => {
      if (!typeStats[item.title]) {
        typeStats[item.title] = { accepted: 0, declined: 0, total: 0 };
      }
      typeStats[item.title].total++;
      if (item.status === "ACCEPTED") typeStats[item.title].accepted++;
      if (item.status === "DECLINED") typeStats[item.title].declined++;
    });

    const recommendationTypeStats: RecommendationTypeStats[] = Object.entries(typeStats)
      .map(([type, stats]) => ({
        type,
        ...stats,
        acceptanceRate: stats.total > 0 
          ? (stats.accepted / (stats.accepted + stats.declined)) * 100 
          : 0,
      }))
      .sort((a, b) => b.acceptanceRate - a.acceptanceRate);

    // Decline reason analysis
    const declineAnnotations = nbaItems
      .filter(item => item.status === "DECLINED" && item.userAnnotation)
      .map(item => ({ title: item.title, annotation: item.userAnnotation! }));

    // Pattern detection in decline reasons
    const declinePatterns: FeedbackPattern[] = [];
    const patternKeywords = [
      { keyword: "already", pattern: "Already implemented" },
      { keyword: "not relevant", pattern: "Not relevant to business" },
      { keyword: "no budget", pattern: "Budget constraints" },
      { keyword: "too complex", pattern: "Too complex" },
      { keyword: "timing", pattern: "Wrong timing" },
      { keyword: "priority", pattern: "Not a priority" },
      { keyword: "resource", pattern: "Resource constraints" },
      { keyword: "team", pattern: "Team capacity" },
    ];

    patternKeywords.forEach(({ keyword, pattern }) => {
      const matches = declineAnnotations.filter(d => 
        d.annotation.toLowerCase().includes(keyword)
      );
      if (matches.length > 0) {
        declinePatterns.push({
          pattern,
          count: matches.length,
          examples: matches.slice(0, 3).map(m => m.annotation),
        });
      }
    });

    // Add unmatched annotations as "Other" pattern
    const matchedAnnotations = declineAnnotations.filter(d =>
      patternKeywords.some(k => d.annotation.toLowerCase().includes(k.keyword))
    );
    const unmatchedAnnotations = declineAnnotations.filter(d =>
      !patternKeywords.some(k => d.annotation.toLowerCase().includes(k.keyword))
    );
    
    if (unmatchedAnnotations.length > 0) {
      declinePatterns.push({
        pattern: "Other reasons",
        count: unmatchedAnnotations.length,
        examples: unmatchedAnnotations.slice(0, 3).map(m => m.annotation),
      });
    }

    // Time-based acceptance trends
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentItems = nbaItems.filter(item => item.createdAt >= sevenDaysAgo);
    const monthItems = nbaItems.filter(item => item.createdAt >= thirtyDaysAgo);

    const recentAcceptanceRate = recentItems.length > 0
      ? (recentItems.filter(i => i.status === "ACCEPTED").length / 
         (recentItems.filter(i => i.status === "ACCEPTED" || i.status === "DECLINED").length || 1)) * 100
      : 0;

    const monthAcceptanceRate = monthItems.length > 0
      ? (monthItems.filter(i => i.status === "ACCEPTED").length / 
         (monthItems.filter(i => i.status === "ACCEPTED" || i.status === "DECLINED").length || 1)) * 100
      : 0;

    // Generate learning insights
    const insights: LearningInsight[] = [];

    // Insight: High acceptance rate recommendations
    const highAcceptanceTypes = recommendationTypeStats.filter(t => t.acceptanceRate >= 75 && t.total >= 2);
    if (highAcceptanceTypes.length > 0) {
      insights.push({
        type: "recommendation",
        title: "High-performing recommendation types",
        description: `These recommendation types have ${highAcceptanceTypes[0].acceptanceRate.toFixed(0)}%+ acceptance: ${highAcceptanceTypes.map(t => t.type).join(", ")}. Consider generating more similar recommendations.`,
        confidence: 85,
      });
    }

    // Insight: Low acceptance rate recommendations
    const lowAcceptanceTypes = recommendationTypeStats.filter(t => t.acceptanceRate < 30 && t.total >= 2);
    if (lowAcceptanceTypes.length > 0) {
      insights.push({
        type: "warning",
        title: "Low-performing recommendation types",
        description: `These types are frequently declined: ${lowAcceptanceTypes.map(t => t.type).join(", ")}. Review and adjust approach.`,
        confidence: 80,
      });
    }

    // Insight: Common decline patterns
    if (declinePatterns.length > 0) {
      const topPattern = declinePatterns[0];
      insights.push({
        type: "pattern",
        title: `Top decline reason: ${topPattern.pattern}`,
        description: `${topPattern.count} items declined for this reason. Consider filtering out similar recommendations.`,
        confidence: 70,
      });
    }

    // Insight: Acceptance trend
    if (monthItems.length >= 5) {
      const trend = recentAcceptanceRate > monthAcceptanceRate ? "improving" : "declining";
      insights.push({
        type: "pattern",
        title: `Acceptance rate is ${trend}`,
        description: `7-day rate: ${recentAcceptanceRate.toFixed(1)}%, 30-day rate: ${monthAcceptanceRate.toFixed(1)}%.`,
        confidence: 65,
      });
    }

    // ICE score impact analysis
    const avgAcceptedIceScore = acceptedItems.length > 0
      ? acceptedItems.reduce((sum, item) => sum + item.iceScore, 0) / acceptedItems.length
      : 0;
    
    const avgDeclinedIceScore = declinedItems.length > 0
      ? declinedItems.reduce((sum, item) => sum + item.iceScore, 0) / declinedItems.length
      : 0;

    return NextResponse.json({
      overview: {
        totalItems,
        itemsWithFeedback: itemsWithFeedback.length,
        accepted: acceptedItems.length,
        declined: declinedItems.length,
        pending: pendingItems.length,
        overallAcceptanceRate: overallAcceptanceRate.toFixed(1),
      },
      recommendationTypeStats,
      declinePatterns,
      trends: {
        sevenDayAcceptanceRate: recentAcceptanceRate.toFixed(1),
        thirtyDayAcceptanceRate: monthAcceptanceRate.toFixed(1),
        avgAcceptedIceScore: avgAcceptedIceScore.toFixed(1),
        avgDeclinedIceScore: avgDeclinedIceScore.toFixed(1),
      },
      insights,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
