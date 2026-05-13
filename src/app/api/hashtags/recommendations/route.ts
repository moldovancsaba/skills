import { NextRequest, NextResponse } from "next/server";

import { parseHashtagFilterParam } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import { prisma } from "@/lib/db";

function normalizeSelectionKey(tags: string[]) {
  return [...new Set(tags.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join("|");
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  try {
    const selected = parseHashtagFilterParam(request.nextUrl.searchParams.get("selected"));
    const snapshot = await prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: { hashtagAnalytics: true },
    });
    const analytics = snapshot?.hashtagAnalytics && typeof snapshot.hashtagAnalytics === "object"
      ? snapshot.hashtagAnalytics as Record<string, unknown>
      : {};
    const popular = Array.isArray(analytics.popular) ? analytics.popular.filter((item): item is string => typeof item === "string") : [];
    const recommendationMap =
      analytics.recommendationsBySelection && typeof analytics.recommendationsBySelection === "object"
        ? analytics.recommendationsBySelection as Record<string, unknown>
        : {};
    const selectionKey = normalizeSelectionKey(selected);
    const recommendations = Array.isArray(recommendationMap[selectionKey])
      ? (recommendationMap[selectionKey] as unknown[]).filter((item): item is string => typeof item === "string")
      : popular.filter((tag) => !selected.includes(tag));
    return NextResponse.json({
      selected,
      recommendations: recommendations.slice(0, 5),
      popular: popular.slice(0, 5),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
