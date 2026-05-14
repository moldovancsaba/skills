import * as plannerContract from "./planner-contract.js";

export type PlannerLane = "CHECKLIST" | "TODO" | "BACKLOG" | "ROADMAP" | "IDEABANK";

export const PLANNER_LANE_ORDER = plannerContract.PLANNER_LANE_ORDER as PlannerLane[];
export const PLANNER_LANE_TARGETS = plannerContract.PLANNER_LANE_TARGETS as Record<PlannerLane, number>;
export const PLANNER_MIN_FLASHCARDS = plannerContract.PLANNER_MIN_FLASHCARDS as number;
export const PLANNER_MIN_DATACARDS_FOR_ACTIVE = plannerContract.PLANNER_MIN_DATACARDS_FOR_ACTIVE as number;
export const MANUAL_LANE_COOLDOWN_MS = plannerContract.MANUAL_LANE_COOLDOWN_MS as number;
export const GENERATION_TIMEOUT_MS = plannerContract.GENERATION_TIMEOUT_MS as number;
export const normalizeLane = plannerContract.normalizeLane as (column?: string | null) => PlannerLane;
export const getLaneRank = plannerContract.getLaneRank as (column?: string | null) => number;
export const getPromotionSourceLanes = plannerContract.getPromotionSourceLanes as (targetColumn: PlannerLane) => PlannerLane[];
export const comparePlannerPromotionPriority = plannerContract.comparePlannerPromotionPriority as (left: any, right: any) => number;
export const getManualLaneCooldownUntil = plannerContract.getManualLaneCooldownUntil as (baseDate?: Date) => Date;
export const isManualLaneCooldownActive = plannerContract.isManualLaneCooldownActive as (task: any, now?: Date) => boolean;
export const getManualLaneFloorColumn = plannerContract.getManualLaneFloorColumn as (task: any, now?: Date) => PlannerLane | null;
export const canMoveTaskToLane = plannerContract.canMoveTaskToLane as (task: any, targetColumn: PlannerLane, now?: Date) => boolean;
export const getCompanyOperatingMode = plannerContract.getCompanyOperatingMode as (input?: {
  datacardCount?: number;
  flashcardCount?: number;
  laneCounts?: Partial<Record<PlannerLane, number>>;
}) => "INACTIVE" | "BOOTSTRAP" | "MAINTENANCE";
