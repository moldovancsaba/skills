export type AthleteActivityType = "TRAINING" | "RECOVERY" | "NUTRITION" | "WELLNESS" | "MATCH" | "NOTE";

export const ATHLETE_ACTIVITY_TYPES: Array<{ value: AthleteActivityType; label: string }> = [
  { value: "TRAINING", label: "Training" },
  { value: "RECOVERY", label: "Recovery" },
  { value: "NUTRITION", label: "Nutrition" },
  { value: "WELLNESS", label: "Wellness" },
  { value: "MATCH", label: "Match" },
  { value: "NOTE", label: "Note" },
];

export type AthleteMetrics = {
  sleepHours?: number;
  soreness?: number;
  stress?: number;
  mood?: number;
  hydration?: number;
  bodyWeight?: number;
  painArea?: string;
  nutritionNote?: string;
};

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

function optionalBoundedNumber(value: unknown, min: number, max: number, decimals = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  const bounded = Math.max(min, Math.min(max, numeric));
  const factor = 10 ** decimals;
  return Math.round(bounded * factor) / factor;
}

function optionalShortText(value: unknown, maxLength = 140) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

export function normalizeAthleteMetrics(value: unknown): AthleteMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const metrics: AthleteMetrics = {};
  const sleepHours = optionalBoundedNumber(source.sleepHours, 0, 24, 1);
  const soreness = optionalBoundedNumber(source.soreness, 1, 10);
  const stress = optionalBoundedNumber(source.stress, 1, 10);
  const mood = optionalBoundedNumber(source.mood, 1, 10);
  const hydration = optionalBoundedNumber(source.hydration, 1, 10);
  const bodyWeight = optionalBoundedNumber(source.bodyWeight, 20, 400, 1);
  const painArea = optionalShortText(source.painArea);
  const nutritionNote = optionalShortText(source.nutritionNote, 220);

  if (sleepHours !== undefined) metrics.sleepHours = sleepHours;
  if (soreness !== undefined) metrics.soreness = soreness;
  if (stress !== undefined) metrics.stress = stress;
  if (mood !== undefined) metrics.mood = mood;
  if (hydration !== undefined) metrics.hydration = hydration;
  if (bodyWeight !== undefined) metrics.bodyWeight = bodyWeight;
  if (painArea) metrics.painArea = painArea;
  if (nutritionNote) metrics.nutritionNote = nutritionNote;

  return metrics;
}

export function dayBounds(dateInput?: string | null) {
  const safeDate = typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? dateInput
    : new Date().toISOString().slice(0, 10);
  const start = new Date(`${safeDate}T00:00:00.000Z`);
  const end = new Date(`${safeDate}T23:59:59.999Z`);
  return { safeDate, start, end };
}

type AthleteSummaryLog = {
  athleteEmail?: string | null;
  athleteName?: string | null;
  durationMinutes: number | null;
  readiness: number | null;
  intensity: number | null;
  completionState: string;
  metrics?: unknown;
};

function metricValue(log: AthleteSummaryLog, key: keyof AthleteMetrics) {
  if (!log.metrics || typeof log.metrics !== "object" || Array.isArray(log.metrics)) return undefined;
  const value = (log.metrics as AthleteMetrics)[key];
  return typeof value === "number" ? value : undefined;
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function averageDecimal(values: number[], decimals = 1) {
  if (!values.length) return null;
  const factor = 10 ** decimals;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * factor) / factor;
}

export function summarizeAthleteDay(logs: AthleteSummaryLog[]) {
  const completed = logs.filter((log) => log.completionState === "COMPLETED").length;
  const totalMinutes = logs.reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0);
  const readinessValues = logs.map((log) => log.readiness).filter((value): value is number => typeof value === "number");
  const intensityValues = logs.map((log) => log.intensity).filter((value): value is number => typeof value === "number");
  const sleepValues = logs.map((log) => metricValue(log, "sleepHours")).filter((value): value is number => typeof value === "number");
  const sorenessValues = logs.map((log) => metricValue(log, "soreness")).filter((value): value is number => typeof value === "number");
  const stressValues = logs.map((log) => metricValue(log, "stress")).filter((value): value is number => typeof value === "number");
  const hydrationValues = logs.map((log) => metricValue(log, "hydration")).filter((value): value is number => typeof value === "number");
  const painReports = logs.filter((log) => {
    if (!log.metrics || typeof log.metrics !== "object" || Array.isArray(log.metrics)) return false;
    return Boolean((log.metrics as AthleteMetrics).painArea);
  }).length;

  return {
    totalLogs: logs.length,
    completed,
    totalMinutes,
    averageReadiness: average(readinessValues),
    averageIntensity: average(intensityValues),
    averageSleepHours: averageDecimal(sleepValues),
    averageSoreness: average(sorenessValues),
    averageStress: average(stressValues),
    averageHydration: average(hydrationValues),
    painReports,
  };
}

export function summarizeAthleteTeam(logs: AthleteSummaryLog[]) {
  const athleteMap = new Map<string, {
    athleteEmail: string;
    athleteName: string | null;
    logs: AthleteSummaryLog[];
  }>();

  for (const log of logs) {
    const email = (log.athleteEmail || "unknown").trim().toLowerCase();
    const existing = athleteMap.get(email);
    if (existing) {
      existing.logs.push(log);
    } else {
      athleteMap.set(email, {
        athleteEmail: email,
        athleteName: log.athleteName || null,
        logs: [log],
      });
    }
  }

  return Array.from(athleteMap.values())
    .map((athlete) => ({
      athleteEmail: athlete.athleteEmail,
      athleteName: athlete.athleteName,
      ...summarizeAthleteDay(athlete.logs),
    }))
    .sort((a, b) => b.totalLogs - a.totalLogs || a.athleteEmail.localeCompare(b.athleteEmail));
}
