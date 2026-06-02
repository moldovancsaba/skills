import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { guardedUnitMutation, type UnitPermission } from "@/lib/check-foundation/permissions-audit";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { issueSystemCommand } from "@/lib/system-commands";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

type OperationalStatus = "running" | "retrying" | "failed" | "dead_lettered" | "stale" | "blocked" | "resolved";
type OperationalAction = "retry" | "cancel" | "replay" | "rollback" | "acknowledge";

type ParsedOperationItem =
  | { source: "local_job"; itemId: string; jobId: string }
  | { source: "miniapp_publish"; itemId: string; destinationKey: "classscout" | "compare" }
  | { source: "read_model"; itemId: string; projectionKey: "projection-stale" };

function parseOperationAction(value: string): OperationalAction | null {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "retry" ||
    normalized === "cancel" ||
    normalized === "replay" ||
    normalized === "rollback" ||
    normalized === "acknowledge"
  ) {
    return normalized;
  }
  return null;
}

function parseOperationItem(rawItemId: string): ParsedOperationItem | null {
  let itemId = String(rawItemId || "").trim();
  try {
    itemId = decodeURIComponent(itemId);
  } catch {
    return null;
  }
  if (!itemId) return null;

  if (itemId.startsWith("local-job:")) {
    const jobId = itemId.slice("local-job:".length).trim();
    return jobId ? { source: "local_job", itemId, jobId } : null;
  }

  const miniappMatch = /^miniapp-publish:(classscout|compare)-review-pressure$/i.exec(itemId);
  if (miniappMatch) {
    const destinationKey = normalizeDestinationKey(miniappMatch[1]);
    if (!destinationKey) return null;
    return { source: "miniapp_publish", itemId, destinationKey };
  }

  if (itemId === "read-model:projection-stale") {
    return { source: "read_model", itemId, projectionKey: "projection-stale" };
  }

  return null;
}

function normalizeOperationalStatusFromJob(status: string, attemptCount: number, lastError?: string | null): OperationalStatus {
  if (status === "RUNNING") return "running";
  if (status === "FAILED") {
    if (attemptCount >= 3 && lastError) return "dead_lettered";
    return "failed";
  }
  if (status === "PAUSED") return "blocked";
  if (status === "ACTIVE" && attemptCount > 0) return "retrying";
  return "resolved";
}

function actionsFromOperationalStatus(status: OperationalStatus): OperationalAction[] {
  if (status === "failed") return ["retry", "cancel", "acknowledge"];
  if (status === "dead_lettered") return ["replay", "rollback", "acknowledge"];
  if (status === "blocked") return ["retry", "cancel", "acknowledge"];
  if (status === "retrying") return ["cancel", "acknowledge"];
  if (status === "running") return ["cancel", "acknowledge"];
  if (status === "stale") return ["retry", "acknowledge"];
  return ["acknowledge"];
}

