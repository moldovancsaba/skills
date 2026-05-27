import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { createRequestProfiler } from "@/lib/request-profile";
import { getProjectionFreshness, normalizeWebappProjection, type ProjectionSalesSummary } from "@/lib/webapp-projection";

export const dynamic = "force-dynamic";

function toRankedEntries(input: unknown, limit = 6) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => ({ key, score: Number(value || 0) }))
    .filter((entry) => entry.key && Number.isFinite(entry.score) && entry.score !== 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function toQuerySummaries(input: unknown, limit = 5) {
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

async function buildFallbackSalesSummary(companyId: string): Promise<ProjectionSalesSummary> {
  const [salesKnowledgeCount, opportunitycards, acceptedOpportunitycards, readyOpportunitycards, jobs, searchState] = await Promise.all([
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        OR: [
          { departmentKey: "SALES" },
          { intelligenceType: "COMPETITOR" },
        ],
      },
    }),
    prisma.opportunitycard.count({
      where: {
        companyId,
        departmentKey: "SALES",
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
    }),
    prisma.opportunitycard.count({
      where: {
        companyId,
        departmentKey: "SALES",
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: "ACCEPTED",
      },
    }),
    prisma.opportunitycard.count({
      where: {
        companyId,
        departmentKey: "SALES",
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        iceScore: { gte: 80 },
      },
    }),
    prisma.pipelineJob.findMany({
      where: {
        companyId,
        jobType: { in: ["SEARCH_OPPORTUNITYCARDS", "MINE_OPPORTUNITYCARDS"] },
        status: { in: ["ACTIVE", "RUNNING", "FAILED"] },
      },
      select: {
        jobType: true,
        status: true,
      },
      take: 50,
    }),
    (async () => {
      const learning = await import("../../../../../../scripts/lib/opportunity-search.js");
      const readOpportunitySearchState = learning.readOpportunitySearchState ?? learning.default?.readOpportunitySearchState;
      if (typeof readOpportunitySearchState !== "function") {
        return null;
      }
      return readOpportunitySearchState(prisma, companyId);
    })(),
  ]);

  const searchQueued = jobs.filter((job) => job.jobType === "SEARCH_OPPORTUNITYCARDS" && job.status === "ACTIVE").length;
  const searchRunning = jobs.filter((job) => job.jobType === "SEARCH_OPPORTUNITYCARDS" && job.status === "RUNNING").length;
  const searchFailed = jobs.filter((job) => job.jobType === "SEARCH_OPPORTUNITYCARDS" && job.status === "FAILED").length;
  const mineQueued = jobs.filter((job) => job.jobType === "MINE_OPPORTUNITYCARDS" && job.status === "ACTIVE").length;
  const mineRunning = jobs.filter((job) => job.jobType === "MINE_OPPORTUNITYCARDS" && job.status === "RUNNING").length;
  const mineFailed = jobs.filter((job) => job.jobType === "MINE_OPPORTUNITYCARDS" && job.status === "FAILED").length;

  return {
    salesKnowledgeCount,
    opportunitycards,
    acceptedOpportunitycards,
    readyOpportunitycards,
    searchQueued,
    searchRunning,
    searchFailed,
    mineQueued,
    mineRunning,
    mineFailed,
    searchRuns: Number(searchState?.totalRuns || 0),
    searchStateUpdatedAt: typeof searchState?.updatedAt === "string" ? searchState.updatedAt : null,
    lastQueries: Array.isArray(searchState?.lastQueries) ? searchState.lastQueries : [],
    topQueries: toQuerySummaries(searchState?.queryStats, 5),
    topTerms: toRankedEntries(searchState?.termScores, 6),
    topDomains: toRankedEntries(searchState?.domainScores, 6),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const profiler = createRequestProfiler(request, "sales-summary");
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await profiler.measure("verifyMembership", () => verifyMembership(request, companyId));
  if (auth.error) return auth.error;

  try {
    const [company, snapshot] = await profiler.measure("loadSalesSummaryModels", () => Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true },
      }),
      prisma.intelligenceSnapshot.findUnique({
        where: { companyId },
        select: {
          webappProjection: true,
          updatedAt: true,
        },
      }),
    ]));

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projection = normalizeWebappProjection(snapshot?.webappProjection);
    const summary = projection?.salesSummary ?? await profiler.measure("fallbackSalesSummary", () => buildFallbackSalesSummary(companyId));

    const response = NextResponse.json({
      company,
      summary,
      projection: {
        available: Boolean(projection),
        freshness: getProjectionFreshness(projection?.generatedAt ?? null),
        generatedAt: projection?.generatedAt ?? null,
        snapshotUpdatedAt: snapshot?.updatedAt?.toISOString() ?? null,
      },
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);
  } catch (error) {
    console.error("[API:SalesSummary] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
