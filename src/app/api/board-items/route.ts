import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { BOARD_RANK_STEP, PROJECT_BOARD_COLUMNS, sortBoardRecords } from "@/lib/board-system";
import { buildNormalizedRanks, computeServerBoardRank, needsBoardRebalance } from "@/lib/board-rank";
import { classifyPersistenceFailure } from "@/lib/persistence-failures";
import {
  buildBoardAdapterTelemetry,
  resolveBoardAdapter,
  type ResolvedBoardAdapter,
} from "@/lib/board-adapters";

export const dynamic = "force-dynamic";

const MAX_TITLE_LENGTH = 420;

type BoardCardMetadata = {
  assignee: string | null;
  dueDate: string | null;
  estimatedEffort: number | null;
  sourceType: string | null;
  sourceId: string | null;
  notes: string | null;
};

type BoardItemsPayload = Record<string, unknown>;

function normalizeBoardColumnKey(adapter: ResolvedBoardAdapter, raw: unknown): string {
  const boardColumnKeys = new Set(adapter.columns.map((column) => column.key));
  if (typeof raw === "string" && boardColumnKeys.has(raw)) {
    return raw;
  }
  // Invalid or missing columns fall back to the first configured column for this surface.
  return adapter.columns[0]?.key ?? PROJECT_BOARD_COLUMNS[0].key;
}

function normalizeTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCardTitle(value: unknown): string | null {
  const normalized = normalizeTrimmedString(value);
  if (normalized == null) return null;
  return normalized.slice(0, MAX_TITLE_LENGTH);
}

function normalizeBoardCardId(value: unknown): string | null {
  const normalized = normalizeTrimmedString(value);
  if (!normalized) return null;
  if (normalized.length > 64) return null;
  return normalized;
}

function parseBoardItemsPayload(request: NextRequest) {
  return request.json()
    .then((payload: unknown) => (typeof payload === "object" && payload !== null ? payload as BoardItemsPayload : null))
    .catch(() => null);
}

function readCompanyId(request: NextRequest, payload: BoardItemsPayload | null) {
  const fromBody = normalizeTrimmedString(payload?.companyId);
  if (fromBody) return fromBody;
  const fromQuery = normalizeTrimmedString(request.nextUrl.searchParams.get("companyId"));
  return fromQuery ?? "";
}

function readBoardSurfaceRequest(request: NextRequest, payload: BoardItemsPayload | null) {
  return {
    boardKey: normalizeTrimmedString(payload?.boardKey),
    boardKeyFromQuery: normalizeTrimmedString(request.nextUrl.searchParams.get("boardKey")),
    module: normalizeTrimmedString(payload?.module),
    moduleFromQuery: normalizeTrimmedString(request.nextUrl.searchParams.get("module")),
  };
}

function resolveAdapter(request: NextRequest, payload: BoardItemsPayload | null) {
  const boardSurfaceRequest = readBoardSurfaceRequest(request, payload);
  return resolveBoardAdapter({
    boardKey: boardSurfaceRequest.boardKey ?? boardSurfaceRequest.boardKeyFromQuery,
    module: boardSurfaceRequest.module ?? boardSurfaceRequest.moduleFromQuery,
  });
}

function buildRequestErrorPayload(message: string, details: unknown, traceId: string) {
  const detail = normalizeTrimmedString(details);
  const response = NextResponse.json({
    error: message,
    detail: detail ?? null,
    traceId,
  }, { status: 400 });
  return response;
}

function isMutationPayload(payload: BoardItemsPayload | null): payload is Record<string, unknown> {
  return payload !== null;
}

function hasField(payload: BoardItemsPayload, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function normalizeBoardDueDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeBoardEffort(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.round(parsed));
  }
  return null;
}

function normalizeBoardPriority(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(3, Math.round(parsed)));
}

