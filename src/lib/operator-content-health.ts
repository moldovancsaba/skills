import { prisma } from "@/lib/db";

export const CONTENT_HEALTH_OPERATOR_EMAIL = "moldovancsaba@gmail.com";
export const CONTENT_HEALTH_DEFAULT_TIMEZONE = "Europe/Budapest";
export const CONTENT_HEALTH_DEFAULT_HOURS = 24;
export const CONTENT_HEALTH_MAX_HOURS = 168;
export const CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS = 10_000;
export const CONTENT_HEALTH_SNAPSHOT_COLLECTION = "OperatorContentHealthSnapshot";
export const CONTENT_HEALTH_BASELINE_DAYS = 7;
export const CONTENT_HEALTH_SNAPSHOT_RETENTION_DAYS = 30;

type SeriesKey =
  | "datacards"
  | "files"
  | "flashcards"
  | "goals"
  | "tasks"
  | "opportunities"
  | "boardCards"
  | "destinationCandidates"
  | "destinationDrafts"
  | "reviewPackets"
  | "cardUpdates"
  | "feedback"
  | "actions"
  | "corrections"
  | "auditEvents"
  | "hashtagEvents";

type ActivitySource = {
  collection: string;
  key: SeriesKey;
  label: string;
  dateField: "createdAt" | "updatedAt";
  mode: "created" | "updated";
  match?: Record<string, unknown>;
};

type RawBucket = {
  _id?: Date | string | { $date?: string };
  count?: number;
};

type RawSample = {
  _id?: string;
  title?: string;
  name?: string;
  entityTag?: string;
  entityType?: string;
  outcomeType?: string;
  decisionType?: string;
  interactionType?: string;
  action?: string;
  createdAt?: Date | string | { $date?: string };
  updatedAt?: Date | string | { $date?: string };
  collection?: string;
};

type HealthStatus = "healthy" | "degraded" | "needs_attention";

type HealthAnomaly = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  observed: number;
  baseline: number | null;
  metric: "created" | "updated" | "feedback" | "activity";
  hour: string;
};

type SnapshotDocument = {
  _id?: string;
  hour?: Date | string | { $date?: string };
  hourIso?: string;
  timezone?: string;
  localHour?: number;
  createdTotal?: number;
  updatedTotal?: number;
  createdByKey?: Record<string, number>;
  updatedByKey?: Record<string, number>;
  sampledAt?: Date | string | { $date?: string };
};

const CREATED_SOURCES: ActivitySource[] = [
  { collection: "Source", key: "datacards", label: "Datacards", dateField: "createdAt", mode: "created" },
  { collection: "UploadedSourceFile", key: "files", label: "Files", dateField: "createdAt", mode: "created" },
  { collection: "Flashcard", key: "flashcards", label: "Flashcards", dateField: "createdAt", mode: "created" },
  { collection: "Goalcard", key: "goals", label: "Goals", dateField: "createdAt", mode: "created" },
  { collection: "ChecklistTask", key: "tasks", label: "Tasks", dateField: "createdAt", mode: "created" },
  { collection: "Opportunitycard", key: "opportunities", label: "Opportunities", dateField: "createdAt", mode: "created" },
  { collection: "BoardCard", key: "boardCards", label: "Board cards", dateField: "createdAt", mode: "created" },
  { collection: "DestinationCandidate", key: "destinationCandidates", label: "Destination candidates", dateField: "createdAt", mode: "created" },
  { collection: "DestinationDraft", key: "destinationDrafts", label: "Destination drafts", dateField: "createdAt", mode: "created" },
  { collection: "DestinationReviewPacket", key: "reviewPackets", label: "Review packets", dateField: "createdAt", mode: "created" },
];

