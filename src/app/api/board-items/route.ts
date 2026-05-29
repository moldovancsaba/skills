import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { BOARD_RANK_STEP, PROJECT_BOARD_COLUMNS, sortBoardRecords } from "@/lib/board-system";
import { buildNormalizedRanks, compareBoardRank, computeServerBoardRank, needsBoardRebalance } from "@/lib/board-rank";

export const dynamic = "force-dynamic";

const UNIT_PROJECT_BOARD_KEY = "UNIT_PROJECT";

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
  const companyId = request.nextUrl.searchParams.get("companyId");
  const boardKey = request.nextUrl.searchParams.get("boardKey") || UNIT_PROJECT_BOARD_KEY;

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

  if (boardKey !== UNIT_PROJECT_BOARD_KEY) {
    return NextResponse.json({ error: "Unsupported boardKey" }, { status: 400 });
  }

  const [cards, states] = await Promise.all([
    prisma.boardCard.findMany({
      where: { companyId, boardKey, archivedAt: null },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.boardItemState.findMany({
      where: { companyId, boardKey, entityType: "BOARD_CARD" },
      orderBy: { orderRank: "asc" },
    }),
  ]);

  const stateMap = new Map(states.map((state) => [state.entityId, state]));

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

  return NextResponse.json({ items, columns: PROJECT_BOARD_COLUMNS });
}

export async function POST(request: NextRequest) {
  const data = await request.json();
  const companyId = typeof data.companyId === "string" ? data.companyId : "";
  const boardKey = typeof data.boardKey === "string" ? data.boardKey : UNIT_PROJECT_BOARD_KEY;

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  if (!companyId || !String(data.title || "").trim()) {
    return NextResponse.json({ error: "companyId and title are required" }, { status: 400 });
  }

  const actor = auth.membership.id || auth.session.email || "webapp-user";
  const columnKey = typeof data.columnKey === "string" ? data.columnKey : PROJECT_BOARD_COLUMNS[3].key;
  const latestState = await prisma.boardItemState.findFirst({
    where: { companyId, boardKey, columnKey },
    orderBy: { orderRank: "desc" },
  });

  const card = await prisma.boardCard.create({
    data: {
      companyId,
      boardKey,
      title: String(data.title).trim(),
      description: typeof data.description === "string" ? data.description.trim() || null : null,
      createdBy: actor,
    },
  });

  await prisma.boardItemState.create({
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

  return NextResponse.json({ success: true, cardId: card.id });
}

export async function PATCH(request: NextRequest) {
  const data = await request.json();
  const companyId = typeof data.companyId === "string" ? data.companyId : "";
  const boardKey = typeof data.boardKey === "string" ? data.boardKey : UNIT_PROJECT_BOARD_KEY;
  const cardId = typeof data.id === "string" ? data.id : "";

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

    const neighborStates = await prisma.boardItemState.findMany({
      where: {
        companyId,
        boardKey,
        entityType: "BOARD_CARD",
        OR: [
          beforeId ? { entityId: beforeId } : undefined,
          afterId ? { entityId: afterId } : undefined,
        ].filter(Boolean) as Array<Record<string, string>>,
      },
    });

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
    return NextResponse.json(updated);
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

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const companyId = request.nextUrl.searchParams.get("companyId");

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

  return NextResponse.json({ success: true });
}
