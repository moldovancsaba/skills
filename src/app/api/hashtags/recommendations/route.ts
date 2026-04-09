import { NextRequest, NextResponse } from "next/server";

import { getRecommendedHashtags } from "@/lib/hashtag-analytics";
import { parseHashtagFilterParam } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  try {
    const selected = parseHashtagFilterParam(request.nextUrl.searchParams.get("selected"));
    const result = await getRecommendedHashtags(companyId, selected);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
