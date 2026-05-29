import type { ModuleTone } from "@/lib/semantic-theme";

export type BoardColumn = {
  key: string;
  label: string;
  description: string;
  tone: ModuleTone;
};

export type BoardCardRecord = {
  id: string;
  columnKey: string;
  orderRank: number;
};

export type BoardMoveRequest = {
  itemId: string;
  sourceColumn: string;
  destinationColumn: string;
  beforeId: string | null;
  afterId: string | null;
};

export const BOARD_RANK_STEP = 1024;
export const BOARD_REBALANCE_MIN_GAP = 0.0001;

export const CHECKLIST_BOARD_COLUMNS: BoardColumn[] = [
  { key: "IDEABANK", label: "Idea Bank", description: "Someday", tone: "neutral" },
  { key: "ROADMAP", label: "Roadmap", description: "Later", tone: "strategy" },
  { key: "BACKLOG", label: "Backlog", description: "Sooner", tone: "ingress" },
  { key: "TODO", label: "Next", description: "Soon", tone: "tactical" },
  { key: "CHECKLIST", label: "Now", description: "Active delivery", tone: "checklist" },
];

export const PROJECT_BOARD_COLUMNS: BoardColumn[] = [
  { key: "IDEABANK", label: "Idea Bank", description: "Someday", tone: "neutral" },
  { key: "ROADMAP", label: "Roadmap", description: "Later", tone: "strategy" },
  { key: "BACKLOG", label: "Backlog", description: "Sooner", tone: "ingress" },
  { key: "TODO", label: "Todo", description: "Next", tone: "tactical" },
  { key: "IN_PROGRESS", label: "In Progress", description: "Now", tone: "checklist" },
  { key: "REVIEW", label: "Review", description: "Almost", tone: "review" },
  { key: "DONE", label: "Done", description: "Shipped", tone: "knowmore" },
];

export function sortBoardRecords<T extends BoardCardRecord>(items: T[]) {
  return [...items].sort((left, right) => {
    const rankDelta = Number(left.orderRank || 0) - Number(right.orderRank || 0);
    if (rankDelta !== 0) return rankDelta;
    return left.id.localeCompare(right.id);
  });
}

export function computeRankBetween(previousRank?: number | null, nextRank?: number | null) {
  if (previousRank == null && nextRank == null) return BOARD_RANK_STEP;
  if (previousRank == null) return Number(nextRank) - BOARD_RANK_STEP;
  if (nextRank == null) return Number(previousRank) + BOARD_RANK_STEP;

  const gap = Number(nextRank) - Number(previousRank);
  if (!Number.isFinite(gap) || gap <= BOARD_REBALANCE_MIN_GAP) {
    return null;
  }
  return Number(previousRank) + gap / 2;
}

export function normalizeRanks<T extends BoardCardRecord>(items: T[]) {
  return sortBoardRecords(items).map((item, index) => ({
    ...item,
    orderRank: (index + 1) * BOARD_RANK_STEP,
  }));
}

export function moveBoardItem<T extends BoardCardRecord>(
  items: T[],
  itemId: string,
  destinationColumn: string,
  destinationIndex: number,
) {
  const existing = items.find((item) => item.id === itemId);
  if (!existing) return items;

  const withoutItem = items.filter((item) => item.id !== itemId);
  const destinationItems = sortBoardRecords(
    withoutItem.filter((item) => item.columnKey === destinationColumn),
  );
  const boundedIndex = Math.max(0, Math.min(destinationIndex, destinationItems.length));
  const beforeItem = boundedIndex > 0 ? destinationItems[boundedIndex - 1] : null;
  const afterItem = destinationItems[boundedIndex] ?? null;
  const nextRank = computeRankBetween(beforeItem?.orderRank, afterItem?.orderRank)
    ?? ((boundedIndex + 1) * BOARD_RANK_STEP);

  return [...withoutItem, {
    ...existing,
    columnKey: destinationColumn,
    orderRank: nextRank,
  }];
}

export function buildBoardMoveRequest<T extends BoardCardRecord>(
  items: T[],
  itemId: string,
): BoardMoveRequest | null {
  const moved = items.find((item) => item.id === itemId);
  if (!moved) return null;

  const orderedColumnItems = sortBoardRecords(
    items.filter((item) => item.columnKey === moved.columnKey),
  );
  const index = orderedColumnItems.findIndex((item) => item.id === itemId);
  if (index === -1) return null;

  return {
    itemId,
    sourceColumn: "",
    destinationColumn: moved.columnKey,
    beforeId: index > 0 ? orderedColumnItems[index - 1].id : null,
    afterId: orderedColumnItems[index + 1]?.id ?? null,
  };
}
