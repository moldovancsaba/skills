import { BOARD_RANK_STEP, BOARD_REBALANCE_MIN_GAP, computeRankBetween } from "@/lib/board-system";

export function compareBoardRank(
  left: { sortOrder?: number | null; orderRank?: number | null; id: string },
  right: { sortOrder?: number | null; orderRank?: number | null; id: string },
) {
  const leftRank = Number(left.orderRank ?? left.sortOrder ?? 0);
  const rightRank = Number(right.orderRank ?? right.sortOrder ?? 0);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.id.localeCompare(right.id);
}

export function computeServerBoardRank(
  previousRank?: number | null,
  nextRank?: number | null,
) {
  return computeRankBetween(previousRank, nextRank);
}

export function buildNormalizedRanks<T extends { id: string }>(items: T[]) {
  return items.map((item, index) => ({
    id: item.id,
    rank: (index + 1) * BOARD_RANK_STEP,
  }));
}

export function needsBoardRebalance(previousRank?: number | null, nextRank?: number | null) {
  if (previousRank == null || nextRank == null) return false;
  return Math.abs(Number(nextRank) - Number(previousRank)) <= BOARD_REBALANCE_MIN_GAP;
}