const UPDATED_SOURCES: ActivitySource[] = [
  { collection: "Source", key: "datacards", label: "Datacards touched", dateField: "updatedAt", mode: "updated" },
  { collection: "UploadedSourceFile", key: "files", label: "Files touched", dateField: "updatedAt", mode: "updated" },
  { collection: "Flashcard", key: "flashcards", label: "Flashcards touched", dateField: "updatedAt", mode: "updated" },
  { collection: "Goalcard", key: "goals", label: "Goals touched", dateField: "updatedAt", mode: "updated" },
  { collection: "ChecklistTask", key: "tasks", label: "Tasks touched", dateField: "updatedAt", mode: "updated" },
  { collection: "Opportunitycard", key: "opportunities", label: "Opportunities touched", dateField: "updatedAt", mode: "updated" },
  { collection: "BoardCard", key: "boardCards", label: "Board cards touched", dateField: "updatedAt", mode: "updated" },
  { collection: "Feedback", key: "feedback", label: "Task feedback", dateField: "createdAt", mode: "created" },
  { collection: "StrategicFeedback", key: "feedback", label: "Strategic feedback", dateField: "createdAt", mode: "created" },
  { collection: "OpportunitycardFeedback", key: "feedback", label: "Opportunity feedback", dateField: "createdAt", mode: "created" },
  { collection: "FlashcardAction", key: "actions", label: "Flashcard actions", dateField: "createdAt", mode: "created" },
  { collection: "GoalcardAction", key: "actions", label: "Goal actions", dateField: "createdAt", mode: "created" },
  { collection: "FlashcardCorrection", key: "corrections", label: "Flashcard corrections", dateField: "createdAt", mode: "created" },
  { collection: "GoalcardCorrection", key: "corrections", label: "Goal corrections", dateField: "createdAt", mode: "created" },
  { collection: "HashtagFeedback", key: "hashtagEvents", label: "Hashtag feedback", dateField: "createdAt", mode: "created" },
  { collection: "InteractionEvent", key: "auditEvents", label: "Interactions", dateField: "createdAt", mode: "created" },
  { collection: "DecisionEvent", key: "auditEvents", label: "Decisions", dateField: "createdAt", mode: "created" },
  { collection: "OutcomeEvent", key: "auditEvents", label: "Outcomes", dateField: "createdAt", mode: "created" },
];

function clampHours(input: number | null | undefined) {
  const hours = Number.isFinite(input) ? Number(input) : CONTENT_HEALTH_DEFAULT_HOURS;
  return Math.max(1, Math.min(CONTENT_HEALTH_MAX_HOURS, Math.round(hours)));
}

function resolveTimezone(input: string | null | undefined) {
  const timezone = input?.trim() || CONTENT_HEALTH_DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return CONTENT_HEALTH_DEFAULT_TIMEZONE;
  }
}

function hourKey(date: Date | string) {
  return new Date(date).toISOString();
}

function mongoDate(date: Date) {
  return { $date: date.toISOString() };
}

function asNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMongoDate(value: Date | string | { $date?: string } | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object" && "$date" in value) {
    return value.$date ? new Date(value.$date).toISOString() : null;
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return null;
}

function makeEmptyBuckets(start: Date, hours: number, timezone: string) {
  return Array.from({ length: hours + 1 }, (_, index) => {
    const hour = new Date(start.getTime() + index * 60 * 60 * 1000);
    return {
      hour: hour.toISOString(),
      label: new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(hour),
      total: 0,
    } as Record<string, string | number>;
  });
}

function formatLocalHour(date: Date, timezone: string) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(hour);
}

function buildMatch(source: ActivitySource, start: Date, end: Date) {
  const dateRange = { $gte: mongoDate(start), $lte: mongoDate(end) };
  const match: Record<string, unknown> = {
    ...(source.match || {}),
    [source.dateField]: dateRange,
  };

  if (source.mode === "updated") {
    match.$expr = { $gt: [`$${source.dateField}`, "$createdAt"] };
  }

  return match;
}

async function aggregateSource(source: ActivitySource, start: Date, end: Date, timezone: string) {
  const command = {
    aggregate: source.collection,
    pipeline: [
      { $match: buildMatch(source, start, end) },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: `$${source.dateField}`,
              unit: "hour",
              timezone,
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ],
    cursor: {},
    maxTimeMS: CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS,
  };
  const result = await prisma.$runCommandRaw(command as any) as { cursor?: { firstBatch?: RawBucket[] } };

  return result.cursor?.firstBatch || [];
}

