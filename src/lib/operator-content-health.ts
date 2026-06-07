import { prisma } from "@/lib/db";

export const CONTENT_HEALTH_OPERATOR_EMAIL = "moldovancsaba@gmail.com";
export const CONTENT_HEALTH_DEFAULT_TIMEZONE = "Europe/Budapest";
export const CONTENT_HEALTH_DEFAULT_HOURS = 24;
export const CONTENT_HEALTH_MAX_HOURS = 168;
export const CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS = 10_000;

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

  return {
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
}
