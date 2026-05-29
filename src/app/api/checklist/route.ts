import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import type { ChecklistKanbanColumn } from "@/lib/planning-hitl";
import { getManualLaneCooldownUntil } from "@/lib/planner-contract";
import { TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { APP_VERSION, BRAIN_VERSION, CHECKLIST_PROMPT_VERSION } from "@/lib/release";
import { recordDecisionEvent, recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { BOARD_RANK_STEP } from "@/lib/board-system";
import { buildNormalizedRanks, computeServerBoardRank, needsBoardRebalance } from "@/lib/board-rank";
export const dynamic = "force-dynamic";

function buildManualLaneOverrideData(column: ChecklistKanbanColumn, actorId: string, now = new Date()) {
  return {
    manualLaneOverrideAt: now,
    manualLaneCooldownUntil: getManualLaneCooldownUntil(now),
    manualLaneFloorColumn: column,
    manualLaneOverrideBy: actorId,
  };
}

async function ensureChecklistColumnRanks(companyId: string, column: ChecklistKanbanColumn) {
  const items = await prisma.checklistTask.findMany({
    where: { companyId, kanbanColumn: column },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  if (items.length <= 1) return;
  for (let index = 1; index < items.length; index += 1) {
    if (needsBoardRebalance(items[index - 1]?.sortOrder, items[index]?.sortOrder)) {
      const normalized = buildNormalizedRanks(items);
      await prisma.$transaction(normalized.map((entry) =>
        prisma.checklistTask.update({
          where: { id: entry.id },
          data: { sortOrder: entry.rank },
        }),
      ));
      return;
    }
  }
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const isArchived = request.nextUrl.searchParams.get("archived") === "true";
  const showAll = request.nextUrl.searchParams.get("all") === "true";
  const reviewOnly = request.nextUrl.searchParams.get("review") === "true";
  const kanbanColumn = request.nextUrl.searchParams.get("kanbanColumn") ?? request.nextUrl.searchParams.get("column");
  
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  
  try {
    const where: any = { companyId: companyId as string };

    if (reviewOnly) {
      where.processingStatus = "REVIEW";
    } else if (showAll) {
      // Return everything active for the Kanban board
      where.activityState = { in: ["ACTIVE", "STALE"] };
      where.processingStatus = { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] };
    } else if (isArchived) {
      where.OR = [
        { activityState: "ARCHIVED" },
        { processingStatus: "DECLINED" }
      ];
    } else {
      where.processingStatus = { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] };
      where.activityState = { in: ["ACTIVE", "STALE"] };
      // Unified Tactical Logic (§24): Checklist only shows what is in the CHECKLIST column
      where.kanbanColumn = "CHECKLIST";
      where.scheduledDate = { lte: new Date() };
    }

    if (kanbanColumn) {
      where.kanbanColumn = kanbanColumn;
    }

    const tasks = await prisma.checklistTask.findMany({
      where,
      orderBy: showAll || Boolean(kanbanColumn)
        ? [
            { sortOrder: "asc" as const },
            { iceScore: "desc" as const },
            { confidenceScore: "desc" as const },
            { publicId: "asc" as const },
          ]
        : [
            { iceScore: "desc" as const },
            { confidenceScore: "desc" as const },
            { updatedAt: "desc" as const },
            { publicId: "asc" as const },
          ],
    });
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("[API:CHECKLIST] GET failure:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const auth = await verifyMembership(request, data.companyId);
    if (auth.error) return auth.error;

    // Passive Ingress: No logic, no scoring, no ID generation.
    // The Local AI Worker will pick this up for hardening.
    const task = await prisma.checklistTask.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        description: data.description,
        processingStatus: "DRAFT",
        activityState: "ACTIVE",
        status: "PENDING", // Legacy status bridge
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
        createdBy: data.createdBy,
        appVersion: APP_VERSION,
        brainVersion: BRAIN_VERSION,
        promptVersion: CHECKLIST_PROMPT_VERSION,
        generatedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: data.companyId,
      surface: "task-ingress",
      interactionType: "TASK_CREATE",
      entityType: "TASK",
      entityId: task.id,
      afterState: {
        title: task.title,
        processingStatus: task.processingStatus,
        activityState: task.activityState,
        kanbanColumn: task.kanbanColumn,
      },
      payload: {
        scheduledDate: task.scheduledDate,
        createdBy: task.createdBy,
      },
      teachingWeight: 40,
    });
    
    return NextResponse.json(task);
  } catch (error) {
    console.error("[API:CHECKLIST] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data = await request.json();
    const existing = await prisma.checklistTask.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    if (Array.isArray(data.destinationColumnOrderIds) && data.destinationColumn) {
      const destinationColumn = String(data.destinationColumn) as ChecklistKanbanColumn;
      const sourceColumn = (data.sourceColumn ? String(data.sourceColumn) : destinationColumn) as ChecklistKanbanColumn;
      const actorId = auth.membership.id || auth.session.email || "webapp-user";
      const destinationColumnOrderIds = data.destinationColumnOrderIds.filter((value: unknown): value is string => typeof value === "string");
      const sourceColumnOrderIds = Array.isArray(data.sourceColumnOrderIds)
        ? data.sourceColumnOrderIds.filter((value: unknown): value is string => typeof value === "string")
        : [];

      const touchedIds = [...new Set([...destinationColumnOrderIds, ...sourceColumnOrderIds])];
      const manualSortForIndex = (index: number, total: number) => index - total;
      const overrideTimestamp = new Date();

      await prisma.$transaction(async (tx) => {
        for (const [index, itemId] of destinationColumnOrderIds.entries()) {
          await tx.checklistTask.update({
            where: { id: itemId },
            data: {
              kanbanColumn: destinationColumn,
              sortOrder: manualSortForIndex(index, destinationColumnOrderIds.length),
              updatedAt: new Date(),
              ...(itemId === id ? buildManualLaneOverrideData(destinationColumn, actorId, overrideTimestamp) : {}),
            },
          });
        }

        for (const [index, itemId] of sourceColumnOrderIds.entries()) {
          await tx.checklistTask.update({
            where: { id: itemId },
            data: {
              kanbanColumn: sourceColumn,
              sortOrder: manualSortForIndex(index, sourceColumnOrderIds.length),
              updatedAt: new Date(),
              ...(itemId === id ? buildManualLaneOverrideData(sourceColumn, actorId, overrideTimestamp) : {}),
            },
          });
        }
      }, TRANSACTION_SETTINGS);

      const updated = await prisma.checklistTask.findUnique({ where: { id } });

      await recordInteractionEventFromRequest(request, {
        companyId: existing.companyId,
        surface: "tactical-board",
        interactionType: "TASK_MANUAL_REORDER",
        entityType: "TASK",
        entityId: existing.id,
        beforeState: {
          kanbanColumn: existing.kanbanColumn,
          sortOrder: existing.sortOrder,
        },
        afterState: {
          kanbanColumn: updated?.kanbanColumn,
          sortOrder: updated?.sortOrder,
        },
        payload: {
          destinationColumn,
          sourceColumn,
          destinationColumnOrderIds,
          sourceColumnOrderIds,
          touchedIds,
        },
        teachingWeight: 95,
      });

      await recordOutcomeEvent({
        companyId: existing.companyId,
        actorType: "HUMAN",
        entityType: "TASK",
        entityId: existing.id,
        outcomeType: "TASK_MANUAL_REORDER",
        outcomeValue: `${sourceColumn}->${destinationColumn}`,
        beforeState: {
          kanbanColumn: existing.kanbanColumn,
          sortOrder: existing.sortOrder,
        },
        afterState: {
          kanbanColumn: updated?.kanbanColumn,
          sortOrder: updated?.sortOrder,
        },
        payload: {
          destinationColumnOrderIds,
          sourceColumnOrderIds,
        },
        teachingWeight: 95,
      });

      return NextResponse.json(updated);
    }

    if (typeof data.destinationColumn === "string") {
      const destinationColumn = String(data.destinationColumn) as ChecklistKanbanColumn;
      const sourceColumn = (data.sourceColumn ? String(data.sourceColumn) : existing.kanbanColumn) as ChecklistKanbanColumn;
      const actorId = auth.membership.id || auth.session.email || "webapp-user";
      const beforeId = typeof data.beforeId === "string" ? data.beforeId : null;
      const afterId = typeof data.afterId === "string" ? data.afterId : null;

      await ensureChecklistColumnRanks(existing.companyId, destinationColumn);

      const neighbors = await prisma.checklistTask.findMany({
        where: {
          companyId: existing.companyId,
          id: {
            in: [beforeId, afterId].filter((value): value is string => Boolean(value)),
          },
        },
        select: { id: true, sortOrder: true },
      });

      const previousRank = neighbors.find((item) => item.id === beforeId)?.sortOrder ?? null;
      const nextRank = neighbors.find((item) => item.id === afterId)?.sortOrder ?? null;
      const nextSortOrder = computeServerBoardRank(previousRank, nextRank)
        ?? (Number(previousRank ?? 0) + BOARD_RANK_STEP);

      const updated = await prisma.checklistTask.update({
        where: { id },
        data: {
          kanbanColumn: destinationColumn,
          sortOrder: nextSortOrder,
          updatedAt: new Date(),
          ...buildManualLaneOverrideData(destinationColumn, actorId),
        },
      });

      await recordInteractionEventFromRequest(request, {
        companyId: existing.companyId,
        surface: "tactical-board",
        interactionType: "TASK_MANUAL_REORDER",
        entityType: "TASK",
        entityId: existing.id,
        beforeState: {
          kanbanColumn: existing.kanbanColumn,
          sortOrder: existing.sortOrder,
        },
        afterState: {
          kanbanColumn: updated.kanbanColumn,
          sortOrder: updated.sortOrder,
        },
        payload: {
          destinationColumn,
          sourceColumn,
          beforeId,
          afterId,
        },
        teachingWeight: 95,
      });

      return NextResponse.json(updated);
    }

    const hasMetricOverride =
      data.impact !== undefined || data.confidence !== undefined || data.confidenceScore !== undefined || data.ease !== undefined;
    const nextIceScore =
      data.iceScore !== undefined
        ? Number(data.iceScore)
        : existing.iceScore;

    const nextProcessingStatus = data.processingStatus ?? existing.processingStatus;
    const nextActivityState = data.activityState ?? existing.activityState;
    const nextKanbanColumn = data.kanbanColumn ?? existing.kanbanColumn;
    const nextCandidateState = data.candidateState ?? existing.candidateState;
    const nextStatus = data.status ?? existing.status;
    const nextScheduledDate =
      data.scheduledDate !== undefined ? (data.scheduledDate ? new Date(data.scheduledDate) : null) : existing.scheduledDate;
    const isAcceptedNotDelivered = Boolean(data.acceptedNotDelivered);
    const actorId = auth.membership.id || auth.session.email || "webapp-user";
    const manualLaneOverrideData =
      nextKanbanColumn !== existing.kanbanColumn
        ? buildManualLaneOverrideData(nextKanbanColumn, actorId)
        : {};

    const updated = await prisma.checklistTask.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        impact: hasMetricOverride
          ? Number(data.impact ?? existing.impact)
          : existing.impact,
        confidence: hasMetricOverride
          ? Math.round(Number(data.confidenceScore ?? data.confidence ?? existing.confidence))
          : existing.confidence,
        confidenceScore: hasMetricOverride
          ? Number(data.confidenceScore ?? data.confidence ?? existing.confidenceScore ?? existing.confidence)
          : existing.confidenceScore,
        ease: hasMetricOverride
          ? Number(data.ease ?? existing.ease)
          : existing.ease,
        iceScore: nextIceScore,
        processingStatus: nextProcessingStatus,
        activityState: nextActivityState,
        status: nextStatus,
        kanbanColumn: nextKanbanColumn,
        sortOrder: data.sortOrder ?? existing.sortOrder,
        candidateState: nextCandidateState,
        qualityScore: data.qualityScore !== undefined ? data.qualityScore : existing.qualityScore,
        urgencyScore: data.urgencyScore !== undefined ? data.urgencyScore : existing.urgencyScore,
        freshnessScore: data.freshnessScore !== undefined ? data.freshnessScore : existing.freshnessScore,
        evaluationReason: data.evaluationReason ?? existing.evaluationReason,
        scheduledDate: nextScheduledDate,
        lastRescoredAt: existing.lastRescoredAt,
        updatedAt: new Date(),
        ...manualLaneOverrideData,
      },
    });

    const patchType =
      isAcceptedNotDelivered
        ? "TASK_ACCEPTED_NOT_DELIVERED"
        : nextKanbanColumn !== existing.kanbanColumn
        ? "TASK_MOVE_COLUMN"
        : hasMetricOverride || data.iceScore !== undefined
          ? "TASK_SCORE_OVERRIDE"
          : nextProcessingStatus !== existing.processingStatus || nextActivityState !== existing.activityState
            ? "TASK_STATUS_OVERRIDE"
            : "TASK_EDIT";

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "task-lifecycle",
      interactionType: patchType,
      entityType: "TASK",
      entityId: existing.id,
      beforeState: {
        title: existing.title,
        processingStatus: existing.processingStatus,
        activityState: existing.activityState,
        kanbanColumn: existing.kanbanColumn,
        candidateState: existing.candidateState,
        impact: existing.impact,
        confidenceScore: existing.confidenceScore,
        ease: existing.ease,
        iceScore: existing.iceScore,
      },
      afterState: {
        title: updated.title,
        processingStatus: updated.processingStatus,
        activityState: updated.activityState,
        status: updated.status,
        kanbanColumn: updated.kanbanColumn,
        candidateState: updated.candidateState,
        impact: updated.impact,
        confidenceScore: updated.confidenceScore,
        ease: updated.ease,
        iceScore: updated.iceScore,
      },
      payload: {
        ...data,
      },
      teachingWeight:
        patchType === "TASK_ACCEPTED_NOT_DELIVERED"
          ? 90
          : patchType === "TASK_MOVE_COLUMN"
            ? 70
            : patchType === "TASK_SCORE_OVERRIDE"
              ? 90
              : 60,
    });

    if (hasMetricOverride || data.iceScore !== undefined || data.qualityScore !== undefined || data.urgencyScore !== undefined || data.freshnessScore !== undefined || data.candidateState !== undefined) {
      await recordDecisionEvent({
        companyId: existing.companyId,
        decisionMaker: "human-override",
        decisionType: "TASK_EVALUATION_OVERRIDE",
        entityType: "TASK",
        entityId: existing.id,
        beforeState: {
          impact: existing.impact,
          confidenceScore: existing.confidenceScore,
          ease: existing.ease,
          iceScore: existing.iceScore,
          candidateState: existing.candidateState,
          qualityScore: existing.qualityScore,
          urgencyScore: existing.urgencyScore,
          freshnessScore: existing.freshnessScore,
        },
        afterState: {
          impact: updated.impact,
          confidenceScore: updated.confidenceScore,
          ease: updated.ease,
          iceScore: updated.iceScore,
          candidateState: updated.candidateState,
          qualityScore: updated.qualityScore,
          urgencyScore: updated.urgencyScore,
          freshnessScore: updated.freshnessScore,
        },
        payload: {
          explicitIceScore: data.iceScore,
          evaluationReason: updated.evaluationReason,
        },
        rationale: data.evaluationReason ?? "Manual override applied through checklist API",
        teachingWeight: 90,
      });
    }

    if (
      updated.processingStatus !== existing.processingStatus ||
      updated.activityState !== existing.activityState ||
      updated.kanbanColumn !== existing.kanbanColumn
    ) {
      await recordOutcomeEvent({
        companyId: existing.companyId,
        actorType: "HUMAN",
        entityType: "TASK",
        entityId: existing.id,
        outcomeType: "TASK_LIFECYCLE_CHANGE",
        outcomeValue: `${updated.processingStatus}:${updated.activityState}:${updated.kanbanColumn ?? "UNSET"}`,
        beforeState: {
          processingStatus: existing.processingStatus,
          activityState: existing.activityState,
          kanbanColumn: existing.kanbanColumn,
        },
        afterState: {
          processingStatus: updated.processingStatus,
          activityState: updated.activityState,
          status: updated.status,
          kanbanColumn: updated.kanbanColumn,
        },
        payload: data,
        teachingWeight: isAcceptedNotDelivered ? 90 : updated.kanbanColumn !== existing.kanbanColumn ? 70 : 60,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API:CHECKLIST] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existing = await prisma.checklistTask.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const updated = await prisma.checklistTask.update({
      where: { id },
      data: {
        activityState: "ARCHIVED",
        processingStatus: existing.processingStatus === "DECLINED" ? existing.processingStatus : "DECLINED",
        updatedAt: new Date(),
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "task-lifecycle",
      interactionType: "TASK_ARCHIVE",
      entityType: "TASK",
      entityId: existing.id,
      beforeState: {
        processingStatus: existing.processingStatus,
        activityState: existing.activityState,
      },
      afterState: {
        processingStatus: updated.processingStatus,
        activityState: updated.activityState,
      },
      teachingWeight: 35,
    });

    await recordOutcomeEvent({
      companyId: existing.companyId,
      actorType: "HUMAN",
      entityType: "TASK",
      entityId: existing.id,
      outcomeType: "ARCHIVED",
      outcomeValue: updated.processingStatus,
      beforeState: {
        processingStatus: existing.processingStatus,
        activityState: existing.activityState,
      },
      afterState: {
        processingStatus: updated.processingStatus,
        activityState: updated.activityState,
      },
      teachingWeight: 35,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API:CHECKLIST] DELETE failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
