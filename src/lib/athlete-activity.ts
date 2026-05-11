export type AthleteActivityType = "TRAINING" | "RECOVERY" | "NUTRITION" | "WELLNESS" | "MATCH" | "NOTE";

export const ATHLETE_ACTIVITY_TYPES: Array<{ value: AthleteActivityType; label: string }> = [
  { value: "TRAINING", label: "Training" },
  { value: "RECOVERY", label: "Recovery" },
  { value: "NUTRITION", label: "Nutrition" },
  { value: "WELLNESS", label: "Wellness" },
  { value: "MATCH", label: "Match" },
  { value: "NOTE", label: "Note" },
];

export function normalizeActivityType(value: unknown): AthleteActivityType {
  const candidate = String(value || "").toUpperCase();
  return ATHLETE_ACTIVITY_TYPES.some((item) => item.value === candidate)
    ? candidate as AthleteActivityType
    : "TRAINING";
}

export function clampAthleteScore(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

export function normalizeDurationMinutes(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.max(1, Math.min(24 * 60, Math.round(numeric)));
}

export function dayBounds(dateInput?: string | null) {
  const safeDate = typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? dateInput
    : new Date().toISOString().slice(0, 10);
  const start = new Date(`${safeDate}T00:00:00.000Z`);
  const end = new Date(`${safeDate}T23:59:59.999Z`);
  return { safeDate, start, end };
}

export function summarizeAthleteDay(logs: Array<{ durationMinutes: number | null; readiness: number | null; intensity: number | null; completionState: string }>) {
  const completed = logs.filter((log) => log.completionState === "COMPLETED").length;
  const totalMinutes = logs.reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0);
  const readinessValues = logs.map((log) => log.readiness).filter((value): value is number => typeof value === "number");
  const intensityValues = logs.map((log) => log.intensity).filter((value): value is number => typeof value === "number");
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

  return {
    totalLogs: logs.length,
    completed,
    totalMinutes,
    averageReadiness: average(readinessValues),
    averageIntensity: average(intensityValues),
  };
}
