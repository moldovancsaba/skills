import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { CANDIDATE_STATES, inferLegacyCandidateState } from "@/lib/candidate-lifecycle";

export const dynamic = "force-dynamic";

const WINDOW_DAYS_BY_KEY = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const;

type WindowKey = keyof typeof WINDOW_DAYS_BY_KEY;

function normalizeWindowKey(value: string | null): WindowKey {
  return value === "7d" || value === "90d" ? value : "30d";
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatDay(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function buildWindowDays(windowKey: WindowKey) {
  const total = WINDOW_DAYS_BY_KEY[windowKey];
  const today = startOfDay(new Date());
  return Array.from({ length: total }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (total - index - 1));
    return formatDay(day);
  });
}

function bump(map: Record<string, number>, key: string, amount = 1) {
  map[key] = Number(map[key] || 0) + amount;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function bucketIceScore(score: number) {
  if (score >= 80) return "80-100";
  if (score >= 60) return "60-79";
  if (score >= 40) return "40-59";
  if (score >= 20) return "20-39";
  return "0-19";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const windowKey = normalizeWindowKey(request.nextUrl.searchParams.get("window"));
    const windowDays = WINDOW_DAYS_BY_KEY[windowKey];
    const days = buildWindowDays(windowKey);
    const start = startOfDay(new Date());
    start.setDate(start.getDate() - (windowDays - 1));

    const [company, tasks] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, industry: true },
      }),
      prisma.checklistTask.findMany({
        where: { companyId },
        select: {
          id: true,
          kanbanColumn: true,
          activityState: true,
          processingStatus: true,
          candidateState: true,
          status: true,
          iceScore: true,
          confidenceScore: true,
          createdAt: true,
        },
      }),
    ]);

    const feedback = await prisma.feedback.findMany({
      where: {
        checklistTask: { companyId },
        createdAt: { gte: start },
      },
      select: {
        action: true,
        createdAt: true,
      },
    });

    const activeTasks = tasks.filter((task) => task.activityState !== "ARCHIVED");
    const laneCounts: Record<string, number> = {
      IDEABANK: 0,
      ROADMAP: 0,
      BACKLOG: 0,
      TODO: 0,
      CHECKLIST: 0,
    };
    const lifecycleCounts: Record<string, number> = {};
    const scoreBuckets: Record<string, number> = {
      "0-19": 0,
      "20-39": 0,
      "40-59": 0,
      "60-79": 0,
      "80-100": 0,
    };

    for (const task of activeTasks) {
      bump(laneCounts, task.kanbanColumn);
      bump(lifecycleCounts, inferLegacyCandidateState(task));
      bump(scoreBuckets, bucketIceScore(Number(task.iceScore || 0)));
    }

    const throughputByDay = Object.fromEntries(
      days.map((day) => [day, { date: day, created: 0, accepted: 0, declined: 0, delivered: 0 }]),
    ) as Record<string, { date: string; created: number; accepted: number; declined: number; delivered: number }>;

    for (const task of tasks) {
      const day = formatDay(task.createdAt);
      if (throughputByDay[day]) {
        throughputByDay[day].created += 1;
      }
    }

    for (const entry of feedback) {
      const day = formatDay(entry.createdAt);
      const bucket = throughputByDay[day];
      if (!bucket) continue;
      if (entry.action === "ACCEPT" || entry.action === "MODIFY_ACCEPT") bucket.accepted += 1;
      if (entry.action === "DECLINE") bucket.declined += 1;
      if (entry.action === "DELIVER") bucket.delivered += 1;
    }

    const activeIceScores = activeTasks.map((task) => Number(task.iceScore || 0));
    const activeConfidenceScores = activeTasks.map((task) => Number(task.confidenceScore || 0));
    const checklistReady = activeTasks.filter((task) => task.kanbanColumn === "CHECKLIST").length;
    const evaluatedOrDelivered = activeTasks.filter((task) => {
      const state = inferLegacyCandidateState(task);
      return state === CANDIDATE_STATES.EVALUATED || state === CANDIDATE_STATES.DELIVERED;
    }).length;

    return NextResponse.json({
      company,
      window: windowKey,
      metrics: {
        activeTasks: activeTasks.length,
        checklistReady,
        evaluatedOrDelivered,
        avgIceScore: average(activeIceScores),
        avgConfidenceScore: average(activeConfidenceScores),
        acceptedCount: feedback.filter((entry) => entry.action === "ACCEPT" || entry.action === "MODIFY_ACCEPT").length,
        deliveredCount: feedback.filter((entry) => entry.action === "DELIVER").length,
        declinedCount: feedback.filter((entry) => entry.action === "DECLINE").length,
      },
      laneCounts: Object.entries(laneCounts).map(([name, value]) => ({ name, value })),
      lifecycleCounts: Object.entries(lifecycleCounts).map(([name, value]) => ({ name, value })),
      scoreBuckets: Object.entries(scoreBuckets).map(([name, value]) => ({ name, value })),
      throughputSeries: days.map((day) => throughputByDay[day]),
    });
  } catch (error) {
    console.error("[API:COMPANY_ANALYTICS] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
