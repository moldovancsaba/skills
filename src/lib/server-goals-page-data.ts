import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";

export type GoalsInitialData = {
  company: {
    id: string;
    name: string;
  };
  goals: Array<{
    id: string;
    publicId: number | null;
    title: string;
    description: string;
    impact: number;
    confidenceScore: number;
    ease: number;
    iceScore: number;
    processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED" | "REVIEW";
    activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
    kanbanColumn: "ROADMAP";
    userAnnotation?: string;
    hashtags: string[];
    createdAt?: string | null;
    updatedAt?: string | null;
    refreshedAt?: string | null;
    lastActionAt?: string | null;
  }>;
  snapshotSummary: {
    strategicGoalsCount: number;
    synthesisYield: number;
    knowmoreCount: number;
    dataIngressCount: number;
  };
};

async function getSessionAndMembership(companyId: string) {
  const cookieStore = await cookies();
  const session = readAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) return null;

  const membership = await prisma.user.findFirst({
    where: {
      email: session.email.trim().toLowerCase(),
      companyId,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!membership) return null;
  return { session, membership };
}

export async function getGoalsInitialData(companyId: string): Promise<GoalsInitialData | null> {
  const auth = await getSessionAndMembership(companyId);
  if (!auth) return null;

  const [company, goals, snapshot] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    }),
    prisma.goalcard.findMany({
      where: {
        companyId,
        activityState: "ACTIVE",
      },
      orderBy: [
        { iceScore: "desc" },
        { confidenceScore: "desc" },
        { updatedAt: "desc" },
        { publicId: "asc" },
      ],
      select: {
        id: true,
        publicId: true,
        title: true,
        body: true,
        impact: true,
        confidence: true,
        confidenceScore: true,
        weight: true,
        iceScore: true,
        processingStatus: true,
        activityState: true,
        userAnnotation: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
        refreshedAt: true,
        lastActionAt: true,
      },
    }),
    prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: {
        strategicGoalsCount: true,
        synthesisYield: true,
        knowmoreCount: true,
        dataIngressCount: true,
      },
    }),
  ]);

  if (!company) return null;

  return {
    company,
    goals: goals.map((goal) => ({
      id: goal.id,
      publicId: goal.publicId ?? null,
      title: goal.title,
      description: goal.body ?? "",
      impact: goal.impact ?? 5,
      confidenceScore: goal.confidenceScore ?? goal.confidence ?? 5,
      ease: goal.weight ?? 5,
      iceScore: goal.iceScore ?? 0,
      processingStatus: goal.processingStatus,
      activityState: goal.activityState,
      kanbanColumn: "ROADMAP" as const,
      userAnnotation: goal.userAnnotation ?? undefined,
      hashtags: Array.isArray(goal.hashtags) ? goal.hashtags : [],
      createdAt: goal.createdAt?.toISOString() ?? null,
      updatedAt: goal.updatedAt?.toISOString() ?? null,
      refreshedAt: goal.refreshedAt?.toISOString() ?? null,
      lastActionAt: goal.lastActionAt?.toISOString() ?? null,
    })),
    snapshotSummary: {
      strategicGoalsCount: Number(snapshot?.strategicGoalsCount ?? goals.length),
      synthesisYield: Number(snapshot?.synthesisYield ?? 0),
      knowmoreCount: Number(snapshot?.knowmoreCount ?? 0),
      dataIngressCount: Number(snapshot?.dataIngressCount ?? 0),
    },
  };
}
