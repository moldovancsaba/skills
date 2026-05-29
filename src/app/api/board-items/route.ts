import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { BOARD_RANK_STEP, PROJECT_BOARD_COLUMNS, sortBoardRecords } from "@/lib/board-system";
import { buildNormalizedRanks, computeServerBoardRank, needsBoardRebalance } from "@/lib/board-rank";
import { classifyPersistenceFailure } from "@/lib/persistence-failures";

export const dynamic = "force-dynamic";

const UNIT_PROJECT_BOARD_KEY = "UNIT_PROJECT";

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
} | null, boardKey: string, fallbackIndex = 0) {
  return {
    id: card.id,
    entityType: "BOARD_CARD" as const,
    boardKey,
    title: card.title,
    description: card.description,
    createdBy: card.createdBy,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    columnKey: state?.columnKey ?? PROJECT_BOARD_COLUMNS[0].key,
    orderRank: Number(state?.orderRank ?? (fallbackIndex + 1) * BOARD_RANK_STEP),
    priority: Number(state?.priority ?? 0),
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
    const companyId = request.nextUrl.searchParams.get("companyId");
    const boardKey = request.nextUrl.searchParams.get("boardKey") || UNIT_PROJECT_BOARD_KEY;
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);
    const startedAt = Date.now();

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

    if (boardKey !== UNIT_PROJECT_BOARD_KEY) {
      return NextResponse.json({ error: "Unsupported boardKey" }, { status: 400 });
    }

    const [allCards, states] = await Promise.all([
      prisma.boardCard.findMany({
        where: { companyId, boardKey },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.boardItemState.findMany({
        where: { companyId, boardKey, entityType: "BOARD_CARD" },
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
      return {
        id: card.id,
        entityType: "BOARD_CARD",
        boardKey,
        title: card.title,
        description: card.description,
        createdBy: card.createdBy,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        columnKey: state?.columnKey ?? PROJECT_BOARD_COLUMNS[3].key,
        orderRank: Number(state?.orderRank ?? (index + 1) * BOARD_RANK_STEP),
        priority: Number(state?.priority ?? 0),
      };
    }));

    if (debugTrace) {
      const activeCardCount = cards.length;
      const mismatchCount = allCards.length - activeCardCount;
      const withStateCount = items.length;
      console.info(`[API:BOARD_ITEMS][${traceId}] GET`, {
        companyId,
        boardKey,
        durationMs: Date.now() - startedAt,
        requested: allCards.length,
        active: activeCardCount,
        withState: withStateCount,
        mismatchedArchived: mismatchCount,
        stateRows: states.length,
      });
    }

    const response = NextResponse.json({
      items,
      columns: PROJECT_BOARD_COLUMNS,
      traceId,
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
    const data = await request.json();
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    const boardKey = typeof data.boardKey === "string" ? data.boardKey : UNIT_PROJECT_BOARD_KEY;
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);
    const startedAt = Date.now();

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId || !String(data.title || "").trim()) {
      return NextResponse.json({ error: "companyId and title are required" }, { status: 400 });
    }

    const actor = auth.membership.id || auth.session.email || "webapp-user";
    const columnKey = typeof data.columnKey === "string" ? data.columnKey : PROJECT_BOARD_COLUMNS[3].key;
    const [card, state] = await prisma.$transaction(async (transaction) => {
      const latestState = await transaction.boardItemState.findFirst({
        where: { companyId, boardKey, columnKey },
        orderBy: { orderRank: "desc" },
      });

      const card = await transaction.boardCard.create({
        data: {
          companyId,
          boardKey,
          title: String(data.title).trim(),
          description: typeof data.description === "string" ? data.description.trim() || null : null,
          createdBy: actor,
          archivedAt: null,
        },
      });

      const state = await transaction.boardItemState.create({
        data: {
          companyId,
          boardKey,
          entityType: "BOARD_CARD",
          entityId: card.id,
          columnKey,
          orderRank: Number(latestState?.orderRank ?? 0) + BOARD_RANK_STEP,
          priority: Number(data.priority ?? 0),
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
      item: serializeBoardItem(card, state, boardKey),
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
    const data = await request.json();
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    const boardKey = typeof data.boardKey === "string" ? data.boardKey : UNIT_PROJECT_BOARD_KEY;
    const cardId = typeof data.id === "string" ? data.id : "";
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId || !cardId) {
      return NextResponse.json({ error: "companyId and id are required" }, { status: 400 });
    }

    const existing = await prisma.boardCard.findUnique({ where: { id: cardId } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isMove = typeof data.destinationColumn === "string";
    if (isMove) {
      const destinationColumn = String(data.destinationColumn);
      const beforeId = typeof data.beforeId === "string" ? data.beforeId : null;
      const afterId = typeof data.afterId === "string" ? data.afterId : null;

      await ensureBoardRanks(companyId, boardKey, destinationColumn);

      const neighborIds = [beforeId, afterId].filter((value): value is string => Boolean(value));
      const neighborStates = neighborIds.length
        ? await prisma.boardItemState.findMany({
            where: {
              companyId,
              boardKey,
              entityType: "BOARD_CARD",
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
            entityType: "BOARD_CARD",
            entityId: cardId,
          },
        },
        update: {
          columnKey: destinationColumn,
          orderRank: nextOrderRank,
        },
        create: {
          companyId,
          boardKey,
          entityType: "BOARD_CARD",
          entityId: cardId,
          columnKey: destinationColumn,
          orderRank: nextOrderRank,
        },
      });

      const updated = await prisma.boardItemState.findUnique({
        where: {
          companyId_boardKey_entityType_entityId: {
            companyId,
            boardKey,
            entityType: "BOARD_CARD",
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
        title: data.title !== undefined ? String(data.title).trim() : existing.title,
        description: data.description !== undefined
          ? (typeof data.description === "string" ? data.description.trim() || null : null)
          : existing.description,
      },
    });

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
    const id = request.nextUrl.searchParams.get("id");
    const companyId = request.nextUrl.searchParams.get("companyId");
    const traceId = getBoardTraceId(request);
    const debugTrace = shouldTraceBoardItems(request);

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!companyId || !id) {
      return NextResponse.json({ error: "companyId and id are required" }, { status: 400 });
    }

    const existing = await prisma.boardCard.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
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
