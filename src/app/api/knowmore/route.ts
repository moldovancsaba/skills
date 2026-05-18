import { NextRequest, NextResponse } from "next/server";
import { listCompanyFlashcardsPage } from "@/lib/flashcards";
import { verifyMembership } from "@/lib/permissions";
import { parseHashtagFilterParam } from "@/lib/hashtags";
import { createRequestProfiler } from "@/lib/request-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const profiler = createRequestProfiler(request, "knowmore-list");
  const companyId = request.nextUrl.searchParams.get("companyId");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const offsetParam = request.nextUrl.searchParams.get("offset");
  const searchQuery = request.nextUrl.searchParams.get("q") || "";
  const kind = request.nextUrl.searchParams.get("kind");
  const intelligenceTypeParam = request.nextUrl.searchParams.get("intelligenceType");
  const hashtags = parseHashtagFilterParam(request.nextUrl.searchParams.get("tags"));
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const responseData = await profiler.measure("listCompanyFlashcardsPage", () =>
      listCompanyFlashcardsPage(companyId as string, {
        limit: limitParam ? Number(limitParam) : 12,
        offset: offsetParam ? Number(offsetParam) : 0,
        searchQuery,
        kind,
        intelligenceType:
          intelligenceTypeParam === "INTERNAL" || intelligenceTypeParam === "COMPETITOR"
            ? intelligenceTypeParam
            : null,
        hashtags,
      }),
    );

    const response = NextResponse.json(
      profiler.enabled
        ? { ...responseData, profile: profiler.getSummary() }
        : responseData,
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );

    return profiler.apply(response);
  } catch (error) {
    console.error("[API:KNOWMORE] Get failure:", error);
    return profiler.apply(NextResponse.json({
      items: [],
      hasMore: false,
      total: 0,
      error: String(error),
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }));
  }
}
