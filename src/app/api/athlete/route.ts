import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import {
  clampAthleteScore,
  dayBounds,
  normalizeAthleteMetrics,
  normalizeActivityType,
  normalizeDurationMinutes,
  summarizeAthleteDay,
  summarizeAthleteTeam,
} from "@/lib/athlete-activity";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const { safeDate, start, end } = dayBounds(request.nextUrl.searchParams.get("date"));
  const scope = request.nextUrl.searchParams.get("scope");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId, scope === "team" ? "ADMIN" : undefined);
  if (auth.error) return auth.error;

  if (scope === "team") {
    const [assignedWork, logs] = await Promise.all([
      prisma.nBAItem.findMany({
        where: {
          companyId,
          activityState: { in: ["ACTIVE", "STALE"] },
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"] },
          kanbanColumn: { in: ["TODO", "CHECKLIST"] },
          OR: [
            { scheduledDate: null },
            { scheduledDate: { lte: end } },
          ],
        },
        orderBy: [{ scheduledDate: "asc" }, { sortOrder: "asc" }, { iceScore: "desc" }],
        take: 50,
      }),
      prisma.athleteActivityLog.findMany({
        where: {
          companyId,
          activityDate: { gte: start, lte: end },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 200,
      }),
    ]);

    return NextResponse.json({
      date: safeDate,
      scope: "team",
      assignedWork,
      logs,
      summary: summarizeAthleteDay(logs),
      athleteSummaries: summarizeAthleteTeam(logs),
    });
  }

  const athleteEmail = auth.session.email.trim().toLowerCase();
  const [assignedWork, logs] = await Promise.all([
    prisma.nBAItem.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"] },
        kanbanColumn: { in: ["TODO", "CHECKLIST"] },
        OR: [
          { scheduledDate: null },
          { scheduledDate: { lte: end } },
        ],
      },
      orderBy: [{ scheduledDate: "asc" }, { sortOrder: "asc" }, { iceScore: "desc" }],
      take: 24,
    }),
    prisma.athleteActivityLog.findMany({
      where: {
        companyId,
        athleteEmail,
        activityDate: { gte: start, lte: end },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return NextResponse.json({
    date: safeDate,
    athlete: {
      email: athleteEmail,
      name: auth.session.name,
    },
    assignedWork,
    logs,
    summary: summarizeAthleteDay(logs),
  });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = normalizeText(data.companyId);
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const title = normalizeText(data.title);
    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const { start } = dayBounds(typeof data.activityDate === "string" ? data.activityDate : null);
    const athleteEmail = auth.session.email.trim().toLowerCase();
    const nbaItemId = normalizeText(data.nbaItemId) || undefined;
    const completionState = data.completionState === "COMPLETED" ? "COMPLETED" : "RECORDED";

    const created = await prisma.athleteActivityLog.create({
      data: {
        companyId,
        athleteEmail,
        athleteName: auth.session.name,
        nbaItemId,
        activityDate: start,
        activityType: normalizeActivityType(data.activityType),
        title,
        notes: normalizeText(data.notes) || undefined,
        durationMinutes: normalizeDurationMinutes(data.durationMinutes),
        intensity: clampAthleteScore(data.intensity),
        readiness: clampAthleteScore(data.readiness),
        completionState,
        metrics: normalizeAthleteMetrics(data.metrics) as Prisma.InputJsonValue,
      },
    });

    if (completionState === "COMPLETED" && nbaItemId) {
      await prisma.nBAItem.updateMany({
        where: {
          id: nbaItemId,
          companyId,
        },
        data: {
          processingStatus: "ACCEPTED",
          status: "COMPLETED",
          activityState: "ARCHIVED",
          userAnnotation: normalizeText(data.notes, "Completed from athlete app"),
        },
      });
    }

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "athlete-app",
      interactionType: completionState === "COMPLETED" ? "ATHLETE_WORK_COMPLETED" : "ATHLETE_ACTIVITY_RECORDED",
      entityType: nbaItemId ? "TASK" : "ATHLETE_ACTIVITY",
      entityId: nbaItemId || created.id,
      afterState: created,
      teachingWeight: completionState === "COMPLETED" ? 80 : 45,
    });

    await recordOutcomeEvent({
      companyId,
      actorType: "ATHLETE",
      actorEmail: athleteEmail,
      entityType: nbaItemId ? "TASK" : "ATHLETE_ACTIVITY",
      entityId: nbaItemId || created.id,
      outcomeType: completionState === "COMPLETED" ? "ATHLETE_COMPLETED_ASSIGNED_WORK" : "ATHLETE_RECORDED_ACTIVITY",
      outcomeValue: completionState,
      annotation: created.notes ?? undefined,
      payload: {
        activityLogId: created.id,
        activityType: created.activityType,
        durationMinutes: created.durationMinutes,
        intensity: created.intensity,
        readiness: created.readiness,
        metrics: created.metrics,
      },
      teachingWeight: completionState === "COMPLETED" ? 80 : 45,
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("[API:Athlete] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
