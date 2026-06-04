import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHumanApprovedBurstChildJobs } from "@/lib/human-approved-burst";
import { safeRecordLocalLaneEvent } from "@/lib/local-lane-events";
import { assertHumanApprovedBurstRequest, LocalExecutionLaneError, type HumanApprovedBurstRequest } from "@/lib/local-execution-lanes";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function numberFromBody(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function asBodyRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mergeJobMetadata(job: { metadata?: unknown }, patch: Record<string, unknown>) {
  const metadata = job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
    ? job.metadata as Record<string, unknown>
    : {};
  return JSON.parse(JSON.stringify({
    ...metadata,
    burstRecovery: {
      ...(metadata.burstRecovery && typeof metadata.burstRecovery === "object" && !Array.isArray(metadata.burstRecovery)
        ? metadata.burstRecovery as Record<string, unknown>
        : {}),
      ...patch,
    },
  }));
}

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => null);
    const body = asBodyRecord(bodyRaw);
    if (!body) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

    const auth = await verifyMembership(request, companyId, "ADMIN");
    if (auth.error) return auth.error;

    const destinationKey = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
    const blockKey = typeof body.blockKey === "string" ? body.blockKey.trim() : undefined;
    const moduleKey = typeof body.moduleKey === "string" ? body.moduleKey.trim() : undefined;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const parentBurstId = typeof body.parentBurstId === "string" && body.parentBurstId.trim()
      ? body.parentBurstId.trim()
      : `burst_${crypto.randomUUID()}`;

    const burstRequest: HumanApprovedBurstRequest = {
      approvedBy: auth.membership?.email || auth.session?.email || "unknown-operator",
      reason,
      requestedOutputCount: Math.floor(numberFromBody(body.requestedOutputCount, 0)),
      shardSize: Math.floor(numberFromBody(body.shardSize, 5)),
      maxConcurrency: Math.floor(numberFromBody(body.maxConcurrency, 1)),
      minFreeMemoryMb: numberFromBody(body.minFreeMemoryMb, 4096),
      timeoutSeconds: Math.floor(numberFromBody(body.timeoutSeconds, 3600)),
      target: {
        companyId,
        destinationKey,
        blockKey,
        moduleKey,
      },
      rollbackMode: body.rollbackMode === "PARK_CHILD_JOBS" ? "PARK_CHILD_JOBS" : "REWORK_CHILD_OUTPUTS",
    };

    try {
      assertHumanApprovedBurstRequest(burstRequest);
    } catch (error) {
      if (error instanceof LocalExecutionLaneError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      throw error;
    }

    await safeRecordLocalLaneEvent(prisma, {
      lane: "HUMAN_APPROVED_BURST",
      eventType: "APPROVED",
      actor: "operator",
      companyId,
      burstId: parentBurstId,
      destinationKey,
      summary: `Human-approved burst approved: ${burstRequest.reason}`,
      metadata: {
        approvedBy: burstRequest.approvedBy,
        requestedOutputCount: burstRequest.requestedOutputCount,
        shardSize: burstRequest.shardSize,
        maxConcurrency: burstRequest.maxConcurrency,
        minFreeMemoryMb: burstRequest.minFreeMemoryMb,
        timeoutSeconds: burstRequest.timeoutSeconds,
        rollbackMode: burstRequest.rollbackMode,
        target: burstRequest.target,
      },
    });

    const childJobs = await createHumanApprovedBurstChildJobs(prisma, {
      companyId,
      parentBurstId,
      request: burstRequest,
    });

    await safeRecordLocalLaneEvent(prisma, {
      lane: "HUMAN_APPROVED_BURST",
      eventType: "CHILDREN_CREATED",
      actor: "burst-controller",
      companyId,
      burstId: parentBurstId,
      destinationKey,
      summary: `Human-approved burst created ${childJobs.length} child job(s): ${burstRequest.reason}`,
      metadata: {
        requestedOutputCount: burstRequest.requestedOutputCount,
        shardSize: burstRequest.shardSize,
        maxConcurrency: burstRequest.maxConcurrency,
        minFreeMemoryMb: burstRequest.minFreeMemoryMb,
        timeoutSeconds: burstRequest.timeoutSeconds,
        rollbackMode: burstRequest.rollbackMode,
        target: burstRequest.target,
        childJobIds: childJobs.map((job: { id: string }) => job.id),
      },
    });

    return NextResponse.json({
      ok: true,
      lane: "HUMAN_APPROVED_BURST",
      parentBurstId,
      childJobIds: childJobs.map((job: { id: string }) => job.id),
      childCount: childJobs.length,
      requestedOutputCount: burstRequest.requestedOutputCount,
      target: burstRequest.target,
      message: "Human-approved burst child jobs were created in the Playlist queue.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reasonCode: "human_approved_burst_create_failed",
      summary: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => null);
    const body = asBodyRecord(bodyRaw);
    if (!body) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }

    const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
    const parentBurstId = typeof body.parentBurstId === "string" ? body.parentBurstId.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim().toUpperCase() : "";
    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : `${action || "BURST_RECOVERY"} requested by operator.`;

    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    if (!parentBurstId) return NextResponse.json({ error: "parentBurstId is required" }, { status: 400 });
    if (action !== "STOP_REQUESTED" && action !== "ROLLBACK_PARK_CHILD_JOBS" && action !== "ROLLBACK_REWORK_CHILD_OUTPUTS") {
      return NextResponse.json({ error: "action must be STOP_REQUESTED, ROLLBACK_PARK_CHILD_JOBS, or ROLLBACK_REWORK_CHILD_OUTPUTS" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId, "ADMIN");
    if (auth.error) return auth.error;

    const childJobs = await prisma.pipelineJob.findMany({
      where: {
        companyId,
        sourceSignal: `human-approved-burst:${parentBurstId}`,
      },
      select: {
        id: true,
        status: true,
        queueColumn: true,
        metadata: true,
      },
    });

    const recoveryAt = new Date().toISOString();
    const eventType = action === "STOP_REQUESTED" ? "STOP_REQUESTED" : "ROLLBACK";
    const queueColumn = "PARKED";
    const status = "PAUSED";
    const actionLabel = action.toLowerCase().replace(/_/g, " ");
    const childIds: string[] = [];
    const requestedAt = new Date().toISOString();

    for (const job of childJobs) {
      childIds.push(job.id);
      await prisma.pipelineJob.update({
        where: { id: job.id },
        data: {
          status,
          queueColumn,
          scheduledAt: { unset: true },
          lastError: null,
          reason,
          metadata: mergeJobMetadata(job, {
            action,
            reason,
            requestedAt,
            requestedBy: auth.membership?.email || auth.session?.email || "unknown-operator",
          }),
          updatedAt: new Date(),
        },
      });
    }

    await safeRecordLocalLaneEvent(prisma, {
      lane: "HUMAN_APPROVED_BURST",
      eventType,
      actor: "operator",
      companyId,
      burstId: parentBurstId,
      summary: `${actionLabel} applied to ${childJobs.length} child job(s): ${reason}`,
      metadata: {
        action,
        reason,
        requestedAt,
        recoveryMode: action === "STOP_REQUESTED" ? "stopped" : "rollback",
        recoveryScope: "child_jobs",
        recoveryState: action === "STOP_REQUESTED" ? "paused_for_operator_review" : "parked_for_rework_or_requeue",
        childJobIds: childIds,
      },
    });

    return NextResponse.json({
      ok: true,
      lane: "HUMAN_APPROVED_BURST",
      parentBurstId,
      action,
      affectedChildJobs: childIds.length,
      childJobIds: childIds,
      message: "Human-approved burst recovery action was recorded and child jobs were parked.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      reasonCode: "human_approved_burst_recovery_failed",
      summary: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
