import "server-only";

import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";
import { listCompanyFlashcardsPage } from "@/lib/flashcards";
import { parseHashtagFilterParam } from "@/lib/hashtags";

type KnowmoreHealth = {
  healthState: "HEALTHY" | "STALE" | "DELAYED" | "FAILED";
  healthTone?: "default" | "warning" | "destructive";
  healthTitle?: string;
  healthSummary?: string;
  reviewCount: number;
  staleCount: number;
  correctionBacklog: number;
  failedJobs: number;
  scoreBand: string;
  alerts: Array<{ severity: string; message: string }>;
  jobs: Array<{ id: string; jobType: string; status: string; queueColumn: string }>;
  recommendedActions: {
    sync: boolean;
    repair: boolean;
    recover: boolean;
  };
};

export type KnowmoreInitialFilters = {
  searchQuery: string;
  filterKind: string;
  intelligenceFilter: "INTERNAL" | "COMPETITOR";
  activeHashtags: string[];
};

export type KnowmoreInitialData = {
  company: {
    id: string;
    name: string;
  };
  flashcards: any[];
  hasMore: boolean;
  totalCount: number;
  health: KnowmoreHealth | null;
  isOwner: boolean;
  members: any[];
  snapshotSummary: {
    knowmoreCount: number;
    strategicGoalsCount: number;
    synthesisYield: number;
    confidenceAvg: number;
    iceScoreAvg: number;
    easeScoreAvg: number;
  } | null;
  filters: KnowmoreInitialFilters;
};

async function buildLiveKnowmoreSummary(companyId: string) {
  const flashcardBaseWhere: Prisma.FlashcardWhereInput = {
    companyId,
    activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
  };
  const goalBaseWhere: Prisma.GoalcardWhereInput = {
    companyId,
    activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
  };

  const [flashcardCount, goalCount, averages, reviewedCount] = await Promise.all([
    prisma.flashcard.count({ where: flashcardBaseWhere }),
    prisma.goalcard.count({ where: goalBaseWhere }),
    prisma.flashcard.aggregate({
      where: flashcardBaseWhere,
      _avg: {
        confidenceScore: true,
        iceScore: true,
        weight: true,
      },
    }),
    prisma.flashcard.count({
      where: {
        ...flashcardBaseWhere,
        processingStatus: { in: ["ACCEPTED", "DECLINED"] as const },
      },
    }),
  ]);

  return {
    knowmoreCount: flashcardCount,
    strategicGoalsCount: goalCount,
    synthesisYield: flashcardCount > 0 ? Math.round((reviewedCount / flashcardCount) * 100) : 0,
    confidenceAvg: Math.round(Number(averages._avg?.confidenceScore ?? 0)),
    iceScoreAvg: Math.round(Number(averages._avg?.iceScore ?? 0)),
    easeScoreAvg: Math.round(Number(averages._avg?.weight ?? 0)),
  };
}

async function getSessionAndMembership(companyId: string) {
  const cookieStore = await cookies();
  const session = readAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) return null;

  const membership = await prisma.user.findFirst({
    where: {
      email: session.email.trim().toLowerCase(),
      companyId,
    },
  });

  if (!membership) return null;
  return { session, membership };
}

async function getKnowmoreHealthSnapshot(companyId: string): Promise<KnowmoreHealth> {
  const snapshot = await prisma.intelligenceSnapshot.findUnique({
    where: { companyId },
    select: { knowmoreHealth: true },
  });

  const health = snapshot?.knowmoreHealth;
  return health && typeof health === "object"
    ? health as KnowmoreHealth
    : {
        healthState: "HEALTHY",
        healthTone: "default",
        healthTitle: "Knowmore Health: Healthy",
        healthSummary: "No persisted Knowmore health snapshot is available yet.",
        reviewCount: 0,
        staleCount: 0,
        correctionBacklog: 0,
        failedJobs: 0,
        scoreBand: "UNKNOWN",
        alerts: [],
        jobs: [],
        recommendedActions: {
          sync: true,
          repair: false,
          recover: false,
        },
      };
}

export async function getKnowmoreInitialData(
  companyId: string,
  {
    pageSize = 12,
    searchParams,
  }: {
    pageSize?: number;
    searchParams?: Record<string, string | string[] | undefined>;
  } = {},
): Promise<KnowmoreInitialData | null> {
  const auth = await getSessionAndMembership(companyId);
  if (!auth) return null;

  const searchQuery = typeof searchParams?.q === "string" ? searchParams.q : "";
  const filterKind = typeof searchParams?.kind === "string" ? searchParams.kind : "ALL";
  const intelligenceFilter =
    searchParams?.intelligenceType === "COMPETITOR" ? "COMPETITOR" : "INTERNAL";
  const activeHashtags = parseHashtagFilterParam(
    typeof searchParams?.tags === "string" ? searchParams.tags : null,
  );

  const [company, snapshotSummary, page, health, members, liveSummary] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    }),
    prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: {
        knowmoreCount: true,
        strategicGoalsCount: true,
        synthesisYield: true,
        confidenceAvg: true,
        iceScoreAvg: true,
        easeScoreAvg: true,
      },
    }),
    listCompanyFlashcardsPage(companyId, {
      limit: pageSize,
      offset: 0,
      searchQuery,
      kind: filterKind,
      intelligenceType: intelligenceFilter,
      hashtags: activeHashtags,
    }),
    getKnowmoreHealthSnapshot(companyId),
    prisma.user.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    }),
    buildLiveKnowmoreSummary(companyId),
  ]);

  if (!company) return null;

  return {
    company,
    flashcards: page.items,
    hasMore: page.hasMore,
    totalCount: page.total,
    health,
    isOwner: ["OWNER", "SUPERADMIN"].includes(auth.membership.role),
    members,
    snapshotSummary: {
      knowmoreCount:
        Number(snapshotSummary?.knowmoreCount ?? 0) > 0
          ? Number(snapshotSummary?.knowmoreCount ?? 0)
          : liveSummary.knowmoreCount,
      strategicGoalsCount:
        Number(snapshotSummary?.strategicGoalsCount ?? 0) > 0
          ? Number(snapshotSummary?.strategicGoalsCount ?? 0)
          : liveSummary.strategicGoalsCount,
      synthesisYield:
        Number(snapshotSummary?.synthesisYield ?? 0) > 0
          ? Number(snapshotSummary?.synthesisYield ?? 0)
          : liveSummary.synthesisYield,
      confidenceAvg:
        Number(snapshotSummary?.confidenceAvg ?? 0) > 0
          ? Number(snapshotSummary?.confidenceAvg ?? 0)
          : liveSummary.confidenceAvg,
      iceScoreAvg:
        Number(snapshotSummary?.iceScoreAvg ?? 0) > 0
          ? Number(snapshotSummary?.iceScoreAvg ?? 0)
          : liveSummary.iceScoreAvg,
      easeScoreAvg:
        Number(snapshotSummary?.easeScoreAvg ?? 0) > 0
          ? Number(snapshotSummary?.easeScoreAvg ?? 0)
          : liveSummary.easeScoreAvg,
    },
    filters: {
      searchQuery,
      filterKind,
      intelligenceFilter,
      activeHashtags,
    },
  };
}
