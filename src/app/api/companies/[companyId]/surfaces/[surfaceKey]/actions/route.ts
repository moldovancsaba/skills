import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BOARD_RANK_STEP, PROJECT_BOARD_COLUMNS } from "@/lib/board-system";
import { computeServerBoardRank } from "@/lib/board-rank";
import { verifyMembership } from "@/lib/permissions";
import {
  getCompanySurfaceReadModel,
  markCompanySurfaceProjectionDirty,
} from "@/lib/surface-projections";
import {
  buildUnitBoardProjectReadModel,
  UNIT_BOARD_PROJECT_BOARD_KEY,
  UNIT_BOARD_PROJECT_ENTITY_TYPE,
  UNIT_BOARD_PROJECT_SURFACE_KEY,
  type UnitBoardProjectionAction,
} from "@/lib/unit-board-projection";

export const dynamic = "force-dynamic";

type SurfaceActionStatus = "ACCEPTED" | "APPLIED" | "REJECTED" | "CONFLICT";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const normalized = readString(value);
  return normalized || null;
}

function readPriority(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(3, Math.round(parsed)));
}

function readEffort(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function readColumnKey(value: unknown) {
  const requested = readString(value);
  return PROJECT_BOARD_COLUMNS.some((column) => column.key === requested)
    ? requested
    : PROJECT_BOARD_COLUMNS[0].key;
}

function readBoardCardId(value: unknown) {
  const normalized = readString(value);
  if (!normalized || normalized.length > 64) return null;
  return normalized;
}

async function readJsonBody(request: NextRequest) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function receipt(status: SurfaceActionStatus, message: string, extra: Record<string, unknown> = {}) {
  return {
    ok: status !== "REJECTED" && status !== "CONFLICT",
    receiptId: crypto.randomUUID(),
    status,
    message,
    ...extra,
  };
}

function readBoardMetadata(body: Record<string, unknown>) {
  return {
    assignee: readNullableString(body.assignee),
    dueDate: readNullableString(body.dueDate),
    estimatedEffort: readEffort(body.estimatedEffort),
    sourceType: readNullableString(body.sourceType),
    sourceId: readNullableString(body.sourceId),
    notes: readNullableString(body.notes),
  };
}

async function getCurrentSurfaceProjection(companyId: string, surfaceKey: string) {
  if (surfaceKey === UNIT_BOARD_PROJECT_SURFACE_KEY) {
    return buildUnitBoardProjectReadModel(prisma, companyId);
  }
  return getCompanySurfaceReadModel(prisma, { companyId, surfaceKey });
}

async function handleUnitBoardProjectAction(companyId: string, action: string, body: Record<string, unknown>, actor: string) {
  const now = new Date();

  if (action === "create") {
    const title = readString(body.title);
    if (!title) {
      return { status: "REJECTED" as const, message: "Project card title is required." };
    }
    const columnKey = readColumnKey(body.columnKey);
    const latestState = await prisma.boardItemState.findFirst({
      where: { companyId, boardKey: UNIT_BOARD_PROJECT_BOARD_KEY, columnKey },
      orderBy: { orderRank: "desc" },
    });
    const [card] = await prisma.$transaction(async (transaction) => {
      const card = await transaction.boardCard.create({
        data: {
          companyId,
          boardKey: UNIT_BOARD_PROJECT_BOARD_KEY,
          title: title.slice(0, 420),
          description: readNullableString(body.description),
          createdBy: actor,
          archivedAt: null,
        },
      });
      await transaction.boardItemState.create({
        data: {
          companyId,
          boardKey: UNIT_BOARD_PROJECT_BOARD_KEY,
          entityType: UNIT_BOARD_PROJECT_ENTITY_TYPE,
          entityId: card.id,
          columnKey,
          orderRank: Number(latestState?.orderRank ?? 0) + BOARD_RANK_STEP,
          priority: readPriority(body.priority),
          metadata: readBoardMetadata(body),
        },
      });
      return [card] as const;
    });
    await markCompanySurfaceProjectionDirty(prisma, companyId, UNIT_BOARD_PROJECT_SURFACE_KEY, "surface-action:create");
    return { status: "APPLIED" as const, message: "Project card created.", changedItemIds: [card.id] };
  }

  const itemId = readBoardCardId(body.itemId ?? body.id);
  if (!itemId) {
    return { status: "REJECTED" as const, message: "Project card itemId is required." };
  }
  const existing = await prisma.boardCard.findUnique({ where: { id: itemId } });
  if (!existing || existing.companyId !== companyId || existing.boardKey !== UNIT_BOARD_PROJECT_BOARD_KEY) {
    return { status: "REJECTED" as const, message: "Project card was not found." };
  }

  if (action === "update") {
    const title = body.title !== undefined ? readString(body.title).slice(0, 420) : existing.title;
    if (!title) {
      return { status: "REJECTED" as const, message: "Project card title is required." };
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.boardCard.update({
        where: { id: itemId },
        data: {
          title,
          description: body.description !== undefined ? readNullableString(body.description) : existing.description,
          updatedAt: now,
        },
      });
      await transaction.boardItemState.upsert({
        where: {
          companyId_boardKey_entityType_entityId: {
            companyId,
            boardKey: UNIT_BOARD_PROJECT_BOARD_KEY,
            entityType: UNIT_BOARD_PROJECT_ENTITY_TYPE,
            entityId: itemId,
          },
        },
        create: {
          companyId,
          boardKey: UNIT_BOARD_PROJECT_BOARD_KEY,
          entityType: UNIT_BOARD_PROJECT_ENTITY_TYPE,
          entityId: itemId,
          columnKey: readColumnKey(body.columnKey),
          orderRank: BOARD_RANK_STEP,
          priority: readPriority(body.priority),
          metadata: readBoardMetadata(body),
        },
        update: {
          ...(body.columnKey !== undefined ? { columnKey: readColumnKey(body.columnKey) } : {}),
          ...(body.priority !== undefined ? { priority: readPriority(body.priority) } : {}),
          metadata: readBoardMetadata(body),
        },
      });
    });
    await markCompanySurfaceProjectionDirty(prisma, companyId, UNIT_BOARD_PROJECT_SURFACE_KEY, "surface-action:update");
    return { status: "APPLIED" as const, message: "Project card updated.", changedItemIds: [itemId] };
  }

  if (action === "move") {
    const destinationColumn = readColumnKey(body.destinationColumn ?? body.columnKey);
    const beforeId = readBoardCardId(body.beforeId);
    const afterId = readBoardCardId(body.afterId);
    const neighborIds = [beforeId, afterId].filter((value): value is string => Boolean(value));
    const neighborStates = neighborIds.length
      ? await prisma.boardItemState.findMany({
        where: {
          companyId,
          boardKey: UNIT_BOARD_PROJECT_BOARD_KEY,
          entityType: UNIT_BOARD_PROJECT_ENTITY_TYPE,
          entityId: { in: neighborIds },
        },
      })
      : [];
    const previousRank = neighborStates.find((state) => state.entityId === beforeId)?.orderRank ?? null;
    const nextRank = neighborStates.find((state) => state.entityId === afterId)?.orderRank ?? null;
    const nextOrderRank = computeServerBoardRank(previousRank, nextRank) ?? (Number(previousRank ?? 0) + BOARD_RANK_STEP);
    await prisma.boardItemState.upsert({
      where: {
        companyId_boardKey_entityType_entityId: {
          companyId,
          boardKey: UNIT_BOARD_PROJECT_BOARD_KEY,
          entityType: UNIT_BOARD_PROJECT_ENTITY_TYPE,
          entityId: itemId,
        },
      },
      create: {
        companyId,
        boardKey: UNIT_BOARD_PROJECT_BOARD_KEY,
        entityType: UNIT_BOARD_PROJECT_ENTITY_TYPE,
        entityId: itemId,
        columnKey: destinationColumn,
        orderRank: nextOrderRank,
        priority: readPriority(body.priority),
        metadata: readBoardMetadata(body),
      },
      update: {
        columnKey: destinationColumn,
        orderRank: nextOrderRank,
      },
    });
    await markCompanySurfaceProjectionDirty(prisma, companyId, UNIT_BOARD_PROJECT_SURFACE_KEY, "surface-action:move");
    return { status: "APPLIED" as const, message: "Project card moved.", changedItemIds: [itemId] };
  }

  if (action === "archive") {
    await prisma.boardCard.update({
      where: { id: itemId },
      data: { archivedAt: now, updatedAt: now },
    });
    await markCompanySurfaceProjectionDirty(prisma, companyId, UNIT_BOARD_PROJECT_SURFACE_KEY, "surface-action:archive");
    return { status: "APPLIED" as const, message: "Project card archived.", changedItemIds: [itemId] };
  }

  if (action === "restore") {
    await prisma.boardCard.update({
      where: { id: itemId },
      data: { archivedAt: null, updatedAt: now },
    });
    await markCompanySurfaceProjectionDirty(prisma, companyId, UNIT_BOARD_PROJECT_SURFACE_KEY, "surface-action:restore");
    return { status: "APPLIED" as const, message: "Project card restored.", changedItemIds: [itemId] };
  }

  return {
    status: "REJECTED" as const,
    message: `Unsupported unitBoard.project action: ${action || "(missing)"}`,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; surfaceKey: string }> },
) {
  const { companyId, surfaceKey: rawSurfaceKey } = await params;
  const surfaceKey = decodeURIComponent(rawSurfaceKey || "");
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  if (!surfaceKey) return NextResponse.json({ ok: false, error: "surfaceKey is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });

  const action = readString(body.action);
  const projectionRevision = readString(body.projectionRevision);
  const currentProjection = await getCurrentSurfaceProjection(companyId, surfaceKey);
  const currentRevision = currentProjection.observability.checksum || "";

  if (projectionRevision && currentRevision && projectionRevision !== currentRevision) {
    return NextResponse.json(
      receipt("CONFLICT", "Surface projection changed before this action could be applied.", {
        currentRevision,
        nextProjection: currentProjection,
      }),
      { status: 409 },
    );
  }

  if (action === "refreshProjection") {
    await markCompanySurfaceProjectionDirty(prisma, companyId, surfaceKey, "surface-action:refreshProjection");
    return NextResponse.json(
      receipt("ACCEPTED", "Surface projection refresh was queued for the local snapshot worker.", {
        projectionRevision: currentRevision || null,
      }),
      { status: 202 },
    );
  }

  if (surfaceKey === UNIT_BOARD_PROJECT_SURFACE_KEY) {
    const result = await handleUnitBoardProjectAction(
      companyId,
      action as UnitBoardProjectionAction,
      body,
      auth.membership.id || auth.session.email || "webapp-user",
    );
    if (result.status === "REJECTED") {
      return NextResponse.json(
        receipt("REJECTED", result.message, {
          allowedActions: ["create", "update", "move", "archive", "restore", "refreshProjection"],
        }),
        { status: 400 },
      );
    }
    const nextProjection = await buildUnitBoardProjectReadModel(prisma, companyId);
    return NextResponse.json(
      receipt(result.status, result.message, {
        projectionRevision: nextProjection.observability.checksum,
        previousRevision: currentRevision || null,
        changedItemIds: result.changedItemIds,
        nextProjection,
      }),
    );
  }

  return NextResponse.json(
    receipt("REJECTED", `Unsupported surface action: ${action || "(missing)"}`, {
      allowedActions: ["refreshProjection"],
    }),
    { status: 400 },
  );
}
