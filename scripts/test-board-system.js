const assert = require("node:assert/strict");

const BOARD_RANK_STEP = 1024;
const BOARD_REBALANCE_MIN_GAP = 0.0001;

function computeRankBetween(previousRank, nextRank) {
  if (previousRank == null && nextRank == null) return BOARD_RANK_STEP;
  if (previousRank == null) return Number(nextRank) - BOARD_RANK_STEP;
  if (nextRank == null) return Number(previousRank) + BOARD_RANK_STEP;
  const gap = Number(nextRank) - Number(previousRank);
  if (!Number.isFinite(gap) || gap <= BOARD_REBALANCE_MIN_GAP) return null;
  return Number(previousRank) + gap / 2;
}

function moveBoardItem(items, itemId, destinationColumn, destinationIndex) {
  const existing = items.find((item) => item.id === itemId);
  if (!existing) return items;

  const withoutItem = items.filter((item) => item.id !== itemId);
  const destinationItems = withoutItem
    .filter((item) => item.columnKey === destinationColumn)
    .sort((left, right) => left.orderRank - right.orderRank);
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

function run() {
  assert.equal(computeRankBetween(null, null), 1024);
  assert.equal(computeRankBetween(1024, null), 2048);
  assert.equal(computeRankBetween(null, 2048), 1024);
  assert.equal(computeRankBetween(1024, 3072), 2048);
  assert.equal(computeRankBetween(1, 1.00001), null);

  const initial = [
    { id: "a", columnKey: "TODO", orderRank: 1024 },
    { id: "b", columnKey: "TODO", orderRank: 2048 },
    { id: "c", columnKey: "BACKLOG", orderRank: 1024 },
  ];

  const movedAcross = moveBoardItem(initial, "c", "TODO", 1);
  const cMoved = movedAcross.find((item) => item.id === "c");
  assert.equal(cMoved.columnKey, "TODO");
  assert.ok(cMoved.orderRank > 1024 && cMoved.orderRank < 2048);

  const movedToEnd = moveBoardItem(initial, "a", "TODO", 2);
  const aMoved = movedToEnd.find((item) => item.id === "a");
  assert.equal(aMoved.columnKey, "TODO");
  assert.ok(aMoved.orderRank > 2048);

  console.log("board-system regression checks passed");
}

run();
