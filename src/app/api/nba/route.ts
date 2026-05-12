import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import { calculateICEScore, normalizeNBAMetrics } from "@/lib/nba-scoring";
import { computePriorityCohortProfiles } from "@/lib/scoring-contract";
import { applyPlanningHitlScoreAdjustment, type NBAKanbanColumn } from "@/lib/planning-hitl";
import { ensurechecklistPublicIds, nextchecklistPublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { APP_VERSION, BRAIN_VERSION, NBA_PROMPT_VERSION } from "@/lib/release";
import { recordDecisionEvent, recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
export const dynamic = 'force-dynamic';

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

    const items = await prisma.nBAItem.findMany({
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
    const priorityProfiles = computePriorityCohortProfiles(items);
    const enriched = items.map((item, index) => ({
      ...item,
      priorityProfile: priorityProfiles[index],
    }));

    enriched.sort((left, right) => {
      const leftManual = (left.sortOrder ?? 0) !== 0;
      const rightManual = (right.sortOrder ?? 0) !== 0;
      if ((showAll || Boolean(kanbanColumn)) && leftManual !== rightManual) {
        return leftManual ? -1 : 1;
      }
      if ((showAll || Boolean(kanbanColumn)) && leftManual && rightManual && left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      const leftPriority = left.priorityProfile?.score ?? 0;
      const rightPriority = right.priorityProfile?.score ?? 0;
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;
      if ((right.confidenceScore ?? 0) !== (left.confidenceScore ?? 0)) {
        return (right.confidenceScore ?? 0) - (left.confidenceScore ?? 0);
      }
      return (left.publicId ?? Number.MAX_SAFE_INTEGER) - (right.publicId ?? Number.MAX_SAFE_INTEGER);
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("[API:NBA] Get failure:", error);
    // Iron-Clad: Never return a non-array crash object to the dashboard
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
    const item = await prisma.nBAItem.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        description: data.description,
        processingStatus: "DRAFT",
        activityState: "ACTIVE",
        status: "PENDING", // Legacy Sync
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
        createdBy: data.createdBy,
        appVersion: APP_VERSION,
        brainVersion: BRAIN_VERSION,
        promptVersion: NBA_PROMPT_VERSION,
        generatedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: data.companyId,
      surface: "task-ingress",
      interactionType: "TASK_CREATE",
      entityType: "TASK",
      entityId: item.id,
      afterState: {
        title: item.title,
        processingStatus: item.processingStatus,
        activityState: item.activityState,
        kanbanColumn: item.kanbanColumn,
      },
      payload: {
        scheduledDate: item.scheduledDate,
        createdBy: item.createdBy,
      },
      teachingWeight: 40,
    });
    
    return NextResponse.json(item);
  } catch (error) {
    console.error("[API:NBA] Post failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data = await request.json();
    const existing = await prisma.nBAItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    if (Array.isArray(data.destinationColumnOrderIds) && data.destinationColumn) {
      const destinationColumn = String(data.destinationColumn) as NBAKanbanColumn;
      const sourceColumn = (data.sourceColumn ? String(data.sourceColumn) : destinationColumn) as NBAKanbanColumn;
      const destinationColumnOrderIds = data.destinationColumnOrderIds.filter((value: unknown): value is string => typeof value === "string");
      const sourceColumnOrderIds = Array.isArray(data.sourceColumnOrderIds)
        ? data.sourceColumnOrderIds.filter((value: unknown): value is string => typeof value === "string")
        : [];
      const hitlAdjustment = applyPlanningHitlScoreAdjustment(
        {
          impact: existing.impact,
          confidence: existing.confidenceScore ?? existing.confidence,
          ease: existing.ease,
        },
        sourceColumn,
        destinationColumn,
      );

      const touchedIds = [...new Set([...destinationColumnOrderIds, ...sourceColumnOrderIds])];
      const manualSortForIndex = (index: number, total: number) => index - total;

      await prisma.$transaction(async (tx) => {
        for (const [index, itemId] of destinationColumnOrderIds.entries()) {
          await tx.nBAItem.update({
            where: { id: itemId },
            data: {
              kanbanColumn: destinationColumn,
              sortOrder: manualSortForIndex(index, destinationColumnOrderIds.length),
              impact:
                itemId === existing.id && hitlAdjustment.triggered
                  ? hitlAdjustment.impact
                  : undefined,
              confidence:
                itemId === existing.id && hitlAdjustment.triggered
                  ? hitlAdjustment.confidence
                  : undefined,
              confidenceScore:
                itemId === existing.id && hitlAdjustment.triggered
                  ? hitlAdjustment.confidence
                  : undefined,
              ease:
                itemId === existing.id && hitlAdjustment.triggered
                  ? hitlAdjustment.ease
                  : undefined,
              iceScore:
                itemId === existing.id && hitlAdjustment.triggered
                  ? hitlAdjustment.iceScore
                  : undefined,
              lastAuditedAt:
                itemId === existing.id && hitlAdjustment.triggered
                  ? null
                  : undefined,
              updatedAt: new Date(),
            },
          });
        }

        for (const [index, itemId] of sourceColumnOrderIds.entries()) {
          await tx.nBAItem.update({
            where: { id: itemId },
            data: {
              kanbanColumn: sourceColumn,
              sortOrder: manualSortForIndex(index, sourceColumnOrderIds.length),
              updatedAt: new Date(),
            },
          });
        }
      }, TRANSACTION_SETTINGS);

      const updated = await prisma.nBAItem.findUnique({ where: { id } });

      await recordInteractionEventFromRequest(request, {
        companyId: existing.companyId,
        surface: "planning-board",
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
          planningHitlAdjustment: hitlAdjustment.triggered
            ? {
                distance: hitlAdjustment.distance,
                direction: hitlAdjustment.direction,
                confidenceDelta: hitlAdjustment.confidenceDelta,
                impactDelta: hitlAdjustment.impactDelta,
                nextImpact: hitlAdjustment.impact,
                nextConfidence: hitlAdjustment.confidence,
                nextEase: hitlAdjustment.ease,
                nextIceScore: hitlAdjustment.iceScore,
              }
            : null,
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
          planningHitlAdjustment: hitlAdjustment.triggered
            ? {
                distance: hitlAdjustment.distance,
                direction: hitlAdjustment.direction,
                confidenceDelta: hitlAdjustment.confidenceDelta,
                impactDelta: hitlAdjustment.impactDelta,
                nextImpact: hitlAdjustment.impact,
                nextConfidence: hitlAdjustment.confidence,
                nextEase: hitlAdjustment.ease,
                nextIceScore: hitlAdjustment.iceScore,
              }
            : null,
        },
        teachingWeight: 95,
      });

      if (hitlAdjustment.triggered && updated) {
        await recordDecisionEvent({
          companyId: existing.companyId,
          decisionMaker: "human-planning-hitl",
          decisionType: "TASK_EVALUATION_OVERRIDE",
          entityType: "TASK",
          entityId: existing.id,
          beforeState: {
            kanbanColumn: existing.kanbanColumn,
            impact: existing.impact,
            confidenceScore: existing.confidenceScore,
            ease: existing.ease,
            iceScore: existing.iceScore,
          },
          afterState: {
            kanbanColumn: updated.kanbanColumn,
            impact: updated.impact,
            confidenceScore: updated.confidenceScore,
            ease: updated.ease,
            iceScore: updated.iceScore,
          },
          payload: {
            sourceColumn,
            destinationColumn,
            distance: hitlAdjustment.distance,
            direction: hitlAdjustment.direction,
            confidenceDelta: hitlAdjustment.confidenceDelta,
            impactDelta: hitlAdjustment.impactDelta,
          },
          rationale: "Human planning move across at least two tactical horizons taught task scoring.",
          teachingWeight: 100,
        });
      }

      return NextResponse.json(updated);
    }

    const hasMetricOverride =
      data.impact !== undefined || data.confidence !== undefined || data.confidenceScore !== undefined || data.ease !== undefined;
    const metricInput = normalizeNBAMetrics({
      impact: data.impact ?? existing.impact,
      confidence: data.confidenceScore ?? data.confidence ?? existing.confidenceScore ?? existing.confidence,
      ease: data.ease ?? existing.ease,
    });
    const nextIceScore =
      data.iceScore !== undefined
        ? Number(data.iceScore)
        : hasMetricOverride
          ? calculateICEScore(metricInput)
          : existing.iceScore;

    const nextProcessingStatus = data.processingStatus ?? existing.processingStatus;
    const nextActivityState = data.activityState ?? existing.activityState;
    const nextKanbanColumn = data.kanbanColumn ?? existing.kanbanColumn;
    const planningHitlAdjustment =
      nextKanbanColumn !== existing.kanbanColumn
        ? applyPlanningHitlScoreAdjustment(
            {
              impact: existing.impact,
              confidence: existing.confidenceScore ?? existing.confidence,
              ease: existing.ease,
            },
            existing.kanbanColumn as NBAKanbanColumn,
            nextKanbanColumn as NBAKanbanColumn,
          )
        : null;
    const nextCandidateState = data.candidateState ?? existing.candidateState;
    const nextStatus = data.status ?? existing.status;
    const nextScheduledDate =
      data.scheduledDate !== undefined ? (data.scheduledDate ? new Date(data.scheduledDate) : null) : existing.scheduledDate;
    const isAcceptedNotDelivered = Boolean(data.acceptedNotDelivered);

    const updated = await prisma.nBAItem.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        impact: hasMetricOverride
          ? metricInput.impact
          : planningHitlAdjustment?.triggered
            ? planningHitlAdjustment.impact
            : existing.impact,
        confidence: hasMetricOverride
          ? Math.round(metricInput.confidence)
          : planningHitlAdjustment?.triggered
            ? planningHitlAdjustment.confidence
            : existing.confidence,
        confidenceScore: hasMetricOverride
          ? metricInput.confidence
          : planningHitlAdjustment?.triggered
            ? planningHitlAdjustment.confidence
            : existing.confidenceScore,
        ease: hasMetricOverride
          ? metricInput.ease
          : planningHitlAdjustment?.triggered
            ? planningHitlAdjustment.ease
            : existing.ease,
        iceScore: hasMetricOverride
          ? nextIceScore
          : planningHitlAdjustment?.triggered
            ? planningHitlAdjustment.iceScore
            : nextIceScore,
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
        lastAuditedAt: planningHitlAdjustment?.triggered ? null : existing.lastAuditedAt,
        updatedAt: new Date(),
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
        planningHitlAdjustment: planningHitlAdjustment?.triggered
          ? {
              distance: planningHitlAdjustment.distance,
              direction: planningHitlAdjustment.direction,
              confidenceDelta: planningHitlAdjustment.confidenceDelta,
              impactDelta: planningHitlAdjustment.impactDelta,
              nextImpact: planningHitlAdjustment.impact,
              nextConfidence: planningHitlAdjustment.confidence,
              nextEase: planningHitlAdjustment.ease,
              nextIceScore: planningHitlAdjustment.iceScore,
            }
          : null,
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
          metricInput,
          evaluationReason: updated.evaluationReason,
          planningHitlAdjustment: planningHitlAdjustment?.triggered
            ? {
                distance: planningHitlAdjustment.distance,
                direction: planningHitlAdjustment.direction,
                confidenceDelta: planningHitlAdjustment.confidenceDelta,
                impactDelta: planningHitlAdjustment.impactDelta,
              }
            : null,
        },
        rationale: data.evaluationReason ?? "Manual override applied through task API",
        teachingWeight: 90,
      });
    } else if (planningHitlAdjustment?.triggered) {
      await recordDecisionEvent({
        companyId: existing.companyId,
        decisionMaker: "human-planning-hitl",
        decisionType: "TASK_EVALUATION_OVERRIDE",
        entityType: "TASK",
        entityId: existing.id,
        beforeState: {
          kanbanColumn: existing.kanbanColumn,
          impact: existing.impact,
          confidenceScore: existing.confidenceScore,
          ease: existing.ease,
          iceScore: existing.iceScore,
        },
        afterState: {
          kanbanColumn: updated.kanbanColumn,
          impact: updated.impact,
          confidenceScore: updated.confidenceScore,
          ease: updated.ease,
          iceScore: updated.iceScore,
        },
        payload: {
          distance: planningHitlAdjustment.distance,
          direction: planningHitlAdjustment.direction,
          confidenceDelta: planningHitlAdjustment.confidenceDelta,
          impactDelta: planningHitlAdjustment.impactDelta,
        },
        rationale: "Human planning move across at least two tactical horizons taught task scoring.",
        teachingWeight: 100,
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

    // NOTE: The Kanban column update is immediately persisted to the database.
    // The local Trinity Guardian worker detects the change on its next synthesis
    // cycle and autonomously recomputes the frontier. No server-side trigger needed.
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API:NBA] Patch failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existing = await prisma.nBAItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const updated = await prisma.nBAItem.update({
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
    console.error("[API:NBA] Delete failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