function extractMetadata(input: Record<string, unknown>): BoardCardMetadata {
  return {
    assignee: normalizeTrimmedString(input.assignee),
    dueDate: input.dueDate ? normalizeBoardDueDate(input.dueDate) : null,
    estimatedEffort: normalizeBoardEffort(input.estimatedEffort),
    sourceType: normalizeTrimmedString(input.sourceType),
    sourceId: normalizeTrimmedString(input.sourceId),
    notes: normalizeTrimmedString(input.notes),
  };
}

function normalizeMetadata(value: unknown): BoardCardMetadata {
  if (typeof value === "object" && value !== null) {
    return extractMetadata(value as Record<string, unknown>);
  }
  return {
    assignee: null,
    dueDate: null,
    estimatedEffort: null,
    sourceType: null,
    sourceId: null,
    notes: null,
  };
}

function getBoardTraceId(request: NextRequest) {
  const headerTraceId = request.headers.get("x-board-items-trace-id");
  if (headerTraceId) return headerTraceId;
  const queryTraceId = request.nextUrl.searchParams.get("traceId");
  if (queryTraceId) return queryTraceId;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shouldTraceBoardItems(request: NextRequest) {
  return process.env.BOARD_ITEMS_TRACE === "1"
    || request.headers.get("x-board-items-debug") === "1"
    || request.nextUrl.searchParams.get("debug") === "1";
}

function withBoardTrace(response: NextResponse, traceId: string, debugEnabled: boolean) {
  response.headers.set("X-Board-Trace-Id", traceId);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  if (debugEnabled) {
    response.headers.set("X-Board-Items-Debug", "1");
  }
}

function serializeBoardItem(card: {
  id: string;
  title: string;
  description: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}, state: {
  columnKey: string;
  orderRank: number;
  priority: number;
  metadata?: unknown;
} | null, boardKey: string, fallbackIndex = 0, fallbackColumnKey = PROJECT_BOARD_COLUMNS[0].key) {
  const metadata = normalizeMetadata(state?.metadata ?? null);
  return {
    id: card.id,
    entityType: "BOARD_CARD" as const,
    boardKey,
    title: card.title,
    description: card.description,
    createdBy: card.createdBy,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    // Use explicit state if present; otherwise return the fallback column from the current board surface.
    columnKey: state?.columnKey ?? fallbackColumnKey,
    orderRank: Number(state?.orderRank ?? (fallbackIndex + 1) * BOARD_RANK_STEP),
    priority: Number(state?.priority ?? 0),
    assignee: metadata.assignee,
    dueDate: metadata.dueDate,
    estimatedEffort: metadata.estimatedEffort,
    sourceType: metadata.sourceType,
    sourceId: metadata.sourceId,
    notes: metadata.notes,
  };
}

function handleBoardItemsError(error: unknown, operation: string, traceId: string, debugEnabled: boolean) {
  const persistenceFailure = classifyPersistenceFailure(error);
  if (persistenceFailure) {
    const response = NextResponse.json({
      error: persistenceFailure.summary,
      detail: persistenceFailure.details,
      reasonCode: persistenceFailure.reasonCode,
      retryable: persistenceFailure.retryable,
      retryAfterMs: persistenceFailure.retryAfterMs,
      traceId,
    }, { status: persistenceFailure.status });
    response.headers.set("Retry-After", String(Math.ceil(persistenceFailure.retryAfterMs / 1000)));
    withBoardTrace(response, traceId, debugEnabled);
    return response;
  }

  if (process.env.BOARD_ITEMS_TRACE === "1") {
    console.error(`[API:BOARD_ITEMS][${traceId}] ${operation} failure:`, error);
  } else {
    console.error(`[API:BOARD_ITEMS] ${operation} failure`);
  }
  const response = NextResponse.json({ error: "Board operation failed", traceId }, { status: 500 });
  withBoardTrace(response, traceId, debugEnabled);
  return response;
}

async function ensureBoardRanks(companyId: string, boardKey: string, columnKey: string) {
  const states = await prisma.boardItemState.findMany({
    where: { companyId, boardKey, columnKey },
    orderBy: { orderRank: "asc" },
  });
  if (states.length <= 1) return;

  let requiresNormalization = false;
  for (let index = 1; index < states.length; index += 1) {
    if (needsBoardRebalance(states[index - 1]?.orderRank, states[index]?.orderRank)) {
      requiresNormalization = true;
      break;
    }
  }
  if (!requiresNormalization) return;

  const normalized = buildNormalizedRanks(states);
  await prisma.$transaction(
    normalized.map((entry) =>
      prisma.boardItemState.update({
        where: { id: entry.id },
        data: { orderRank: entry.rank },
      }),
    ),
  );
}

export async function GET(request: NextRequest) {
  try {
    const adapter = resolveAdapter(request, null);
    const companyId = request.nextUrl.searchParams.get("companyId");
    const boardKey = adapter.boardKey;
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);
    const startedAt = Date.now();

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

    const [allCards, states] = await Promise.all([
      prisma.boardCard.findMany({
        where: { companyId, boardKey },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.boardItemState.findMany({
        where: { companyId, boardKey, entityType: adapter.config.entityType },
        orderBy: { orderRank: "asc" },
      }),
    ]);

    const cards = allCards.filter((card) => card.archivedAt == null);
    const cardIdSet = new Set(cards.map((card) => card.id));
    const stateMap = new Map(
      states
        .filter((state) => cardIdSet.has(state.entityId))
        .map((state) => [state.entityId, state]),
    );

    const items = sortBoardRecords(cards.map((card, index) => {
      const state = stateMap.get(card.id);
      return serializeBoardItem(card, state ?? null, boardKey, index, adapter.columns[0]?.key);
    }));

    if (debugTrace) {
      const activeCardCount = cards.length;
      const mismatchCount = allCards.length - activeCardCount;
      const withStateCount = items.length;
      const adapterTelemetry = buildBoardAdapterTelemetry(adapter, { companyId });
      console.info(`[API:BOARD_ITEMS][${traceId}] GET`, {
        companyId,
        boardKey,
        adapter: adapterTelemetry,
        durationMs: Date.now() - startedAt,
        requested: allCards.length,
        active: activeCardCount,
        withState: withStateCount,
        mismatchedArchived: mismatchCount,
        stateRows: states.length,
      });
    }

    if (adapter.diagnostics.warnings.length) {
      console.warn("[API:BOARD_ITEMS] adapter fallback", buildBoardAdapterTelemetry(adapter, { companyId }));
    }

    const response = NextResponse.json({
      items,
      columns: adapter.columns,
      traceId,
      adapter: {
        surface: adapter.surface,
        module: adapter.module,
        boardKey: adapter.boardKey,
        entityType: adapter.config.entityType,
        allowWrite: adapter.allowWrite,
        resolvedBy: adapter.resolvedBy,
        diagnostics: adapter.diagnostics,
      },
    });
    withBoardTrace(response, traceId, debugTrace);
    return response;
  } catch (error) {
    const traceId = getBoardTraceId(request);
    return handleBoardItemsError(error, "GET", traceId, shouldTraceBoardItems(request));
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await parseBoardItemsPayload(request);
    if (!isMutationPayload(payload)) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const adapter = resolveAdapter(request, payload);

    const companyId = readCompanyId(request, payload);
    const boardKey = adapter.boardKey;
    const columnKey = normalizeBoardColumnKey(adapter, payload.columnKey);
    const metadata = extractMetadata(payload);
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);
    const startedAt = Date.now();
    const title = normalizeCardTitle(payload.title);

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId || !title) {
      return NextResponse.json({ error: "companyId and title are required" }, { status: 400 });
    }
    if (!adapter.allowWrite) {
      return buildRequestErrorPayload("Board writes are disabled for this surface", adapter.diagnostics, traceId);
    }

    const actor = auth.membership.id || auth.session.email || "webapp-user";
    const [card, state] = await prisma.$transaction(async (transaction) => {
      const latestState = await transaction.boardItemState.findFirst({
        where: { companyId, boardKey, columnKey },
        orderBy: { orderRank: "desc" },
      });

      const card = await transaction.boardCard.create({
        data: {
          companyId,
          boardKey,
          title,
          description: typeof payload.description === "string" ? payload.description.trim() || null : null,
          createdBy: actor,
          archivedAt: null,
        },
      });

      const state = await transaction.boardItemState.create({
        data: {
          companyId,
          boardKey,
          entityType: adapter.config.entityType,
          entityId: card.id,
          columnKey,
          orderRank: Number(latestState?.orderRank ?? 0) + BOARD_RANK_STEP,
          priority: normalizeBoardPriority(payload.priority) ?? 1,
          metadata,
        },
      });

      return [card, state] as const;
    });

    if (debugTrace) {
      console.info(`[API:BOARD_ITEMS][${traceId}] POST`, {
        companyId,
        boardKey,
        cardId: card.id,
        stateId: state.id,
        columnKey: state.columnKey,
        orderRank: state.orderRank,
        durationMs: Date.now() - startedAt,
      });
    }

    const response = NextResponse.json({
      success: true,
      cardId: card.id,
      item: serializeBoardItem(card, state, boardKey, 0, adapter.columns[0]?.key),
      traceId,
    });
    withBoardTrace(response, traceId, debugTrace);
    return response;
  } catch (error) {
    const traceId = getBoardTraceId(request);
    return handleBoardItemsError(error, "POST", traceId, shouldTraceBoardItems(request));
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await parseBoardItemsPayload(request);
    if (!isMutationPayload(payload)) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
    const adapter = resolveAdapter(request, payload);

    const companyId = readCompanyId(request, payload);
    const boardKey = adapter.boardKey;
    const cardId = normalizeBoardCardId(payload.id);
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);
    if (!adapter.allowWrite) {
      return buildRequestErrorPayload("Board writes are disabled for this surface", adapter.diagnostics, traceId);
    }
    const requestedPriority = normalizeBoardPriority(payload.priority);
    const requestedMetadata = extractMetadata(payload);
    const metadataProvided = ["assignee", "dueDate", "estimatedEffort", "sourceType", "sourceId", "notes"].some(
      (key) => hasField(payload, key),
    );

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId || !cardId) {
      return NextResponse.json({ error: "companyId and id are required" }, { status: 400 });
    }

    const existing = await prisma.boardCard.findUnique({ where: { id: cardId } });
    if (!existing || existing.companyId !== companyId || existing.boardKey !== boardKey) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isMove = typeof payload.destinationColumn === "string";
    if (isMove) {
      const destinationColumn = normalizeBoardColumnKey(adapter, payload.destinationColumn);
      const beforeId = normalizeBoardCardId(payload.beforeId);
      const afterId = normalizeBoardCardId(payload.afterId);

      await ensureBoardRanks(companyId, boardKey, destinationColumn);

      const neighborIds = [beforeId, afterId].filter((value): value is string => Boolean(value));
      const neighborStates = neighborIds.length
        ? await prisma.boardItemState.findMany({
            where: {
              companyId,
              boardKey,
              entityType: adapter.config.entityType,
              entityId: { in: neighborIds },
            },
          })
        : [];

      const previousRank = neighborStates.find((state) => state.entityId === beforeId)?.orderRank ?? null;
      const nextRank = neighborStates.find((state) => state.entityId === afterId)?.orderRank ?? null;
      const nextOrderRank = computeServerBoardRank(previousRank, nextRank)
        ?? (Number(previousRank ?? 0) + BOARD_RANK_STEP);

      await prisma.boardItemState.upsert({
        where: {
          companyId_boardKey_entityType_entityId: {
            companyId,
            boardKey,
            entityType: adapter.config.entityType,
            entityId: cardId,
          },
        },
        update: {
          columnKey: destinationColumn,
          orderRank: nextOrderRank,
          ...(requestedPriority !== null ? { priority: requestedPriority } : {}),
          ...(metadataProvided ? { metadata: requestedMetadata } : {}),
        },
        create: {
          companyId,
          boardKey,
          entityType: adapter.config.entityType,
          entityId: cardId,
          columnKey: destinationColumn,
          orderRank: nextOrderRank,
          priority: requestedPriority ?? 1,
          metadata: requestedMetadata,
        },
      });

      const updated = await prisma.boardItemState.findUnique({
        where: {
          companyId_boardKey_entityType_entityId: {
            companyId,
            boardKey,
            entityType: adapter.config.entityType,
            entityId: cardId,
          },
        },
      });
      const response = NextResponse.json(updated);
      withBoardTrace(response, traceId, debugTrace);
      return response;
    }

    const updated = await prisma.boardCard.update({
      where: { id: cardId },
      data: {
        title: payload.title !== undefined ? normalizeCardTitle(payload.title) ?? existing.title : existing.title,
        description: payload.description !== undefined
          ? (typeof payload.description === "string" ? payload.description.trim() || null : null)
          : existing.description,
      },
    });

    if (metadataProvided || requestedPriority !== null) {
      const currentState = await prisma.boardItemState.findUnique({
        where: {
          companyId_boardKey_entityType_entityId: {
            companyId,
            boardKey,
            entityType: adapter.config.entityType,
            entityId: cardId,
          },
        },
      });
      const currentMetadata = normalizeMetadata(currentState?.metadata ?? null);
      const mergedMetadata = {
        assignee: hasField(payload, "assignee")
          ? requestedMetadata.assignee
          : currentMetadata.assignee,
        dueDate: hasField(payload, "dueDate")
          ? requestedMetadata.dueDate
          : currentMetadata.dueDate,
        estimatedEffort: hasField(payload, "estimatedEffort")
          ? requestedMetadata.estimatedEffort
          : currentMetadata.estimatedEffort,
        sourceType: hasField(payload, "sourceType")
          ? requestedMetadata.sourceType
          : currentMetadata.sourceType,
        sourceId: hasField(payload, "sourceId")
          ? requestedMetadata.sourceId
          : currentMetadata.sourceId,
        notes: hasField(payload, "notes")
          ? requestedMetadata.notes
          : currentMetadata.notes,
      };

      if (currentState) {
        await prisma.boardItemState.update({
          where: {
            companyId_boardKey_entityType_entityId: {
              companyId,
              boardKey,
              entityType: adapter.config.entityType,
              entityId: cardId,
            },
          },
          data: {
            ...(requestedPriority !== null ? { priority: requestedPriority } : {}),
            metadata: mergedMetadata,
          },
        });
      } else {
        await prisma.boardItemState.create({
          data: {
            companyId,
            boardKey,
            entityType: adapter.config.entityType,
            entityId: cardId,
            // New metadata-only state rows should use the same column fallback as normal card writes.
            columnKey: adapter.columns[0]?.key ?? PROJECT_BOARD_COLUMNS[0].key,
            orderRank: BOARD_RANK_STEP,
            priority: requestedPriority ?? 1,
            metadata: mergedMetadata,
          },
        });
      }
    }

    const response = NextResponse.json(updated);
    withBoardTrace(response, traceId, debugTrace);
    return response;
  } catch (error) {
    const traceId = getBoardTraceId(request);
    return handleBoardItemsError(error, "PATCH", traceId, shouldTraceBoardItems(request));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adapter = resolveAdapter(request, null);
    const id = request.nextUrl.searchParams.get("id");
    const companyId = request.nextUrl.searchParams.get("companyId");
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);
    const boardKey = adapter.boardKey;

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId || !id) {
      return NextResponse.json({ error: "companyId and id are required" }, { status: 400 });
    }
    if (!adapter.allowWrite) {
      return buildRequestErrorPayload("Board writes are disabled for this surface", adapter.diagnostics, traceId);
    }

    const existing = await prisma.boardCard.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId || existing.boardKey !== boardKey) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.boardCard.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    const response = NextResponse.json({ success: true, traceId });
    withBoardTrace(response, traceId, debugTrace);
    return response;
  } catch (error) {
    const traceId = getBoardTraceId(request);
    return handleBoardItemsError(error, "DELETE", traceId, shouldTraceBoardItems(request));
  }
}
