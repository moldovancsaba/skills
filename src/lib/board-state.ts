import { prisma } from "@/lib/db";
import { BOARD_RANK_STEP } from "@/lib/board-system";
import { buildNormalizedRanks, computeServerBoardRank, needsBoardRebalance } from "@/lib/board-rank";

export type SurfaceBoardConfig = {
  boardKey: string;
  entityType: string;
  defaultColumnKey: string;
};

export const SURFACE_BOARD_CONFIG = {
  unitBoard: {
    boardKey: "UNIT_PROJECT",
    entityType: "BOARD_CARD",
    defaultColumnKey: "TODO",
  },
  goals: {
    boardKey: "GOALS_STATUS",
    entityType: "GOALCARD",
    defaultColumnKey: "ROADMAP",
  },
  topics: {
    boardKey: "TOPICS_STATUS",
    entityType: "TOPIC",
    defaultColumnKey: "BACKLOG",
  },
  data: {
    boardKey: "DATA_STATUS",
    entityType: "SOURCE",
    defaultColumnKey: "BACKLOG",
  },
  pipeline: {
    boardKey: "PIPELINE_STATUS",
    entityType: "PIPELINE_JOB",
    defaultColumnKey: "LATER",
  },
} as const satisfies Record<string, SurfaceBoardConfig>;

export type DecoratedBoardState = {
  boardKey: string;
  entityType: string;
  columnKey: string;
  orderRank: number;
  priority: number;
};

export async function getBoardStateMap(
  companyId: string,
  config: SurfaceBoardConfig,
  entityIds: string[],
) {
  if (entityIds.length === 0) {
    return new Map<string, DecoratedBoardState>();
  }

  const states = await prisma.boardItemState.findMany({
    where: {
      companyId,
      boardKey: config.boardKey,
      entityType: config.entityType,
      entityId: { in: entityIds },
    },
  });

  return new Map(
    states.map((state) => [
      state.entityId,
      {
        boardKey: state.boardKey,
        entityType: state.entityType,
        columnKey: state.columnKey,
        orderRank: Number(state.orderRank ?? 0),
        priority: Number(state.priority ?? 0),
      },
    ]),
  );
}

export async function decorateWithBoardState<T extends { id: string }>(
  companyId: string,
  config: SurfaceBoardConfig,
  records: T[],
) {
  const map = await getBoardStateMap(companyId, config, records.map((record) => record.id));
  return records.map((record, index) => ({
    ...record,
    boardState: map.get(record.id) ?? {
      boardKey: config.boardKey,
      entityType: config.entityType,
      columnKey: config.defaultColumnKey,
      orderRank: (index + 1) * BOARD_RANK_STEP,
      priority: 0,
    },
  }));
}

export async function ensureBoardEntityRanks(companyId: string, config: SurfaceBoardConfig, columnKey: string) {
  const states = await prisma.boardItemState.findMany({
    where: {
      companyId,
      boardKey: config.boardKey,
      entityType: config.entityType,
      columnKey,
    },
    orderBy: { orderRank: "asc" },
  });
  if (states.length <= 1) return;

  for (let index = 1; index < states.length; index += 1) {
    if (needsBoardRebalance(states[index - 1]?.orderRank, states[index]?.orderRank)) {
      const normalized = buildNormalizedRanks(states);
      await prisma.$transaction(normalized.map((entry) =>
        prisma.boardItemState.update({
          where: { id: entry.id },
          data: { orderRank: entry.rank },
        }),
      ));
      return;
    }
  }
}

export async function updateBoardEntityState(input: {
  companyId: string;
  config: SurfaceBoardConfig;
  entityId: string;
  destinationColumn: string;
  beforeId?: string | null;
  afterId?: string | null;
  priority?: number;
}) {
  const { companyId, config, entityId, destinationColumn, beforeId = null, afterId = null, priority } = input;

  await ensureBoardEntityRanks(companyId, config, destinationColumn);

  const neighborIds = [beforeId, afterId].filter((value): value is string => Boolean(value));
  const neighbors = neighborIds.length
    ? await prisma.boardItemState.findMany({
        where: {
          companyId,
          boardKey: config.boardKey,
          entityType: config.entityType,
          entityId: { in: neighborIds },
        },
      })
    : [];

  const previousRank = neighbors.find((entry) => entry.entityId === beforeId)?.orderRank ?? null;
  const nextRank = neighbors.find((entry) => entry.entityId === afterId)?.orderRank ?? null;
  const orderRank = computeServerBoardRank(previousRank, nextRank)
    ?? (Number(previousRank ?? 0) + BOARD_RANK_STEP);

  return prisma.boardItemState.upsert({
    where: {
      companyId_boardKey_entityType_entityId: {
        companyId,
        boardKey: config.boardKey,
        entityType: config.entityType,
        entityId,
      },
    },
    update: {
      columnKey: destinationColumn,
      orderRank,
      ...(priority !== undefined ? { priority } : {}),
    },
    create: {
      companyId,
      boardKey: config.boardKey,
      entityType: config.entityType,
      entityId,
      columnKey: destinationColumn,
      orderRank,
      priority: Number(priority ?? 0),
    },
  });
}

export async function getBoardHealthSummary(companyId: string) {
  const states = await prisma.boardItemState.findMany({
    where: { companyId },
    orderBy: [
      { boardKey: "asc" },
      { columnKey: "asc" },
      { orderRank: "asc" },
    ],
  });

  const boardCounts = new Map<string, number>();
  let tightGapCount = 0;
  let duplicatedRankCount = 0;

  const grouped = new Map<string, Array<{ orderRank: number }>>();
  for (const state of states) {
    boardCounts.set(state.boardKey, Number(boardCounts.get(state.boardKey) ?? 0) + 1);
    const key = `${state.boardKey}:${state.columnKey}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push({ orderRank: Number(state.orderRank ?? 0) });
    grouped.set(key, bucket);
  }

  for (const bucket of grouped.values()) {
    for (let index = 1; index < bucket.length; index += 1) {
      const previousRank = bucket[index - 1]?.orderRank ?? 0;
      const nextRank = bucket[index]?.orderRank ?? 0;
      if (nextRank === previousRank) duplicatedRankCount += 1;
      if (needsBoardRebalance(previousRank, nextRank)) tightGapCount += 1;
    }
  }

  return {
    totalStates: states.length,
    boardCounts: Object.fromEntries(boardCounts.entries()),
    tightGapCount,
    duplicatedRankCount,
  };
}
