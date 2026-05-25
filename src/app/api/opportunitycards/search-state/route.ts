import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type RankedEntry = {
  key: string;
  score: number;
};

function toRankedEntries(input: unknown, limit = 5): RankedEntry[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => ({ key, score: Number(value || 0) }))
    .filter((entry) => entry.key && Number.isFinite(entry.score) && entry.score !== 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

type QuerySummary = {
  query: string;
  accepted: number;
  declined: number;
  candidateCount: number;
  createdOpportunitycards: number;
  createdSources: number;
  score: number;
};

function toQuerySummaries(input: unknown, limit = 5): QuerySummary[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>)
    .map(([query, stats]) => {
      const record = stats && typeof stats === "object" && !Array.isArray(stats)
        ? stats as Record<string, unknown>
        : {};
      const accepted = Number(record.accepted || 0);
      const declined = Number(record.declined || 0);
      const candidateCount = Number(record.candidateCount || 0);
      const createdOpportunitycards = Number(record.createdOpportunitycards || 0);
      const createdSources = Number(record.createdSources || 0);
      return {
        query,
        accepted,
        declined,
        candidateCount,
        createdOpportunitycards,
        createdSources,
        score: accepted * 6 + createdOpportunitycards * 3 + createdSources + candidateCount - declined * 7,
      };
    })
    .filter((entry) => entry.query)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const learning = await import("../../../../../scripts/lib/opportunity-search.js");
    const readOpportunitySearchState = learning.readOpportunitySearchState ?? learning.default?.readOpportunitySearchState;
    if (typeof readOpportunitySearchState !== "function") {
      return NextResponse.json({ error: "Opportunity search state is unavailable" }, { status: 500 });
    }

    const state = await readOpportunitySearchState(prisma, companyId);
    return NextResponse.json({
      totalRuns: Number(state?.totalRuns || 0),
      lastQueries: Array.isArray(state?.lastQueries) ? state.lastQueries : [],
      updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : null,
      topQueries: toQuerySummaries(state?.queryStats, 5),
      topTerms: toRankedEntries(state?.termScores, 6),
      topDomains: toRankedEntries(state?.domainScores, 6),
    });
  } catch (error) {
    console.error("[API:OPPORTUNITYCARDS:SEARCH_STATE] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