async function aggregateSeries(sources: ActivitySource[], start: Date, end: Date, timezone: string) {
  const sourceResults = await Promise.all(
    sources.map(async (source) => ({ source, buckets: await aggregateSource(source, start, end, timezone) })),
  );

  const totals = Object.fromEntries(
    Array.from(new Set(sources.map((source) => source.key))).map((key) => [key, 0]),
  ) as Record<string, number>;
  const byHour = new Map<string, Record<string, number>>();
  const sourceTotals = sources.map((source) => ({ key: source.key, label: source.label, collection: source.collection, total: 0 }));

  sourceResults.forEach(({ source, buckets }, sourceIndex) => {
    buckets.forEach((bucket) => {
      const key = normalizeMongoDate(bucket._id) || hourKey(start);
      const count = Number(bucket.count || 0);
      const hour = byHour.get(key) || {};
      hour[source.key] = Number(hour[source.key] || 0) + count;
      hour.total = Number(hour.total || 0) + count;
      byHour.set(key, hour);
      totals[source.key] = Number(totals[source.key] || 0) + count;
      sourceTotals[sourceIndex].total += count;
    });
  });

  return { byHour, totals, sourceTotals };
}

async function ensureSnapshotIndexes() {
  const command = {
    createIndexes: CONTENT_HEALTH_SNAPSHOT_COLLECTION,
    indexes: [
      {
        key: { hour: 1, timezone: 1 },
        name: "hour_timezone",
        unique: true,
      },
      {
        key: { sampledAt: -1 },
        name: "sampled_at_desc",
      },
      {
        key: { localHour: 1, hour: -1 },
        name: "local_hour_history",
      },
    ],
    maxTimeMS: CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS,
  };

  try {
    await prisma.$runCommandRaw(command as any);
  } catch (error) {
    console.warn("Operator content health snapshot index creation failed", error);
  }
}

function buildSnapshotUpdates(dashboard: {
  generatedAt: string;
  range: { timezone: string };
  created: { buckets: Array<Record<string, string | number>> };
  updated: { buckets: Array<Record<string, string | number>> };
}) {
  const updatedByHour = new Map(dashboard.updated.buckets.map((bucket) => [String(bucket.hour), bucket]));
  const sampledAt = new Date(dashboard.generatedAt);

  return dashboard.created.buckets.map((createdBucket) => {
    const hourIso = String(createdBucket.hour);
    const hourDate = new Date(hourIso);
    const updatedBucket = updatedByHour.get(hourIso) || {};
    const id = `${dashboard.range.timezone}:${hourIso}`;
    const createdByKey = Object.fromEntries(
      Object.entries(createdBucket)
        .filter(([key]) => !["hour", "label", "total"].includes(key))
        .map(([key, value]) => [key, asNumber(value)]),
    );
    const updatedByKey = Object.fromEntries(
      Object.entries(updatedBucket)
        .filter(([key]) => !["hour", "label", "total"].includes(key))
        .map(([key, value]) => [key, asNumber(value)]),
    );

    return {
      q: { _id: id },
      u: {
        $set: {
          hour: mongoDate(hourDate),
          hourIso,
          timezone: dashboard.range.timezone,
          localHour: formatLocalHour(hourDate, dashboard.range.timezone),
          createdTotal: asNumber(createdBucket.total),
          updatedTotal: asNumber(updatedBucket.total),
          createdByKey,
          updatedByKey,
          sampledAt: mongoDate(sampledAt),
          updatedAt: mongoDate(sampledAt),
        },
        $setOnInsert: {
          _id: id,
          createdAt: mongoDate(sampledAt),
        },
      },
      upsert: true,
    };
  });
}

async function persistDashboardSnapshots(dashboard: {
  generatedAt: string;
  range: { timezone: string };
  created: { buckets: Array<Record<string, string | number>> };
  updated: { buckets: Array<Record<string, string | number>> };
}) {
  await ensureSnapshotIndexes();
  const updates = buildSnapshotUpdates(dashboard);
  if (!updates.length) return { persisted: 0 };

  const result = await prisma.$runCommandRaw({
    update: CONTENT_HEALTH_SNAPSHOT_COLLECTION,
    updates,
    ordered: false,
    maxTimeMS: CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS,
  } as any) as { n?: number; nModified?: number; upserted?: unknown[] };

  return {
    persisted: Number(result.n || 0),
    modified: Number(result.nModified || 0),
    upserted: Array.isArray(result.upserted) ? result.upserted.length : 0,
  };
}