function actionPermissionForItem(input: {
  source: ParsedOperationItem["source"];
  action: OperationalAction;
}): UnitPermission {
  if (input.source === "miniapp_publish") {
    if (input.action === "rollback") return "miniapp.publish.rollback";
    return "miniapp.card.publish";
  }
  return "local.job.retry";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; itemId: string; action: string }> },
) {
  const { companyId, itemId: rawItemId, action: rawAction } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const action = parseOperationAction(rawAction);
  if (!action) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const item = parseOperationItem(rawItemId);
  if (!item) {
    return NextResponse.json({ error: "Unknown operation item" }, { status: 404 });
  }

  const bodyRaw = await request.json().catch(() => null);
  if (bodyRaw !== null && (typeof bodyRaw !== "object" || Array.isArray(bodyRaw))) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = (bodyRaw ?? {}) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const idempotencyKey = String(body.idempotencyKey || request.headers.get("Idempotency-Key") || "").trim() || null;

  if (item.source === "miniapp_publish" && action !== "replay" && action !== "retry" && action !== "acknowledge") {
    return NextResponse.json({
      error: `Action ${action} is not allowed for miniapp publish pressure items`,
      safeActions: ["replay", "acknowledge"],
    }, { status: 409 });
  }
  if (item.source === "read_model" && action !== "retry" && action !== "acknowledge") {
    return NextResponse.json({
      error: `Action ${action} is not allowed for read-model items`,
      safeActions: ["retry", "acknowledge"],
    }, { status: 409 });
  }

  try {
    const permission = actionPermissionForItem({ source: item.source, action });
    const result = await guardedUnitMutation({
      companyId,
      role: auth.membership.role,
      permission,
      targetType: item.source === "local_job" ? "local_job" : item.source === "miniapp_publish" ? "miniappcard" : "unit",
      targetId: item.itemId,
      actorId: auth.membership.id,
      actorEmail: auth.session.email,
      reason: reason || undefined,
      payload: {
        itemId: item.itemId,
        action,
        idempotencyKey,
      },
      action: async () => {
        if (item.source === "local_job") {
          const job = await prisma.pipelineJob.findFirst({
            where: {
              companyId,
              id: item.jobId,
            },
            select: {
              id: true,
              status: true,
              attemptCount: true,
              lastError: true,
              queueColumn: true,
              reason: true,
            },
          });
          if (!job) {
            return {
              ok: false as const,
              status: 404,
              error: "Operational item not found",
            };
          }

          const operationalStatus = normalizeOperationalStatusFromJob(
            job.status,
            Number(job.attemptCount || 0),
            job.lastError,
          );
          const safeActions = actionsFromOperationalStatus(operationalStatus);

          if (!safeActions.includes(action)) {
            return {
              ok: false as const,
              status: 409,
              error: `Action ${action} is not allowed for local-job state ${operationalStatus}`,
              safeActions,
            };
          }

          if (action === "acknowledge") {
            return {
              ok: true as const,
              source: item.source,
              itemId: item.itemId,
              action,
              acknowledged: true,
              operationalStatus,
              safeActions,
            };
          }

          const now = new Date();
          const updated =
            action === "cancel"
              ? await prisma.pipelineJob.update({
                  where: { id: job.id },
                  data: {
                    status: "PAUSED",
                    queueColumn: "PARKED",
                    scheduledAt: { unset: true },
                    updatedAt: now,
                    reason: reason || `Paused by operator action ${action}.`,
                  },
                })
              : action === "rollback"
                ? await prisma.pipelineJob.update({
                    where: { id: job.id },
                    data: {
                      status: "ACTIVE",
                      queueColumn: "SOON",
                      controlMode: "HUMAN_GUIDED",
                      scheduledAt: { unset: true },
                      lastError: null,
                      updatedAt: now,
                      reason: reason || `Rollback requested by operator.`,
                    },
                  })
                : await prisma.pipelineJob.update({
                    where: { id: job.id },
                    data: {
                      status: "ACTIVE",
                      queueColumn: "NOW",
                      controlMode: "AI_ONLY",
                      scheduledAt: { unset: true },
                      lastError: null,
                      updatedAt: now,
                      reason: reason || `Recovered by operator action ${action}.`,
                    },
                  });

          await issueSystemCommand("REFRESH_INTELLIGENCE_SNAPSHOTS", {
            companyId,
            source: "company-operations-action",
            itemId: item.itemId,
            action,
          });

          return {
            ok: true as const,
            source: item.source,
            itemId: item.itemId,
            action,
            job: updated,
          };
        }

        if (item.source === "miniapp_publish") {
          if (action !== "replay" && action !== "retry" && action !== "acknowledge") {
            return {
              ok: false as const,
              status: 409,
              error: `Action ${action} is not allowed for miniapp publish pressure items`,
              safeActions: ["replay", "acknowledge"],
            };
          }

          if (action === "acknowledge") {
            return {
              ok: true as const,
              source: item.source,
              itemId: item.itemId,
              action,
              acknowledged: true,
            };
          }

          const [escalateCommand, syncCommand, refreshCommand] = await Promise.all([
            issueSystemCommand("ESCALATE_PIPELINE_JOB", {
              companyId,
              jobType: "DESTINATION_MISSION_DAEMON",
              destinationKey: item.destinationKey,
              source: "company-operations-action",
              itemId: item.itemId,
              action,
              reason: reason || null,
              idempotencyKey,
            }),
            issueSystemCommand("SYNC_PIPELINE_JOBS", {
              companyId,
              source: "company-operations-action",
              itemId: item.itemId,
              action,
              idempotencyKey,
            }),
            issueSystemCommand("REFRESH_INTELLIGENCE_SNAPSHOTS", {
              companyId,
              source: "company-operations-action",
              itemId: item.itemId,
              action,
              idempotencyKey,
            }),
          ]);

          return {
            ok: true as const,
            source: item.source,
            itemId: item.itemId,
            action,
            commands: {
              escalate: escalateCommand.id,
              sync: syncCommand.id,
              refresh: refreshCommand.id,
            },
          };
        }

        if (item.source === "read_model") {
          if (action !== "retry" && action !== "acknowledge") {
            return {
              ok: false as const,
              status: 409,
              error: `Action ${action} is not allowed for read-model items`,
              safeActions: ["retry", "acknowledge"],
            };
          }

          if (action === "acknowledge") {
            return {
              ok: true as const,
              source: item.source,
              itemId: item.itemId,
              action,
              acknowledged: true,
            };
          }

          const command = await issueSystemCommand("REFRESH_INTELLIGENCE_SNAPSHOTS", {
            companyId,
            source: "company-operations-action",
            itemId: item.itemId,
            action,
            idempotencyKey,
          });

          return {
            ok: true as const,
            source: item.source,
            itemId: item.itemId,
            action,
            commands: {
              refresh: command.id,
            },
          };
        }

        return {
          ok: false as const,
          status: 404,
          error: "Unsupported operation source",
        };
      },
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status ?? 500 });
    }

    await Promise.all([
      recordInteractionEventFromRequest(request, {
        companyId,
        surface: "operations-recovery",
        interactionType: `OPERATIONS_${String(action).toUpperCase()}`,
        entityType: "PIPELINE_QUEUE",
        entityId: item.itemId,
        payload: {
          itemId: item.itemId,
          action,
          source: item.source,
          reason: reason || null,
          idempotencyKey,
        },
        teachingWeight: 75,
      }),
      recordOutcomeEvent({
        companyId,
        actorType: "HUMAN",
        actorId: auth.membership.id,
        actorEmail: auth.session.email,
        entityType: "PIPELINE_QUEUE",
        entityId: item.itemId,
        outcomeType: `OPERATIONS_${String(action).toUpperCase()}`,
        outcomeValue: item.source,
        annotation: reason || undefined,
        payload: {
          itemId: item.itemId,
          action,
          source: item.source,
          idempotencyKey,
        },
        teachingWeight: 75,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      companyId,
      itemId: item.itemId,
      action,
      result,
    });
  } catch (error) {
    console.error("[API:CompanyOperationsAction] Failure:", error);
    const status = error instanceof Error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode || 500) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}
