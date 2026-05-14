const PLANNER_LANE_ORDER = Object.freeze([
  "CHECKLIST",
  "TODO",
  "BACKLOG",
  "ROADMAP",
  "IDEABANK",
]);

const PLANNER_LANE_TARGETS = Object.freeze({
  CHECKLIST: 3,
  TODO: 3,
  BACKLOG: 3,
  ROADMAP: 3,
  IDEABANK: 3,
});

const PLANNER_MIN_FLASHCARDS = 10;
const PLANNER_MIN_DATACARDS_FOR_ACTIVE = 1;
const MANUAL_LANE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const GENERATION_TIMEOUT_MS = 2 * 60 * 1000;

const LANE_RANK = Object.freeze(
  PLANNER_LANE_ORDER.reduce((accumulator, column, index) => {
    accumulator[column] = index;
    return accumulator;
  }, {}),
);

function normalizeLane(column) {
  return LANE_RANK[column] === undefined ? "IDEABANK" : column;
}

function getLaneRank(column) {
  return LANE_RANK[normalizeLane(column)];
}

function getPromotionSourceLanes(targetColumn) {
  const targetRank = getLaneRank(targetColumn);
  return PLANNER_LANE_ORDER.filter((column) => getLaneRank(column) > targetRank);
}

function comparePlannerPromotionPriority(left, right) {
  if (Number(right?.iceScore || 0) !== Number(left?.iceScore || 0)) {
    return Number(right?.iceScore || 0) - Number(left?.iceScore || 0);
  }
  if (Number(right?.ease || 0) !== Number(left?.ease || 0)) {
    return Number(right?.ease || 0) - Number(left?.ease || 0);
  }
  if (Number(right?.confidenceScore ?? right?.confidence ?? 0) !== Number(left?.confidenceScore ?? left?.confidence ?? 0)) {
    return Number(right?.confidenceScore ?? right?.confidence ?? 0) - Number(left?.confidenceScore ?? left?.confidence ?? 0);
  }
  return String(left?.title || "").localeCompare(String(right?.title || ""), "en", {
    sensitivity: "base",
    numeric: true,
  });
}

function getManualLaneCooldownUntil(baseDate = new Date()) {
  return new Date(new Date(baseDate).getTime() + MANUAL_LANE_COOLDOWN_MS);
}

function isManualLaneCooldownActive(task, now = new Date()) {
  if (!task?.manualLaneCooldownUntil) return false;
  return new Date(task.manualLaneCooldownUntil).getTime() > new Date(now).getTime();
}

function getManualLaneFloorColumn(task, now = new Date()) {
  if (!isManualLaneCooldownActive(task, now)) return null;
  return normalizeLane(task.manualLaneFloorColumn || task.kanbanColumn || "IDEABANK");
}

function canMoveTaskToLane(task, targetColumn, now = new Date()) {
  const floorColumn = getManualLaneFloorColumn(task, now);
  if (!floorColumn) return true;
  return getLaneRank(targetColumn) <= getLaneRank(floorColumn);
}

function getCompanyOperatingMode({ datacardCount = 0, flashcardCount = 0, laneCounts = {} } = {}) {
  if (Number(datacardCount) < PLANNER_MIN_DATACARDS_FOR_ACTIVE) return "INACTIVE";
  if (Number(flashcardCount) < PLANNER_MIN_FLASHCARDS) return "BOOTSTRAP";
  for (const lane of PLANNER_LANE_ORDER) {
    if (Number(laneCounts[lane] || 0) < Number(PLANNER_LANE_TARGETS[lane])) {
      return "BOOTSTRAP";
    }
  }
  return "MAINTENANCE";
}

module.exports = {
  PLANNER_LANE_ORDER,
  PLANNER_LANE_TARGETS,
  PLANNER_MIN_FLASHCARDS,
  PLANNER_MIN_DATACARDS_FOR_ACTIVE,
  MANUAL_LANE_COOLDOWN_MS,
  GENERATION_TIMEOUT_MS,
  normalizeLane,
  getLaneRank,
  getPromotionSourceLanes,
  comparePlannerPromotionPriority,
  getManualLaneCooldownUntil,
  isManualLaneCooldownActive,
  getManualLaneFloorColumn,
  canMoveTaskToLane,
  getCompanyOperatingMode,
};