async function pruneOldSnapshots(now: Date) {
  const retentionStart = new Date(now.getTime() - CONTENT_HEALTH_SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    await prisma.$runCommandRaw({
      delete: CONTENT_HEALTH_SNAPSHOT_COLLECTION,
      deletes: [
        {
          q: { hour: { $lt: mongoDate(retentionStart) } },
          limit: 0,
        },
      ],
      maxTimeMS: CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS,
    } as any);
  } catch (error) {
    console.warn("Operator content health snapshot prune failed", error);
  }
}

async function readSnapshotHistory(start: Date, end: Date, timezone: string) {
  const result = await prisma.$runCommandRaw({
    aggregate: CONTENT_HEALTH_SNAPSHOT_COLLECTION,
    pipeline: [
      {
        $match: {
          timezone,
          hour: { $gte: mongoDate(start), $lte: mongoDate(end) },
        },
      },
      { $sort: { hour: 1 } },
    ],
    cursor: {},
    maxTimeMS: CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS,
  } as any) as { cursor?: { firstBatch?: SnapshotDocument[] } };

  return (result.cursor?.firstBatch || []).map((snapshot) => ({
    hour: normalizeMongoDate(snapshot.hour) || snapshot.hourIso || "",
    timezone: String(snapshot.timezone || timezone),
    localHour: asNumber(snapshot.localHour),
    createdTotal: asNumber(snapshot.createdTotal),
    updatedTotal: asNumber(snapshot.updatedTotal),
    createdByKey: snapshot.createdByKey || {},
    updatedByKey: snapshot.updatedByKey || {},
    sampledAt: normalizeMongoDate(snapshot.sampledAt),
  })).filter((snapshot) => snapshot.hour);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(observed: number, baseline: number | null) {
  if (!baseline || baseline <= 0) return observed > 0 ? Number.POSITIVE_INFINITY : 1;
  return observed / baseline;
}

function pickEvaluationBucket(buckets: Array<Record<string, string | number>>) {
  if (buckets.length >= 2) return buckets[buckets.length - 2];
  return buckets[buckets.length - 1] || null;
}

function buildHealthEvaluation(input: {
  dashboard: {
    generatedAt: string;
    range: { timezone: string };
    created: { buckets: Array<Record<string, string | number>> };
    updated: { buckets: Array<Record<string, string | number>> };
  };
  history: Awaited<ReturnType<typeof readSnapshotHistory>>;
}) {
  const createdBucket = pickEvaluationBucket(input.dashboard.created.buckets);
  const updatedBucket = pickEvaluationBucket(input.dashboard.updated.buckets);
  const evaluationHour = String(createdBucket?.hour || updatedBucket?.hour || input.dashboard.generatedAt);
  const evaluationDate = new Date(evaluationHour);
  const evaluationLocalHour = formatLocalHour(evaluationDate, input.dashboard.range.timezone);
  const createdObserved = asNumber(createdBucket?.total);
  const updatedObserved = asNumber(updatedBucket?.total);
  const feedbackObserved = asNumber(updatedBucket?.feedback);
  const recentCreatedTotal = input.dashboard.created.buckets.slice(-6).reduce((sum, bucket) => sum + asNumber(bucket.total), 0);
  const recentUpdatedTotal = input.dashboard.updated.buckets.slice(-6).reduce((sum, bucket) => sum + asNumber(bucket.total), 0);
  const dayAgo = new Date(evaluationDate.getTime() - 24 * 60 * 60 * 1000);
  const baselineStart = new Date(evaluationDate.getTime() - CONTENT_HEALTH_BASELINE_DAYS * 24 * 60 * 60 * 1000);

  const priorSameLocalHour = input.history.filter((snapshot) => {
    const snapshotDate = new Date(snapshot.hour);
    return snapshotDate < evaluationDate && snapshotDate >= baselineStart && snapshot.localHour === evaluationLocalHour;
  });
  const sameHourYesterday = input.history.find((snapshot) => Math.abs(new Date(snapshot.hour).getTime() - dayAgo.getTime()) < 30 * 60 * 1000) || null;
  const createdBaseline = average(priorSameLocalHour.map((snapshot) => snapshot.createdTotal));
  const updatedBaseline = average(priorSameLocalHour.map((snapshot) => snapshot.updatedTotal));
  const feedbackBaseline = average(priorSameLocalHour.map((snapshot) => asNumber(snapshot.updatedByKey.feedback)));
  const anomalies: HealthAnomaly[] = [];

  if (recentCreatedTotal === 0 && recentUpdatedTotal === 0) {
    anomalies.push({
      id: "no-recent-activity",
      severity: "critical",
      title: "No activity in the recent operating window",
      detail: "No created content or card update activity was observed across the last six hourly buckets.",
      observed: 0,
      baseline: null,
      metric: "activity",
      hour: evaluationHour,
    });
  }

  if (createdObserved === 0 && (createdBaseline ?? 0) >= 2) {
    anomalies.push({
      id: "created-content-drop",
      severity: "warning",
      title: "Created content below baseline",
      detail: "The evaluated hour has no new content while the same local hour is normally active.",
      observed: createdObserved,
      baseline: createdBaseline,
      metric: "created",
      hour: evaluationHour,
    });
  }

  if (updatedObserved === 0 && (updatedBaseline ?? 0) >= 5) {
    anomalies.push({
      id: "updated-activity-drop",
      severity: "warning",
      title: "Card update activity below baseline",
      detail: "The evaluated hour has no update/action activity while the same local hour is normally active.",
      observed: updatedObserved,
      baseline: updatedBaseline,
      metric: "updated",
      hour: evaluationHour,
    });
  }

  if (updatedBaseline !== null && updatedBaseline > 0 && updatedObserved >= 50 && ratio(updatedObserved, updatedBaseline) >= 3) {
    anomalies.push({
      id: "updated-activity-spike",
      severity: "warning",
      title: "Card update activity spike",
      detail: "Update/action activity is at least three times above the same-hour baseline.",
      observed: updatedObserved,
      baseline: updatedBaseline,
      metric: "updated",
      hour: evaluationHour,
    });
  }

  if (feedbackBaseline !== null && feedbackBaseline > 0 && feedbackObserved >= 25 && ratio(feedbackObserved, feedbackBaseline) >= 3) {
    anomalies.push({
      id: "feedback-spike",
      severity: "warning",
      title: "Feedback spike",
      detail: "Feedback activity is significantly above the same-hour baseline.",
      observed: feedbackObserved,
      baseline: feedbackBaseline,
      metric: "feedback",
      hour: evaluationHour,
    });
  }

  if (priorSameLocalHour.length < 3) {
    anomalies.push({
      id: "baseline-learning",
      severity: "info",
      title: "Baseline still learning",
      detail: "Fewer than three same-hour snapshots are available, so anomaly confidence is limited.",
      observed: priorSameLocalHour.length,
      baseline: 3,
      metric: "activity",
      hour: evaluationHour,
    });
  }

  const status: HealthStatus = anomalies.some((anomaly) => anomaly.severity === "critical")
    ? "needs_attention"
    : anomalies.some((anomaly) => anomaly.severity === "warning")
      ? "degraded"
      : "healthy";

  return {
    status,
    evaluatedHour: evaluationHour,
    summary: status === "healthy"
      ? "Created content and update activity are within the available baseline."
      : status === "degraded"
        ? "Activity is present, but one or more lanes differ from baseline."
        : "The activity signal needs operator attention.",
    anomalies,
    trend: {
      baselineDays: CONTENT_HEALTH_BASELINE_DAYS,
      baselineSnapshotCount: priorSameLocalHour.length,
      historySnapshotCount: input.history.length,
      current: {
        hour: evaluationHour,
        localHour: evaluationLocalHour,
        createdTotal: createdObserved,
        updatedTotal: updatedObserved,
        feedbackTotal: feedbackObserved,
      },
      sameHourYesterday: sameHourYesterday ? {
        hour: sameHourYesterday.hour,
        createdTotal: sameHourYesterday.createdTotal,
        updatedTotal: sameHourYesterday.updatedTotal,
        feedbackTotal: asNumber(sameHourYesterday.updatedByKey.feedback),
      } : null,
      sevenDayAverage: {
        createdTotal: createdBaseline,
        updatedTotal: updatedBaseline,
        feedbackTotal: feedbackBaseline,
      },
    },
    alert: {
      ready: true,
      shouldNotify: status !== "healthy" && anomalies.some((anomaly) => anomaly.severity !== "info"),
      status,
      severity: status === "needs_attention" ? "critical" : status === "degraded" ? "warning" : "info",
      title: status === "healthy" ? "System activity healthy" : "System activity anomaly detected",
      message: anomalies.filter((anomaly) => anomaly.severity !== "info").map((anomaly) => anomaly.title).join("; ") || "No alertable anomalies.",
      channels: ["operator-dashboard"],
    },
  };
}

async function readRecentSamples(start: Date, end: Date) {
  const sampleSources = [
    { collection: "ChecklistTask", dateField: "updatedAt", label: "Task" },
    { collection: "Opportunitycard", dateField: "updatedAt", label: "Opportunity" },
    { collection: "Flashcard", dateField: "updatedAt", label: "Flashcard" },
    { collection: "Goalcard", dateField: "updatedAt", label: "Goal" },
    { collection: "OutcomeEvent", dateField: "createdAt", label: "Outcome" },
  ];

  const samples = await Promise.all(sampleSources.map(async (source) => {
    const command = {
      aggregate: source.collection,
      pipeline: [
        { $match: { [source.dateField]: { $gte: mongoDate(start), $lte: mongoDate(end) } } },
        { $sort: { [source.dateField]: -1 } },
        { $limit: 8 },
        {
          $project: {
            _id: 1,
            title: 1,
            name: 1,
            entityTag: 1,
            entityType: 1,
            outcomeType: 1,
            decisionType: 1,
            interactionType: 1,
            action: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ],
      cursor: {},
      maxTimeMS: CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS,
    };
    const result = await prisma.$runCommandRaw(command as any) as { cursor?: { firstBatch?: RawSample[] } };

    return (result.cursor?.firstBatch || []).map((item) => ({
      id: String(item._id || ""),
      family: source.label,
      label: item.title || item.name || item.entityTag || item.outcomeType || item.decisionType || item.interactionType || item.action || item.entityType || source.label,
      createdAt: normalizeMongoDate(item.createdAt),
      updatedAt: normalizeMongoDate(item.updatedAt),
    }));
  }));

  return samples.flat()
    .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
    .slice(0, 12);
}

export async function buildOperatorContentHealth(input: {
  hours?: number | null;
  timezone?: string | null;
  now?: Date;
  persistSnapshots?: boolean;
}) {
  const hours = clampHours(input.hours);
  const timezone = resolveTimezone(input.timezone);
  const end = input.now || new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);

  const [created, updated, recentSamples] = await Promise.all([
    aggregateSeries(CREATED_SOURCES, start, end, timezone),
    aggregateSeries(UPDATED_SOURCES, start, end, timezone),
    readRecentSamples(start, end),
  ]);

  const createdBuckets = makeEmptyBuckets(start, hours, timezone);
  const updatedBuckets = makeEmptyBuckets(start, hours, timezone);

  for (const bucket of createdBuckets) {
    Object.assign(bucket, created.byHour.get(String(bucket.hour)) || {});
  }

  for (const bucket of updatedBuckets) {
    Object.assign(bucket, updated.byHour.get(String(bucket.hour)) || {});
  }

  const createdTotal = Object.values(created.totals).reduce((sum, value) => sum + Number(value || 0), 0);
  const updatedTotal = Object.values(updated.totals).reduce((sum, value) => sum + Number(value || 0), 0);

  const dashboard = {
    generatedAt: end.toISOString(),
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      hours,
      timezone,
    },
    created: {
      total: createdTotal,
      buckets: createdBuckets,
      totals: created.totals,
      sources: created.sourceTotals,
    },
    updated: {
      total: updatedTotal,
      buckets: updatedBuckets,
      totals: updated.totals,
      sources: updated.sourceTotals,
    },
    recentSamples,
  };

  const snapshotWrite = input.persistSnapshots === false
    ? { persisted: 0, modified: 0, upserted: 0 }
    : await persistDashboardSnapshots(dashboard);
  if (input.persistSnapshots !== false) {
    void pruneOldSnapshots(end);
  }

  const historyStart = new Date(end.getTime() - (CONTENT_HEALTH_BASELINE_DAYS + 1) * 24 * 60 * 60 * 1000);
  const history = await readSnapshotHistory(historyStart, end, timezone);
  const health = buildHealthEvaluation({ dashboard, history });

  return {
    ...dashboard,
    health,
    snapshots: {
      ...snapshotWrite,
      collection: CONTENT_HEALTH_SNAPSHOT_COLLECTION,
      retentionDays: CONTENT_HEALTH_SNAPSHOT_RETENTION_DAYS,
    },
  };
}
