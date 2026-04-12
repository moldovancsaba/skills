const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function buildChecklistEnvCandidates() {
  const candidates = [];
  if (process.env.CHECKLIST_ENV_PATH) {
    candidates.push(process.env.CHECKLIST_ENV_PATH);
  }

  const repoRoot = path.join(__dirname, "..");
  candidates.push(path.join(repoRoot, ".env"));

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

for (const envPath of buildChecklistEnvCandidates()) {
  require("dotenv").config({ path: envPath, override: false });
}

function envFlag(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

const PORT = Number(process.env.PORT || "10005");
const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:latest";
const POLL_INTERVAL_MS = Math.max(
  Number(process.env.CHECKLIST_POLL_INTERVAL_MS || process.env.POLL_INTERVAL || "7200000"),
  30_000,
);
const FLASHCARD_REVISIT_INTERVAL_MINUTES = Math.max(
  Number(process.env.CHECKLIST_FLASHCARD_REVISIT_INTERVAL_MINUTES || "0"),
  0,
);
const FLASHCARD_REVISIT_INTERVAL_MS = FLASHCARD_REVISIT_INTERVAL_MINUTES * 60_000;
const FLASHCARD_REVISIT_BATCH_SIZE = Math.max(
  Number(process.env.CHECKLIST_FLASHCARD_REVISIT_BATCH_SIZE || "1"),
  1,
);
const TASK_REVISIT_INTERVAL_MINUTES = Math.max(
  Number(process.env.CHECKLIST_TASK_REVISIT_INTERVAL_MINUTES || "0"),
  0,
);
const TASK_REVISIT_INTERVAL_MS = TASK_REVISIT_INTERVAL_MINUTES * 60_000;
const TASK_REVISIT_BATCH_SIZE = Math.max(
  Number(process.env.CHECKLIST_TASK_REVISIT_BATCH_SIZE || "1"),
  1,
);
const FEEDBACK_REPLAY_INTERVAL_MINUTES = Math.max(
  Number(process.env.CHECKLIST_FEEDBACK_REPLAY_INTERVAL_MINUTES || "0"),
  0,
);
const FEEDBACK_REPLAY_INTERVAL_MS = FEEDBACK_REPLAY_INTERVAL_MINUTES * 60_000;
const FEEDBACK_REPLAY_BATCH_SIZE = Math.max(
  Number(process.env.CHECKLIST_FEEDBACK_REPLAY_BATCH_SIZE || "1"),
  1,
);
const HASHTAG_MAINTENANCE_INTERVAL_HOURS = Math.max(Number(process.env.CHECKLIST_HASHTAG_MAINTENANCE_HOURS || "0"), 0);
const HASHTAG_MAINTENANCE_INTERVAL_MS = HASHTAG_MAINTENANCE_INTERVAL_HOURS * 3_600_000;
const HASHTAG_MAINTENANCE_BATCH_SIZE = Math.max(Number(process.env.CHECKLIST_HASHTAG_MAINTENANCE_BATCH_SIZE || "1"), 1);
const CLEANUP_INTERVAL_HOURS = Math.max(Number(process.env.CHECKLIST_CLEANUP_INTERVAL_HOURS || "0"), 0);
const CLEANUP_INTERVAL_MS = CLEANUP_INTERVAL_HOURS * 3_600_000;
const CLEANUP_BATCH_SIZE = Math.max(Number(process.env.CHECKLIST_CLEANUP_BATCH_SIZE || "1"), 1);
const COMPANY_LANE_CONTINUE_DELAY_MS = Math.max(Number(process.env.CHECKLIST_COMPANY_LANE_CONTINUE_DELAY_MS || "1000"), 250);
const COMPANY_LANE_IDLE_DELAY_MS = Math.max(Number(process.env.CHECKLIST_COMPANY_LANE_IDLE_DELAY_MS || "30000"), 1000);
const TASK_MIN_ICE_SCORE = Math.max(Number(process.env.CHECKLIST_TASK_MIN_ICE_SCORE || "100"), 0);
const FLASHCARD_MIN_CONFIDENCE = Math.max(Number(process.env.CHECKLIST_FLASHCARD_MIN_CONFIDENCE || "60"), 1);
const FLASHCARD_MIN_IMPACT = Math.max(Number(process.env.CHECKLIST_FLASHCARD_MIN_IMPACT || "40"), 1);
const FLASHCARD_MIN_WEIGHT = Math.max(Number(process.env.CHECKLIST_FLASHCARD_MIN_WEIGHT || "40"), 1);
const LOCAL_SYNC_SECRET = process.env.LOCAL_SYNC_SECRET || "checklist-sync-2024";
const APP_VERSION = process.env.CHECKLIST_APP_VERSION || "checklist-local-worker";
const BRAIN_VERSION = process.env.CHECKLIST_BRAIN_VERSION || "worker-v3-research";
const PROMPT_VERSION = process.env.CHECKLIST_PROMPT_VERSION || "2026-04-06.checklist-worker-v3-research";
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.join(__dirname, "knowledge");
const RUNTIME_METRICS_FILE = path.join(KNOWLEDGE_DIR, "runtime-metrics.ndjson");
const FAILSAFE_QUEUE_FILE = path.join(KNOWLEDGE_DIR, "failsafe-queue.ndjson");
const RESEARCH_ENABLED = envFlag(process.env.CHECKLIST_RESEARCH_ENABLED, false);
const RESEARCH_PROVIDER = process.env.CHECKLIST_RESEARCH_PROVIDER || "duckduckgo-html";
const RESEARCH_TIMEOUT_MS = Math.max(Number(process.env.CHECKLIST_RESEARCH_TIMEOUT_MS || "12000"), 3_000);
const OLLAMA_TIMEOUT_MS = Math.max(Number(process.env.CHECKLIST_OLLAMA_TIMEOUT_MS || "45000"), 5_000);
const FAILSAFE_MODEL = process.env.CHECKLIST_FAILSAFE_MODEL || process.env.CHECKLIST_FAILSAFE_OLLAMA_MODEL || "gemma4:e4b";
const FAILSAFE_MODELS = unique(
  String(process.env.CHECKLIST_FAILSAFE_MODELS || FAILSAFE_MODEL)
    .split(",")
    .map((value) => normalizeText(value))
    .filter(Boolean),
);
const FAILSAFE_TIMEOUT_MS = Math.max(Number(process.env.CHECKLIST_FAILSAFE_TIMEOUT_MS || String(Math.max(OLLAMA_TIMEOUT_MS, 90_000))), 5_000);
const FAILSAFE_MAX_ATTEMPTS = Math.max(Number(process.env.CHECKLIST_FAILSAFE_MAX_ATTEMPTS || "2"), 1);
const STUCK_RUNNING_MS = Math.max(Number(process.env.CHECKLIST_STUCK_RUNNING_MS || "900000"), 60_000);
const NO_PROGRESS_MS = Math.max(Number(process.env.CHECKLIST_NO_PROGRESS_MS || "10800000"), 60_000);
const RESEARCH_MAX_QUERIES = Math.max(Math.min(Number(process.env.CHECKLIST_RESEARCH_MAX_QUERIES || "2"), 5), 0);
const RESEARCH_MAX_RESULTS = Math.max(Math.min(Number(process.env.CHECKLIST_RESEARCH_MAX_RESULTS || "3"), 6), 0);
const RESEARCH_MAX_FETCHES = Math.max(Math.min(Number(process.env.CHECKLIST_RESEARCH_MAX_FETCHES || "3"), 6), 0);
const RESEARCH_REFRESH_HOURS = Math.max(Number(process.env.CHECKLIST_RESEARCH_REFRESH_HOURS || "24"), 1);
const RESEARCH_HARVEST_BATCH_SIZE = Math.max(Number(process.env.CHECKLIST_RESEARCH_HARVEST_BATCH_SIZE || "1"), 1);
const FACTCHECK_MIN_CITATIONS = Math.max(Math.min(Number(process.env.CHECKLIST_FACTCHECK_MIN_CITATIONS || "2"), 5), 1);
const FACTCHECK_MIN_DOMAINS = Math.max(Math.min(Number(process.env.CHECKLIST_FACTCHECK_MIN_DOMAINS || "2"), 5), 1);
const RESEARCH_ALLOWED_HOSTS = String(process.env.CHECKLIST_RESEARCH_ALLOWED_HOSTS || "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const FLASHCARD_KINDS = new Set([
  "SUMMARY",
  "EXPLANATION",
  "COMPARISON",
  "NEWS",
  "CONCLUSION",
  "EVALUATION",
  "OPINION",
  "JUDGMENT",
  "RECOMMENDATION",
  "RESEARCH",
  "FORECAST",
  "STOCK",
  "GOSSIP",
  "PRICE",
]);
const FACTCHECK_CAPS = {
  VERIFIED: 92,
  CORROBORATED: 82,
  SINGLE_SOURCE: 72,
  SOURCE_GROUNDED: 78,
  UNVERIFIED: 52,
  NOT_RUN: 74,
};
const PUBLIC_ID_SCOPES = {
  source: "source",
  flashcard: "flashcard",
  checklist: "checklist",
};
const HASHTAG_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "into", "about",
  "after", "before", "under", "over", "their", "there", "have", "has", "are",
  "was", "were", "will", "http", "https", "www", "com", "inc", "llc", "ltd",
]);

let currentDbUrl = process.env.NEON_DB || process.env.DATABASE_URL || "";
let dbReady = false;
let dbBlocker = currentDbUrl ? null : "DATABASE_URL environment variable required (check .env)";
let modelReady = false;
let modelBlocker = null;
let lastPollError = null;
let lastSync = Date.now() - 3_600_000;
let lastHashtagMaintenanceAt = Date.now() - HASHTAG_MAINTENANCE_INTERVAL_MS;
let lastMeaningfulProgressAt = Date.now();
let prisma = null;

function scheduleStartupLane(laneName, executor, delayMs = 0) {
  setTimeout(() => {
    runLane(laneName, executor).catch((err) => {
      lastPollError = err.message;
      console.error(`Initial ${laneName} lane failed:`, err.message);
    });
  }, delayMs);
}

function createLaneState(name, intervalMs, batchSize = null) {
  return {
    name,
    intervalMs,
    batchSize,
    running: false,
    lastStartedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastDurationMs: null,
    lastError: null,
    lastResult: null,
  };
}

const laneStates = {
  companyCycle: createLaneState("companyCycle", POLL_INTERVAL_MS, 1),
  poll: createLaneState("poll", POLL_INTERVAL_MS),
  researchHarvest: createLaneState("researchHarvest", Math.max(POLL_INTERVAL_MS, 60_000), RESEARCH_HARVEST_BATCH_SIZE),
  flashcardRevisit: createLaneState("flashcardRevisit", Math.max(FLASHCARD_REVISIT_INTERVAL_MS, POLL_INTERVAL_MS), FLASHCARD_REVISIT_BATCH_SIZE),
  taskRevisit: createLaneState("taskRevisit", Math.max(TASK_REVISIT_INTERVAL_MS, POLL_INTERVAL_MS), TASK_REVISIT_BATCH_SIZE),
  feedbackReplay: createLaneState("feedbackReplay", Math.max(FEEDBACK_REPLAY_INTERVAL_MS, POLL_INTERVAL_MS), FEEDBACK_REPLAY_BATCH_SIZE),
  hashtagMaintenance: createLaneState("hashtagMaintenance", Math.max(HASHTAG_MAINTENANCE_INTERVAL_MS, POLL_INTERVAL_MS), HASHTAG_MAINTENANCE_BATCH_SIZE),
  cleanup: createLaneState("cleanup", Math.max(CLEANUP_INTERVAL_MS, POLL_INTERVAL_MS), CLEANUP_BATCH_SIZE),
  failsafeQueue: createLaneState("failsafeQueue", POLL_INTERVAL_MS, 1),
};

if (!fs.existsSync(KNOWLEDGE_DIR)) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

async function refreshDbConfig() {
  currentDbUrl = process.env.NEON_DB || process.env.DATABASE_URL || "";
  if (!currentDbUrl) {
    dbReady = false;
    dbBlocker = "DATABASE_URL environment variable required (check .env)";
    prisma = null;
    return false;
  }
  if (!prisma) {
    try {
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: currentDbUrl,
          },
        },
      });
      dbReady = true;
      dbBlocker = null;
    } catch (e) {
      dbReady = false;
      dbBlocker = `Prisma initialization failed: ${e.message}`;
      return false;
    }
  }
  return true;
}

async function connectDB() {
  if (!(await refreshDbConfig())) {
    throw new Error(dbBlocker);
  }
  try {
    await prisma.$connect();
    dbReady = true;
    dbBlocker = null;
    lastPollError = null;
    console.log("\x1b[32m%s\x1b[0m", "✓ Connected to Checklist database via Prisma");
  } catch (error) {
    dbReady = false;
    dbBlocker = `Database connection failed: ${error.message}`;
    throw error;
  }
}

async function reservePublicIds(scope, count = 1) {
  if (!count) return [];

  await prisma.publicIdCounter.upsert({
    where: { scope },
    update: {},
    create: {
      scope,
      value: 0,
      updatedAt: new Date(),
    },
  });

  const counter = await prisma.publicIdCounter.update({
    where: { scope },
    data: {
      value: {
        increment: count,
      },
      updatedAt: new Date(),
    },
  });

  const firstPublicId = counter.value - count + 1;
  return Array.from({ length: count }, (_, index) => firstPublicId + index);
}

async function nextPublicId(scope) {
  const [publicId] = await reservePublicIds(scope, 1);
  return publicId;
}

async function backfillMissingDerivedPublicIds(companyId) {
  const [flashcards, checklistItems] = await Promise.all([
    prisma.flashcard.findMany({
      where: { companyId, publicId: null },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.nBAItem.findMany({
      where: { companyId, publicId: null },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  if (flashcards.length > 0) {
    const ids = await reservePublicIds(PUBLIC_ID_SCOPES.flashcard, flashcards.length);
    for (const [index, flashcard] of flashcards.entries()) {
      await prisma.flashcard.update({
        where: { id: flashcard.id },
        data: { publicId: ids[index], updatedAt: new Date() },
      });
    }
  }

  if (checklistItems.length > 0) {
    const ids = await reservePublicIds(PUBLIC_ID_SCOPES.checklist, checklistItems.length);
    for (const [index, item] of checklistItems.entries()) {
      await prisma.nBAItem.update({
        where: { id: item.id },
        data: { publicId: ids[index], updatedAt: new Date() },
      });
    }
  }
}

function buildLegacySourceContent(record) {
  const metadata = record.metadata || {};
  const lines = [normalizeText(record.name || record.content || "")];
  if (typeof metadata.description === "string" && metadata.description.trim()) lines.push(`Description: ${metadata.description.trim()}`);
  if (typeof metadata.pricing === "string" && metadata.pricing.trim()) lines.push(`Pricing: ${metadata.pricing.trim()}`);
  if (typeof metadata.positioning === "string" && metadata.positioning.trim()) lines.push(`Positioning: ${metadata.positioning.trim()}`);
  for (const [label, values] of [
    ["Signals", metadata.features],
    ["Signals", metadata.segments],
    ["Signals", metadata.painPoints],
    ["Signals", metadata.channels],
    ["Signals", metadata.strengths],
    ["Signals", metadata.weaknesses],
    ["URLs", metadata.urls],
  ]) {
    const list = toArray(values).map((value) => normalizeText(value)).filter(Boolean);
    if (list.length > 0) lines.push(`${label}: ${list.join(", ")}`);
  }
  if (typeof metadata.notes === "string" && metadata.notes.trim()) lines.push(`Notes: ${metadata.notes.trim()}`);
  return lines.filter(Boolean).join("\n");
}

async function backfillUnifiedSources(companyId) {
  const [products, customers, competitors] = await Promise.all([
    prisma.product.findMany({ where: { companyId } }),
    prisma.customer.findMany({ where: { companyId } }),
    prisma.competitor.findMany({ where: { companyId } }),
  ]);

  const legacy = [
    ...products.map((item) => ({
      originKey: `legacy:product:${item.id}`,
      publicId: item.publicId ?? null,
      companyId: item.companyId,
      name: item.name,
      hashtags: item.hashtags,
      entityTag: item.entityTag ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      metadata: {
        description: item.description,
        pricing: item.pricing,
        features: item.features,
        urls: item.urls,
      },
    })),
    ...customers.map((item) => ({
      originKey: `legacy:customer:${item.id}`,
      publicId: item.publicId ?? null,
      companyId: item.companyId,
      name: item.name,
      hashtags: item.hashtags,
      entityTag: item.entityTag ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      metadata: {
        segments: item.segments,
        painPoints: item.painPoints,
        channels: item.channels,
        notes: item.notes,
      },
    })),
    ...competitors.map((item) => ({
      originKey: `legacy:competitor:${item.id}`,
      publicId: item.publicId ?? null,
      companyId: item.companyId,
      name: item.name,
      hashtags: item.hashtags,
      entityTag: item.entityTag ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      metadata: {
        pricing: item.pricing,
        positioning: item.positioning,
        strengths: item.strengths,
        weaknesses: item.weaknesses,
        urls: item.urls,
      },
    })),
  ];

  if (legacy.length === 0) return 0;

  const existing = await prisma.source.findMany({
    where: { companyId, legacyOriginKey: { in: legacy.map((item) => item.originKey) } },
    select: { legacyOriginKey: true },
  });
  const existingKeys = new Set(existing.map((item) => item.legacyOriginKey).filter(Boolean));
  let created = 0;

  for (const record of legacy) {
    if (existingKeys.has(record.originKey)) continue;
    await prisma.source.create({
      data: {
        companyId,
        publicId: record.publicId ?? await nextPublicId(PUBLIC_ID_SCOPES.source),
        content: buildLegacySourceContent(record),
        hashtags: normalizeHashtags(record.hashtags),
        entityTag: record.entityTag,
        metadata: record.metadata,
        legacyOriginKey: record.originKey,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
    created += 1;
  }

  return created;
}

function normalizeText(value) {
  return String(value || "").replace(/\u0000/g, " ").trim();
}

function normalizeLoose(value) {
  return normalizeText(value).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value, max = 4000) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function similarity(a, b) {
  const left = normalizeLoose(a).split(/\s+/).filter(Boolean);
  const right = normalizeLoose(b).split(/\s+/).filter(Boolean);
  const common = left.filter((token) => right.includes(token) && token.length > 2);
  return common.length / Math.max(left.length, right.length, 1);
}

function tokenizeText(value) {
  return normalizeLoose(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !HASHTAG_STOPWORDS.has(token));
}

function overlapScore(a, b) {
  const left = new Set(tokenizeText(a));
  const right = new Set(tokenizeText(b));
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const token of left) {
    if (right.has(token)) common += 1;
  }
  return common / Math.max(left.size, right.size, 1);
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return [];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeHashtag(value) {
  const trimmed = normalizeText(value).toLowerCase();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^#+/, "").replace(/[^a-z0-9-_]/g, "");
  if (!bare) return null;
  return `#${bare}`;
}

function normalizeHashtags(values) {
  return unique(toArray(values).map(normalizeHashtag).filter(Boolean));
}

function deriveKeywordHashtags(...values) {
  const tags = [];
  for (const value of values) {
    const words = normalizeLoose(value)
      .split(/\s+/)
      .filter((word) => word.length > 2 && !HASHTAG_STOPWORDS.has(word))
      .slice(0, 12);
    for (const word of words) {
      tags.push(normalizeHashtag(word));
    }
  }
  return unique(tags.filter(Boolean));
}

function mergeHashtags(...groups) {
  return unique(groups.flatMap((group) => normalizeHashtags(group)));
}

function extractJsonCandidate(raw) {
  const content = normalizeText(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  if (!content) return null;
  if (content.startsWith("{") || content.startsWith("[")) return content;
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  return null;
}

function clampInt(value, fallback, min = 1, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function parseBoundedInt(value, min = 1, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function isUniqueConstraintError(error) {
  return Boolean(error && typeof error === "object" && error.code === "P2002");
}

function isoTimestamp(value = new Date()) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function runLane(laneName, executor) {
  const lane = laneStates[laneName];
  if (!lane) {
    return executor();
  }
  if (lane.running) {
    return { skipped: true, reason: "already-running" };
  }

  const startedAt = Date.now();
  lane.running = true;
  lane.lastStartedAt = startedAt;

  try {
    const result = await executor();
    lane.lastSucceededAt = Date.now();
    lane.lastDurationMs = lane.lastSucceededAt - startedAt;
    lane.lastError = null;
    lane.lastResult = result || null;
    if (result?.companyId) {
      await recordCompanyLaneRun(result.companyId, laneName, result, lane.lastDurationMs);
    }
    return result;
  } catch (error) {
    lane.lastFailedAt = Date.now();
    lane.lastDurationMs = lane.lastFailedAt - startedAt;
    lane.lastError = error.message;
    lane.lastResult = { error: error.message };
    if (error?.companyId) {
      await recordCompanyLaneRun(error.companyId, laneName, { error: error.message }, lane.lastDurationMs, error);
    }
    throw error;
  } finally {
    lane.running = false;
  }
}

function classifyLaneHealth(lane) {
  if (!lane) return "unknown";
  if (lane.running) {
    const runningForMs = lane.lastStartedAt ? Date.now() - lane.lastStartedAt : 0;
    return runningForMs > STUCK_RUNNING_MS ? "stuck" : "running";
  }
  if (lane.lastFailedAt && (!lane.lastSucceededAt || lane.lastFailedAt >= lane.lastSucceededAt)) {
    return "failed";
  }
  if (!lane.lastSucceededAt) {
    return "pending";
  }

  const age = Date.now() - lane.lastSucceededAt;
  const effectiveIntervalMs = Math.max(lane.intervalMs || 0, 60_000);
  if (age > effectiveIntervalMs * 3) return "stale";
  if (age > effectiveIntervalMs * 1.5) return "delayed";
  return "healthy";
}

function buildProgressState(backlog = {}) {
  const now = Date.now();
  const backlogTotal = Object.values(backlog || {}).reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  const runningLane = Object.values(laneStates).find((lane) => lane.running && lane.lastStartedAt && now - lane.lastStartedAt > STUCK_RUNNING_MS);
  if (runningLane) {
    return {
      state: "stuck-running",
      lane: runningLane.name,
      runningForMs: now - runningLane.lastStartedAt,
      backlogTotal,
      lastMeaningfulProgressAt,
      noProgressForMs: now - lastMeaningfulProgressAt,
    };
  }
  if (backlogTotal > 0 && now - lastMeaningfulProgressAt > NO_PROGRESS_MS) {
    return {
      state: "stalled-no-progress",
      lane: null,
      runningForMs: 0,
      backlogTotal,
      lastMeaningfulProgressAt,
      noProgressForMs: now - lastMeaningfulProgressAt,
    };
  }
  return {
    state: "healthy",
    lane: null,
    runningForMs: 0,
    backlogTotal,
    lastMeaningfulProgressAt,
    noProgressForMs: now - lastMeaningfulProgressAt,
  };
}

function buildSnapshot(data) {
  const fingerprint = (rows, keyFields) =>
    (rows || [])
      .map((row) => keyFields.map((field) => row?.[field] ?? "").join(":"))
      .sort()
      .join("|");

  return {
    sources: fingerprint(data.sources, ["id", "updatedAt", "content"]),
    topics: fingerprint(data.topics, ["id", "updatedAt", "label", "active", "sortOrder"]),
    uploadedFiles: fingerprint(data.uploadedFiles, ["id", "updatedAt", "name", "sizeBytes"]),
    flashcards: fingerprint(data.flashcards, ["id", "updatedAt", "status", "reviewStatus", "fingerprint"]),
    flashcardActions: fingerprint(data.flashcardActions, ["id", "createdAt", "action", "flashcardId", "annotation", "modifiedTitle", "modifiedBody"]),
    feedback: fingerprint(data.feedback, ["id", "createdAt", "action", "nbaItemId", "annotation", "modifiedTitle", "modifiedDescription"]),
    hashtagFeedback: fingerprint(data.hashtagFeedback, ["id", "createdAt", "action", "entityId", "tag"]),
    pendingNBA: fingerprint(data.existingNBA, ["id", "updatedAt", "status", "title"]),
  };
}

function buildCoreSnapshot(snapshot = {}) {
  return {
    sources: snapshot.sources || "",
    topics: snapshot.topics || "",
    uploadedFiles: snapshot.uploadedFiles || "",
  };
}

function buildFeedbackSnapshot(snapshot = {}) {
  return {
    flashcards: snapshot.flashcards || "",
    flashcardActions: snapshot.flashcardActions || "",
    feedback: snapshot.feedback || "",
    pendingNBA: snapshot.pendingNBA || "",
  };
}

function hasDataChanged(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot) return true;
  return Object.keys(nextSnapshot).some((key) => previousSnapshot[key] !== nextSnapshot[key]);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function buildSearchLabel(value) {
  const url = safeUrl(value);
  if (!url) return normalizeText(value);
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").split(".").slice(0, -1).join(" ");
    const pathSegments = parsed.pathname.split("/").filter(Boolean).slice(0, 2).join(" ");
    return normalizeText(`${hostname} ${pathSegments}`) || url;
  } catch {
    return normalizeText(value);
  }
}

function stripHtml(html) {
  return truncate(
    decodeHtmlEntities(
      String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    ),
    6000
  );
}

function parseBooleanBody(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function urlDomain(raw) {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function urlAllowed(raw) {
  if (!raw) return false;
  if (RESEARCH_ALLOWED_HOSTS.length === 0) return true;
  const domain = urlDomain(raw);
  return RESEARCH_ALLOWED_HOSTS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function shortenUrl(raw) {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return raw;
  }
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || RESEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "ChecklistResearchBot/1.0 (+https://checklist.messmass.com)",
        Accept: "text/html, text/plain, application/json;q=0.9, */*;q=0.5",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`request failed with status ${response.status}`);
    }

    const contentType = normalizeText(response.headers.get("content-type")).toLowerCase();
    const body = await response.text();
    return {
      finalUrl: response.url || url,
      contentType,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function decodeDuckDuckGoResultUrl(rawUrl) {
  const decoded = decodeHtmlEntities(rawUrl || "");
  if (decoded.startsWith("//")) {
    return decodeDuckDuckGoResultUrl(`https:${decoded}`);
  }
  const parsed = safeUrl(decoded);
  if (!parsed) return null;
  try {
    const url = new URL(parsed);
    if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") {
      const target = url.searchParams.get("uddg");
      return safeUrl(target);
    }
    return parsed;
  } catch {
    return parsed;
  }
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const regex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const url = decodeDuckDuckGoResultUrl(match[1]);
    if (!url) continue;
    const title = truncate(stripHtml(match[2]), 220);
    if (!title) continue;
    results.push({ url, title });
    if (results.length >= RESEARCH_MAX_RESULTS) break;
  }
  return results;
}

async function searchDuckDuckGo(query) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchText(searchUrl, { timeoutMs: RESEARCH_TIMEOUT_MS });
  return parseDuckDuckGoResults(response.body).map((result) => ({ ...result, query }));
}

function parseFetchedDocument(url, body, contentType) {
  const isText = contentType.startsWith("text/plain") || contentType.includes("json") || contentType.includes("javascript");
  const titleMatch = !isText ? body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null;
  const metaDescriptionMatch = !isText
    ? body.match(/<meta[^+name=["']description["'][^+content=["']([^"']+)["'][^>]*>/i)
    : null;
  const rawText = isText ? body : stripHtml(body);
  const excerpt = truncate(rawText, 1800);
  return {
    url,
    domain: urlDomain(url),
    title: truncate(decodeHtmlEntities(titleMatch?.[1] || ""), 220) || url,
    snippet: truncate(decodeHtmlEntities(metaDescriptionMatch?.[1] || excerpt), 420),
    excerpt,
    contentType,
  };
}

function extractUrlsFromText(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>"')]+/g) || [];
  return unique(matches.map((url) => safeUrl(url)).filter(Boolean));
}

function decodeUploadedFile(file) {
  const mimeType = normalizeText(file?.mimeType).toLowerCase();
  const name = normalizeText(file?.name).toLowerCase();
  const looksLikeArchive =
    mimeType.includes("officedocument") ||
    mimeType.includes("zip") ||
    mimeType.includes("pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".pptx") ||
    name.endsWith(".pdf");
  const isTextLike =
    !looksLikeArchive &&
    (mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    mimeType.includes("xml") ||
    mimeType.includes("javascript") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json") ||
    name.endsWith(".xml"));

  if (!isTextLike || !file?.content) {
    return `File metadata only: ${normalizeText(file?.name)} (${mimeType || "unknown mime"}, ${file?.sizeBytes || 0} bytes).`;
  }

  const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
  const text = buffer.toString("utf8");
  const hasTooManyControlChars = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length > 8;
  if (hasTooManyControlChars) {
    return `File metadata only: ${normalizeText(file?.name)} (${mimeType || "unknown mime"}, ${file?.sizeBytes || 0} bytes).`;
  }
  return truncate(text, 5000);
}

function buildSourceRecords(company, data) {
  const sources = [];

  for (const source of data.sources) {
    const content = normalizeText(source.content);
    const urls = unique(extractUrlsFromText(content).map((url) => safeUrl(url)).filter(Boolean));
    const firstLine = content.split("\n").find(Boolean) || `source-${source.publicId || source.id}`;
    const searchLabel = buildSearchLabel(firstLine);
    const promptBody = [
      `Source content: ${content}`,
      `Entity: ${normalizeText(source.entityTag) || "n/a"}`,
      `Hashtags: ${toArray(source.hashtags).join(", ") || "n/a"}`,
      `AI clusters: ${toArray(source.aiClusters).join(", ") || "n/a"}`,
      `URLs: ${urls.join(", ") || "n/a"}`,
    ].join("\n");
    sources.push({
      sourceType: "SOURCE",
      sourceId: source.id,
      sourcePublicId: source.publicId ?? null,
      sourceName: truncate(firstLine, 160),
      hashtags: normalizeHashtags(source.hashtags),
      relationRole: "PRIMARY",
      urls,
      queryHints: unique([
        `${normalizeText(company.name)} ${searchLabel}`,
        searchLabel,
        normalizeText(source.entityTag),
      ]),
      promptBody,
      fingerprint: hashValue(`SOURCE:${source.id}:${source.updatedAt}:${promptBody}`),
    });
  }

  for (const file of data.uploadedFiles) {
    const extractedContent = decodeUploadedFile(file);
    const urls = extractUrlsFromText(extractedContent);
    const searchLabel = buildSearchLabel(file.name);
    const promptBody = [
      `Uploaded file: ${normalizeText(file.name)}`,
      `Mime type: ${normalizeText(file.mimeType) || "n/a"}`,
      `Hashtags: ${toArray(file.hashtags).join(", ") || "n/a"}`,
      `Extracted content: ${extractedContent}`,
    ].join("\n");
    sources.push({
      sourceType: "FILE",
      sourceId: file.id,
      sourcePublicId: file.publicId ?? null,
      sourceName: file.name || `file-${file.publicId || file.id}`,
      hashtags: normalizeHashtags(file.hashtags),
      relationRole: "PRIMARY",
      urls,
      queryHints: unique([
        urls[0] ? "" : `${normalizeText(company.name)} ${searchLabel}`,
      ]),
      promptBody,
      fingerprint: hashValue(`FILE:${file.id}:${file.updatedAt}:${file.sizeBytes}:${promptBody}`),
    });
  }

  return sources;
}

function buildFactCheckAssessment(source, citations) {
  const usableCitations = citations.filter((citation) => citation.url && citation.domain && citation.excerpt);
  const distinctDomains = new Set(usableCitations.map((citation) => citation.domain));
  let status = "NOT_RUN";

  if (!RESEARCH_ENABLED) {
    status = "NOT_RUN";
  } else if (usableCitations.length >= FACTCHECK_MIN_CITATIONS && distinctDomains.size >= FACTCHECK_MIN_DOMAINS) {
    status = "VERIFIED";
  } else if (usableCitations.length >= FACTCHECK_MIN_CITATIONS) {
    status = "CORROBORATED";
  } else if (usableCitations.length === 1) {
    status = "SINGLE_SOURCE";
  } else if (source.promptBody) {
    status = "SOURCE_GROUNDED";
  } else {
    status = "UNVERIFIED";
  }

  return {
    status,
    citationCount: usableCitations.length,
    distinctDomainCount: distinctDomains.size,
    confidenceCap: FACTCHECK_CAPS[status] || 60,
    minCitationsRequired: FACTCHECK_MIN_CITATIONS,
    minDomainsRequired: FACTCHECK_MIN_DOMAINS,
  };
}

function buildCitationFooter(factCheck, citations) {
  if (!citations.length) {
    return `Fact-check: ${factCheck.status.replace(/_/g, " ").toLowerCase()} (0 external citations).`;
  }
  const sourcesLine = citations
    .slice(0, 3)
    .map((citation) => `${shortenUrl(citation.url)} @ ${isoTimestamp(citation.fetchedAt)}`)
    .join(" | ");
  return [
    `Fact-check: ${factCheck.status.replace(/_/g, " ").toLowerCase()} (${factCheck.citationCount} citations, ${factCheck.distinctDomainCount} domains).`,
    `Sources: ${sourcesLine}`,
  ].join("\n");
}

async function discoverResearch(company, source, focusTopics = []) {
  if (!RESEARCH_ENABLED) {
    return {
      enabled: false,
      provider: null,
      queries: [],
      citations: [],
      errors: [],
      factCheck: buildFactCheckAssessment(source, []),
    };
  }

  const topicQueries = focusTopics.flatMap((topic) => {
    const label = normalizeText(topic.label);
    if (!label) return [];
    return [
      `${normalizeText(company.name)} ${label}`,
      `${normalizeText(company.name)} ${normalizeText(source.sourceName)} ${label}`,
    ];
  });

  const queries = unique(
    toArray(source.queryHints)
      .concat(topicQueries)
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .slice(0, RESEARCH_MAX_QUERIES)
  );
  const candidateUrls = unique(toArray(source.urls).map((entry) => safeUrl(entry)).filter(Boolean));
  const citations = [];
  const errors = [];
  const seenUrls = new Set();

  async function tryFetch(url, meta = {}) {
    if (!url || seenUrls.has(url) || !urlAllowed(url) || citations.length >= RESEARCH_MAX_FETCHES) return;
    seenUrls.add(url);
    try {
      const fetched = await fetchText(url);
      const finalUrl = safeUrl(fetched.finalUrl) || url;
      if (!urlAllowed(finalUrl)) return;
      const parsed = parseFetchedDocument(finalUrl, fetched.body, fetched.contentType);
      citations.push({
        url: parsed.url,
        domain: parsed.domain,
        title: parsed.title,
        snippet: truncate(meta.snippet || parsed.snippet, 320),
        excerpt: parsed.excerpt,
        fetchedAt: isoTimestamp(),
        sourceKind: meta.sourceKind || "search-result",
        query: meta.query || null,
      });
    } catch (error) {
      errors.push({ stage: meta.sourceKind || "fetch", url, message: error.message });
    }
  }

  for (const url of candidateUrls) {
    await tryFetch(url, { sourceKind: "seed-url" });
  }

  if (RESEARCH_PROVIDER === "duckduckgo-html") {
    for (const query of queries) {
      if (citations.length >= RESEARCH_MAX_FETCHES) break;
      try {
        const results = await searchDuckDuckGo(query);
        for (const result of results) {
          if (citations.length >= RESEARCH_MAX_FETCHES) break;
          await tryFetch(result.url, {
            sourceKind: "search-result",
            query,
            snippet: result.title,
          });
        }
      } catch (error) {
        errors.push({ stage: "search", query, message: error.message });
      }
    }
  } else if (RESEARCH_PROVIDER !== "none") {
    errors.push({ stage: "config", message: `Unsupported research provider: ${RESEARCH_PROVIDER}` });
  }

  const dedupedCitations = [];
  const seenCitationUrls = new Set();
  for (const citation of citations) {
    if (!citation.url || seenCitationUrls.has(citation.url)) continue;
    seenCitationUrls.add(citation.url);
    dedupedCitations.push(citation);
  }

  return {
    enabled: true,
    provider: RESEARCH_PROVIDER,
    queries,
    citations: dedupedCitations,
    errors,
    factCheck: buildFactCheckAssessment(source, dedupedCitations),
  };
}

function buildFlashcardEvidence(source, generated, research) {
  return {
    version: "research-v1",
    source: {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourcePublicId: source.sourcePublicId ?? null,
      sourceName: source.sourceName,
      fingerprint: source.fingerprint,
      excerpt: truncate(source.promptBody, 700),
    },
    research: {
      enabled: research.enabled,
      provider: research.provider,
      queries: research.queries,
      runAt: isoTimestamp(),
      refreshHours: RESEARCH_REFRESH_HOURS,
      factCheck: research.factCheck,
      errors: research.errors,
    },
    citations: research.citations.map((citation) => ({
      url: citation.url,
      domain: citation.domain,
      title: citation.title,
      snippet: citation.snippet,
      fetchedAt: citation.fetchedAt,
      sourceKind: citation.sourceKind,
      query: citation.query,
    })),
    generated: {
      title: generated.title,
      body: generated.body,
      kind: generated.kind,
      confidence: generated.confidence,
      impact: generated.impact,
      weight: generated.weight,
    },
  };
}

// Logic removed as it was refactored above into startup block

async function ensureDbReady() {
  if (dbReady && prisma) return true;
  try {
    await connectDB();
    return true;
  } catch (error) {
    dbReady = false;
    dbBlocker = error.message;
    lastPollError = error.message;
    console.error("Checklist worker DB unavailable:", error.message);
    return false;
  }
}

async function ensureModelReady() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Ollama tags request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const names = (payload.models || []).map((model) => model?.name).filter(Boolean);
    if (!names.includes(OLLAMA_MODEL)) {
      throw new Error(`Required Ollama model ${OLLAMA_MODEL} is not installed`);
    }
    modelReady = true;
    modelBlocker = null;
    return true;
  } catch (error) {
    modelReady = false;
    modelBlocker = error.message;
    lastPollError = error.message;
    console.error("Checklist worker model unavailable:", error.message);
    return false;
  }
}

async function ensureOllamaModelReady(modelName, { updatePrimary = false } = {}) {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Ollama tags request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const names = (payload.models || []).map((model) => model?.name).filter(Boolean);
    if (!names.includes(modelName)) {
      throw new Error(`Required Ollama model ${modelName} is not installed`);
    }
    if (updatePrimary && modelName === OLLAMA_MODEL) {
      modelReady = true;
      modelBlocker = null;
    }
    return true;
  } catch (error) {
    if (updatePrimary && modelName === OLLAMA_MODEL) {
      modelReady = false;
      modelBlocker = error.message;
      lastPollError = error.message;
    }
    throw error;
  }
}

async function callOllama(messages, options = {}) {
  const model = options.model || OLLAMA_MODEL;
  const timeoutMs = options.timeoutMs || OLLAMA_TIMEOUT_MS;
  if (!(await ensureModelReady())) {
    throw new Error(modelBlocker || "Ollama model unavailable");
  }
  if (model !== OLLAMA_MODEL) {
    await ensureOllamaModelReady(model);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages,
        ...(options.format ? { format: options.format } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Ollama chat timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Ollama chat failed with status ${response.status}`);
  }

  return payload?.message?.content || "";
}

async function callOllamaJson(systemPrompt, userPrompt, options = {}) {
  const content = await callOllama([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], {
    model: options.model,
    timeoutMs: options.timeoutMs,
    format: "json",
  });
  const candidate = extractJsonCandidate(content);
  if (!candidate) {
    throw new Error("Ollama returned no JSON content");
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = await callOllama([
      {
        role: "system",
        content:
          "Repair the following payload into valid JSON. Return only valid JSON with no markdown fences or commentary.",
      },
      { role: "user", content: candidate },
    ], {
      model: options.model,
      timeoutMs: options.timeoutMs,
      format: "json",
    });
    const repairedCandidate = extractJsonCandidate(repaired);
    if (!repairedCandidate) {
      throw new Error(`Failed to parse Ollama JSON response: ${error.message}`);
    }
    try {
      return JSON.parse(repairedCandidate);
    } catch (repairError) {
      throw new Error(`Failed to parse Ollama JSON response: ${repairError.message}`);
    }
  }
}

function deriveFlashcardHashtags(source, generated) {
  return mergeHashtags(
    source.hashtags,
    deriveKeywordHashtags(source.sourceName, generated.title, generated.body),
  ).slice(0, 10);
}

function deriveChecklistHashtags(recommendation, sourceFlashcards) {
  return mergeHashtags(
    recommendation.hashtags,
    ...sourceFlashcards.map((card) => card.hashtags),
    deriveKeywordHashtags(recommendation.title, recommendation.description),
  ).slice(0, 10);
}

function computeFlashcardConfidence(source, research, rawConfidence, synthesisWeight = 1) {
  const sourceHashtags = normalizeHashtags(source.hashtags);
  const citationCount = Number(research?.factCheck?.citationCount || 0);
  const distinctDomains = Number(research?.factCheck?.distinctDomainCount || 0);
  const bodySignal = Math.min(10, Math.round(normalizeText(source.promptBody).length / 500));
  const tagSignal = Math.min(8, sourceHashtags.length * 2);
  const researchSignal = citationCount * 4 + distinctDomains * 3;
  const synthesisSignal = Math.max(0, (synthesisWeight - 1) * 4);
  const adjusted = rawConfidence + bodySignal + tagSignal + researchSignal + synthesisSignal;
  const cap = Number(research?.factCheck?.confidenceCap || 78);
  return Math.min(clampInt(adjusted, rawConfidence, 1, 100), cap);
}

function computeRecommendationIceScore(recommendation) {
  return recommendation.impact * (recommendation.confidence / 100) * recommendation.ease * 10;
}

function scoreFlashcardCandidate(candidate) {
  return (Number(candidate.weight || 0) * 0.45) + (Number(candidate.impact || 0) * 0.35) + (Number(candidate.confidence || 0) * 0.2);
}

function toFeedbackExcerpt(value, max = 280) {
  return truncate(normalizeText(value) || "", max);
}

function compactFeedbackRecord(row) {
  return {
    taskPublicId: row.taskPublicId ?? null,
    taskTitle: truncate(row.taskTitle, 160),
    taskDescription: truncate(row.taskDescription, 320),
    action: row.action,
    annotation: toFeedbackExcerpt(row.annotation, 320),
    createdAt: row.createdAt,
  };
}

function summarizeFeedbackPatterns(rows = []) {
  const termCounts = new Map();
  const hashtagCounts = new Map();

  for (const row of rows) {
    for (const token of tokenizeText([
      row.taskTitle,
      row.taskDescription,
      row.annotation,
    ].join(" "))) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }
    for (const tag of normalizeHashtags(row.hashtags)) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
    }
  }

  const topTerms = [...termCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([term, count]) => ({ term, count }));
  const topHashtags = [...hashtagCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  return { topTerms, topHashtags };
}

function buildFlashcardActionIndex(rows) {
  const byFlashcardId = new Map();
  for (const row of rows || []) {
    if (!row?.flashcardId) continue;
    if (!byFlashcardId.has(row.flashcardId)) {
      byFlashcardId.set(row.flashcardId, []);
    }
    byFlashcardId.get(row.flashcardId).push({
      action: row.action,
      annotation: toFeedbackExcerpt(row.annotation),
      modifiedTitle: toFeedbackExcerpt(row.modifiedTitle, 180),
      modifiedBody: toFeedbackExcerpt(row.modifiedBody, 400),
      createdAt: isoTimestamp(row.createdAt),
    });
  }
  return byFlashcardId;
}

function buildTaskFeedbackIndex(existingNBA, feedbackRows) {
  const itemById = new Map((existingNBA || []).map((item) => [item.id, item]));
  const byFlashcardId = new Map();
  const examples = [];

  for (const row of feedbackRows || []) {
    const item = itemById.get(row.nbaItemId);
    if (!item) continue;
    const payload = {
      taskPublicId: item.publicId ?? null,
      taskTitle: truncate(normalizeText(row.modifiedTitle) || normalizeText(item.title) || "Untitled task", 180),
      taskDescription: truncate(normalizeText(row.modifiedDescription) || normalizeText(item.description) || "", 500),
      hashtags: normalizeHashtags(item.hashtags),
      action: row.action,
      annotation: toFeedbackExcerpt(row.annotation, 500),
      createdAt: isoTimestamp(row.createdAt),
    };
    examples.push(payload);

    for (const flashcardId of item.sourceFlashcardIds || []) {
      if (!byFlashcardId.has(flashcardId)) {
        byFlashcardId.set(flashcardId, []);
      }
      byFlashcardId.get(flashcardId).push(payload);
    }
  }

  return {
    byFlashcardId,
    examples: examples.slice(0, 400),
  };
}

function selectRelevantTaskFeedback(taskFeedbackIndex, flashcardIds = [], contextText = "") {
  const collected = [];
  for (const flashcardId of flashcardIds) {
    const rows = taskFeedbackIndex.byFlashcardId.get(flashcardId) || [];
    collected.push(...rows);
  }

  const seen = new Set();
  const uniqueCollected = collected.filter((row) => {
    const key = `${row.taskPublicId || "none"}:${row.action}:${row.createdAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ranked = uniqueCollected
    .map((row) => ({
      row,
      score: overlapScore(contextText, [row.taskTitle, row.taskDescription, row.annotation, ...(row.hashtags || [])].join(" ")),
    }))
    .sort((left, right) => right.score - left.score);

  const accepted = ranked
    .filter((entry) => (entry.row.action === "ACCEPT" || entry.row.action === "MODIFY_ACCEPT") && entry.score > 0)
    .slice(0, 8)
    .map((entry) => compactFeedbackRecord(entry.row));
  const declined = ranked
    .filter((entry) => entry.row.action === "DECLINE" && entry.score > 0)
    .slice(0, 8)
    .map((entry) => compactFeedbackRecord(entry.row));

  return {
    accepted,
    declined,
  };
}

function companyFeedbackPatterns(taskFeedbackIndex) {
  const acceptedRows = (taskFeedbackIndex.examples || [])
    .filter((row) => row.action === "ACCEPT" || row.action === "MODIFY_ACCEPT")
    .slice(0, 24);
  const declinedRows = (taskFeedbackIndex.examples || [])
    .filter((row) => row.action === "DECLINE")
    .slice(0, 24);
  return {
    acceptedExamples: acceptedRows.slice(0, 12).map(compactFeedbackRecord),
    declinedExamples: declinedRows.slice(0, 12).map(compactFeedbackRecord),
    acceptedPatterns: summarizeFeedbackPatterns(acceptedRows),
    declinedPatterns: summarizeFeedbackPatterns(declinedRows),
  };
}

function buildFeedbackContext(taskFeedbackIndex, flashcardIds = [], contextText = "") {
  const related = selectRelevantTaskFeedback(taskFeedbackIndex, flashcardIds, contextText);
  const company = companyFeedbackPatterns(taskFeedbackIndex);
  return {
    related,
    company,
  };
}

async function saveKnowledge(companyId, data) {
  const file = path.join(KNOWLEDGE_DIR, `${companyId}.json`);
  let existing = {};
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      existing = {};
    }
  }
  const updated = { ...existing, ...data, updatedAt: isoTimestamp() };
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
}

async function loadKnowledge(companyId) {
  const file = path.join(KNOWLEDGE_DIR, `${companyId}.json`);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function appendRuntimeMetric(entry) {
  const payload = {
    recordedAt: isoTimestamp(),
    ...entry,
  };
  fs.appendFileSync(RUNTIME_METRICS_FILE, `${JSON.stringify(payload)}\n`);
}

function markMeaningfulProgress(entry = {}) {
  lastMeaningfulProgressAt = Date.now();
  appendRuntimeMetric({
    type: "meaningful-progress",
    ...entry,
  });
}

function readNdjsonLatest(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const byId = new Map();
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (!row?.id) continue;
      byId.set(row.id, row);
    } catch {
      // Keep runtime storage append-only and resilient to partial writes.
    }
  }
  return [...byId.values()];
}

function appendFailsafeQueueEvent(entry) {
  fs.appendFileSync(FAILSAFE_QUEUE_FILE, `${JSON.stringify({ updatedAt: isoTimestamp(), ...entry })}\n`);
}

function listFailsafeJobs({ companyId = null, status = null } = {}) {
  return readNdjsonLatest(FAILSAFE_QUEUE_FILE)
    .filter((job) => !companyId || job.companyId === companyId)
    .filter((job) => !status || job.status === status)
    .sort((left, right) => new Date(left.updatedAt || left.createdAt || 0).getTime() - new Date(right.updatedAt || right.createdAt || 0).getTime());
}

function enqueueFailsafeJob(payload) {
  const job = {
    id: crypto.randomUUID(),
    createdAt: isoTimestamp(),
    status: "PENDING",
    attempts: 0,
    ...payload,
  };
  appendFailsafeQueueEvent(job);
  appendRuntimeMetric({
    type: "failsafe-queue",
    action: "enqueued",
    companyId: job.companyId,
    queueKind: job.kind,
    jobId: job.id,
  });
  return job;
}

function updateFailsafeJob(job, patch) {
  const next = {
    ...job,
    ...patch,
    updatedAt: isoTimestamp(),
  };
  appendFailsafeQueueEvent(next);
  appendRuntimeMetric({
    type: "failsafe-queue",
    action: next.status?.toLowerCase() || "updated",
    companyId: next.companyId,
    queueKind: next.kind,
    jobId: next.id,
    attempts: next.attempts,
    error: next.lastError || null,
  });
  return next;
}

async function attemptFailsafeModels(prompts, parser, models = FAILSAFE_MODELS) {
  const tried = [];
  const errors = [];
  for (const model of models) {
    try {
      tried.push(model);
      const raw = await callOllamaJson(prompts.systemPrompt, prompts.userPrompt, {
        model,
        timeoutMs: FAILSAFE_TIMEOUT_MS,
      });
      const parsed = parser(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        errors.push(`${model}: returned no usable candidates`);
        continue;
      }
      return { parsed, model, tried, errors };
    } catch (error) {
      errors.push(`${model}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | ") || "No fail-safe model succeeded");
}

function parseQueuedOutput(job, raw) {
  const payload = job?.payload || {};
  switch (job?.kind) {
    case "company-recommendations":
    case "task-revisit":
      return parseRecommendationCandidates(raw, payload.cards || []);
    default:
      throw new Error(`Unsupported queued job kind: ${job?.kind || "unknown"}`);
  }
}

async function persistQueuedOutput(job, parsed) {
  if (job.kind === "company-recommendations") {
    const data = await getAllData(job.companyId);
    await persistRecommendationCandidates(
      job.companyId,
      data.existingNBA,
      data.flashcards.filter((card) => card.status === "ACTIVE"),
      parsed,
    );
    return;
  }
  if (job.kind === "task-revisit") {
    const data = await getAllData(job.companyId);
    const task = await prisma.nBAItem.findUnique({ where: { id: job.payload?.taskId } });
    if (!task) throw new Error("task-missing");
    const sourceCards = data.flashcards.filter((card) =>
      task.sourceFlashcardIds.includes(card.id) && card.status === "ACTIVE",
    );
    await persistTaskRevisitCandidates(task, sourceCards, parsed);
    return;
  }
  throw new Error(`Unsupported queued persistence kind: ${job.kind}`);
}

function buildFeedbackMemorySummary(data) {
  const taskFeedbackIndex = buildTaskFeedbackIndex(data.existingNBA, data.feedback);
  const flashcardActionIndex = buildFlashcardActionIndex(data.flashcardActions);
  const recentFlashcardActions = (data.flashcardActions || []).slice(0, 40).map((row) => ({
    flashcardId: row.flashcardId,
    action: row.action,
    annotation: toFeedbackExcerpt(row.annotation, 280),
    modifiedTitle: toFeedbackExcerpt(row.modifiedTitle, 180),
    modifiedBody: toFeedbackExcerpt(row.modifiedBody, 280),
    createdAt: isoTimestamp(row.createdAt),
  }));

  return {
    capturedAt: isoTimestamp(),
    totals: {
      taskFeedback: data.feedback.length,
      flashcardActions: data.flashcardActions.length,
      acceptedTaskFeedback: (data.feedback || []).filter((row) => row.action === "ACCEPT" || row.action === "MODIFY_ACCEPT").length,
      declinedTaskFeedback: (data.feedback || []).filter((row) => row.action === "DECLINE").length,
    },
    companyPatterns: companyFeedbackPatterns(taskFeedbackIndex),
    recentTaskFeedback: (taskFeedbackIndex.examples || []).slice(0, 24).map(compactFeedbackRecord),
    recentFlashcardActions,
    flashcardActionCoverage: {
      flashcardsWithActions: flashcardActionIndex.size,
    },
  };
}

function buildCompanyCycleMetric(companyId, cycleResult, durationMs) {
  const pollResult = cycleResult?.poll?.result || {};
  const processResult = pollResult?.result || {};
  const flashcardCreated = Number(processResult?.flashcards?.created || 0);
  const flashcardUpdated = Number(processResult?.flashcards?.updated || 0);
  const taskCreated = Number(processResult?.recommendations?.created || 0);
  const taskUpdated = Number(processResult?.recommendations?.updated || 0);
  const dataCreated = Number(cycleResult?.researchHarvest?.result?.createdSources || 0);
  const cardsCreated = flashcardCreated + taskCreated + dataCreated;
  return {
    type: "company-cycle-summary",
    companyId,
    durationMs,
    cardsCreated,
    flashcardsCreated: flashcardCreated,
    flashcardsUpdated: flashcardUpdated,
    taskcardsCreated: taskCreated,
    taskcardsUpdated: taskUpdated,
    datacardsCreated: dataCreated,
    companiesProcessedFully: cycleResult?.processed ? 1 : 0,
    queueProcessed: Number(cycleResult?.failsafeQueue?.result?.processed || 0),
  };
}

async function recordCompanyLaneRun(companyId, laneName, result = {}, durationMs = null, error = null) {
  if (!companyId) return;
  const existing = await loadKnowledge(companyId);
  const scheduler = {
    ...(existing.scheduler || {}),
    [laneName]: {
      lastRunAt: isoTimestamp(),
      durationMs,
      error: error ? String(error.message || error) : null,
      result: result || null,
    },
  };
  await saveKnowledge(companyId, { scheduler });
  appendRuntimeMetric({
    type: "company-lane-run",
    companyId,
    lane: laneName,
    durationMs,
    error: error ? String(error.message || error) : null,
    result,
  });
}

async function selectNextCompanyForLane(laneName, cooldownMs = 0) {
  const companies = await prisma.company.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (companies.length === 0) {
    return { companyId: null, idleDelayMs: COMPANY_LANE_IDLE_DELAY_MS };
  }

  let selected = null;
  let selectedLastRun = Number.POSITIVE_INFINITY;
  let earliestNextDueAt = Number.POSITIVE_INFINITY;
  const now = Date.now();

  for (const row of companies) {
    const knowledge = await loadKnowledge(row.id);
    const lastRunAt = knowledge?.scheduler?.[laneName]?.lastRunAt
      ? new Date(knowledge.scheduler[laneName].lastRunAt).getTime()
      : 0;
    const dueAt = lastRunAt + cooldownMs;
    earliestNextDueAt = Math.min(earliestNextDueAt, dueAt);
    if (dueAt > now) {
      continue;
    }
    if (lastRunAt < selectedLastRun) {
      selected = row.id;
      selectedLastRun = lastRunAt;
    }
  }

  if (selected) {
    return { companyId: selected, idleDelayMs: COMPANY_LANE_CONTINUE_DELAY_MS };
  }

  const idleDelayMs = Number.isFinite(earliestNextDueAt)
    ? Math.max(earliestNextDueAt - now, COMPANY_LANE_IDLE_DELAY_MS)
    : COMPANY_LANE_IDLE_DELAY_MS;
  return { companyId: null, idleDelayMs };
}

function isResearchRefreshDue(knowledge) {
  if (!RESEARCH_ENABLED) return false;
  const lastResearchAt = knowledge?.research?.lastRunAt || knowledge?.updatedAt;
  if (!lastResearchAt) return true;
  const lastMs = new Date(lastResearchAt).getTime();
  if (!Number.isFinite(lastMs)) return true;
  return Date.now() - lastMs >= RESEARCH_REFRESH_HOURS * 3_600_000;
}

async function getAllData(companyId) {
  await backfillMissingDerivedPublicIds(companyId);
  await backfillUnifiedSources(companyId);
  const [
    company,
    sources,
    topics,
    uploadedFiles,
    flashcards,
    flashcardActions,
    feedback,
    hashtagFeedback,
    nba,
  ] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.source.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.topic.findMany({ where: { companyId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.uploadedSourceFile.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.flashcard.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.flashcardAction.findMany({
      where: { flashcard: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.feedback.findMany({
      where: { nbaItem: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.hashtagFeedback.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.nBAItem.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
  ]);

  return {
    company,
    sources,
    topics,
    uploadedFiles,
    flashcards,
    flashcardActions,
    feedback,
    hashtagFeedback,
    existingNBA: nba,
  };
}

function buildHashtagFeedbackIndex(feedbackRows) {
  const suppressedByEntity = new Map();
  const suppressedGlobally = new Set();
  const existingKeys = new Set();

  for (const row of feedbackRows || []) {
    const tag = normalizeHashtag(row.tag);
    if (tag) {
      existingKeys.add(`${row.entityType}:${row.entityId}:${row.action}:${tag}`);
    }
    if (!tag || row.action !== "USER_REMOVE") continue;
    suppressedGlobally.add(tag);
    const key = `${row.entityType}:${row.entityId}`;
    if (!suppressedByEntity.has(key)) {
      suppressedByEntity.set(key, new Set());
    }
    suppressedByEntity.get(key).add(tag);
  }

  return { suppressedByEntity, suppressedGlobally, existingKeys };
}

function buildHashtagEntityKey(entityType, entityId) {
  return `${entityType}:${entityId}`;
}

function normalizeTopicLabel(value) {
  return normalizeText(value).toLowerCase();
}

function topicMatchesSource(topic, source) {
  const label = normalizeTopicLabel(topic.label);
  if (!label) return false;
  const haystack = normalizeLoose([
    source.sourceName,
    source.promptBody,
    ...(source.hashtags || []),
  ].join(" "));
  return haystack.includes(label) || label.split(/\s+/).every((token) => token.length > 2 && haystack.includes(token));
}

function topicMatchesFlashcard(topic, flashcard) {
  const label = normalizeTopicLabel(topic.label);
  if (!label) return false;
  const haystack = normalizeLoose([
    flashcard.title,
    flashcard.body,
    ...(flashcard.hashtags || []),
    flashcard.userAnnotation,
  ].join(" "));
  return haystack.includes(label) || label.split(/\s+/).every((token) => token.length > 2 && haystack.includes(token));
}

function scoreTopicCoverage(topic, flashcards, checklistItems) {
  const label = normalizeTopicLabel(topic.label);
  const flashcardMatches = flashcards.filter((card) => {
    const haystack = normalizeLoose([card.title, card.body, ...(card.hashtags || [])].join(" "));
    return haystack.includes(label);
  }).length;
  const pendingMatches = checklistItems.filter((item) => {
    if (item.status !== "PENDING") return false;
    const haystack = normalizeLoose([item.title, item.description, ...(item.hashtags || [])].join(" "));
    return haystack.includes(label);
  }).length;
  return {
    flashcardMatches,
    pendingMatches,
    pressure: Math.max(0, 3 - flashcardMatches) + Math.max(0, 2 - pendingMatches),
  };
}

function selectResearchTopics(data, limit = 5) {
  const activeTopics = (data.topics || []).filter((topic) => topic.active);
  const explicitTopics = activeTopics
    .map((topic) => ({
      ...topic,
      coverage: scoreTopicCoverage(topic, data.flashcards || [], data.existingNBA || []),
    }))
    .sort((left, right) =>
      right.coverage.pressure - left.coverage.pressure ||
      left.sortOrder - right.sortOrder ||
      left.label.localeCompare(right.label),
    )
    .slice(0, limit);

  if (explicitTopics.length > 0) {
    return explicitTopics;
  }

  const hashtagCounts = new Map();
  for (const source of [
    ...(data.sources || []),
    ...(data.uploadedFiles || []),
  ]) {
    for (const tag of normalizeHashtags(source.hashtags)) {
      hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
    }
  }

  return [...hashtagCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([tag], index) => ({
      id: `derived-${tag}`,
      companyId: data.company?.id,
      label: tag.replace(/^#/, "").replace(/-/g, " "),
      active: true,
      sortOrder: index,
      coverage: { flashcardMatches: 0, pendingMatches: 0, pressure: 1 },
    }));
}

async function logHashtagMaintenanceEvent({ companyId, entityType, entityId, status, note }) {
  const payload = {
    companyId,
    entityType,
    entityId,
    status,
    note: truncate(note, 1000),
    createdBy: "local-ai",
  };
  console.log(JSON.stringify({ kind: "hashtag-maintenance", ...payload }));
  await prisma.hashtagMaintenanceEvent.create({ data: payload });
}

function buildHashtagMaintenanceInput(record) {
  const fields = [
    record.name,
    record.entityTag,
    record.label,
    record.title,
    record.description,
    record.body,
    record.notes,
    record.content,
    ...(record.urls || []),
  ].filter(Boolean);
  return truncate(fields.join("\n"), 2200);
}

function buildHashtagCandidateTags(company, record) {
  return unique([
    ...deriveKeywordHashtags(
      company?.name,
      record.name,
      record.label,
      record.title,
      record.entityTag,
      record.description,
      record.notes,
      record.body,
      record.content,
      ...(record.urls || []),
    ),
    ...normalizeHashtags(record.hashtags),
  ]).slice(0, 16);
}

async function evaluateEntityHashtags(company, record, feedbackIndex) {
  const existingTags = normalizeHashtags(record.hashtags);
  const entitySuppressed = feedbackIndex.suppressedByEntity.get(buildHashtagEntityKey(record.entityType, record.id)) || new Set();
  const suppressedTags = new Set([...feedbackIndex.suppressedGlobally, ...entitySuppressed]);

  try {
    const candidateTags = buildHashtagCandidateTags(company, record);

    const raw = await callOllamaJson(
      [
        "You evaluate business hashtags for one entity record.",
        "Return strict JSON with acceptedHashtags, rejectedHashtags, addedHashtags, finalHashtags.",
        "Keep only tags that are relevant to retrieval, clustering, and downstream task generation.",
        "Do not output generic source-type tags.",
        "It is valid to keep the current hashtags unchanged and return no additions.",
        "finalHashtags should be unique lowercase hashtags.",
      ].join(" "),
      [
        `Company: ${company?.name || "Unknown company"}`,
        `Entity type: ${record.entityType}`,
        `Entity name: ${record.name || record.label || record.title || "Untitled"}`,
        `Existing hashtags: ${existingTags.join(", ") || "none"}`,
        `Suppressed hashtags: ${[...suppressedTags].join(", ") || "none"}`,
        `Candidate hashtags: ${candidateTags.join(", ") || "none"}`,
        `Entity tag: ${normalizeText(record.entityTag) || "n/a"}`,
        `Entity content: ${buildHashtagMaintenanceInput(record) || "n/a"}`,
      ].join("\n"),
    );

    return {
      acceptedHashtags: normalizeHashtags(raw.acceptedHashtags),
      rejectedHashtags: normalizeHashtags(raw.rejectedHashtags),
      addedHashtags: normalizeHashtags(raw.addedHashtags).filter((tag) => !existingTags.includes(tag)),
      finalHashtags: normalizeHashtags(raw.finalHashtags).filter((tag) => !suppressedTags.has(tag)).slice(0, 10),
    };
  } catch (error) {
    throw new Error(`Hashtag evaluation failed: ${error.message}`);
  }
}

function buildHashtagMaintenanceRecords(data) {
  return [
    ...(data.sources || []).map((source) => ({
      model: "source",
      entityType: "SOURCE",
      id: source.id,
      companyId: source.companyId,
      current: normalizeHashtags(source.hashtags),
      hashtagMaintainedAt: source.hashtagMaintainedAt,
      hashtagEvaluationPending: source.hashtagEvaluationPending,
      payload: {
        id: source.id,
        entityType: "SOURCE",
        name: source.entityTag || source.content.split("\n").find(Boolean) || `source-${source.publicId || source.id}`,
        entityTag: source.entityTag,
        content: source.content,
        hashtags: source.hashtags,
      },
    })),
    ...(data.uploadedFiles || []).map((file) => ({
      model: "uploadedSourceFile",
      entityType: "FILE",
      id: file.id,
      companyId: file.companyId,
      current: normalizeHashtags(file.hashtags),
      hashtagMaintainedAt: file.hashtagMaintainedAt,
      hashtagEvaluationPending: file.hashtagEvaluationPending,
      payload: {
        id: file.id,
        entityType: "FILE",
        name: file.name,
        entityTag: file.entityTag,
        content: decodeUploadedFile(file),
        hashtags: file.hashtags,
      },
    })),
    ...(data.flashcards || []).map((card) => ({
      model: "flashcard",
      entityType: "FLASHCARD",
      id: card.id,
      companyId: card.companyId,
      current: normalizeHashtags(card.hashtags),
      hashtagMaintainedAt: card.hashtagMaintainedAt,
      hashtagEvaluationPending: card.hashtagEvaluationPending,
      payload: {
        id: card.id,
        entityType: "FLASHCARD",
        title: card.title,
        body: card.body,
        hashtags: card.hashtags,
      },
    })),
    ...(data.existingNBA || []).map((item) => ({
      model: "nBAItem",
      entityType: "CHECKLIST",
      id: item.id,
      companyId: item.companyId,
      current: normalizeHashtags(item.hashtags),
      hashtagMaintainedAt: item.hashtagMaintainedAt,
      hashtagEvaluationPending: item.hashtagEvaluationPending,
      payload: {
        id: item.id,
        entityType: "CHECKLIST",
        title: item.title,
        description: item.description,
        hashtags: item.hashtags,
      },
    })),
    ...(data.topics || []).map((topic) => ({
      model: "topic",
      entityType: "TOPIC",
      id: topic.id,
      companyId: topic.companyId,
      current: normalizeHashtags(topic.hashtags),
      hashtagMaintainedAt: topic.hashtagMaintainedAt,
      hashtagEvaluationPending: topic.hashtagEvaluationPending,
      payload: {
        id: topic.id,
        entityType: "TOPIC",
        label: topic.label,
        notes: topic.notes,
        hashtags: topic.hashtags,
      },
    })),
  ];
}

function hashtagMaintenancePriority(record) {
  const maintainedAt = record.hashtagMaintainedAt ? new Date(record.hashtagMaintainedAt).getTime() : 0;
  const pendingBoost = record.hashtagEvaluationPending ? -1 : 0;
  return [pendingBoost, maintainedAt];
}

async function syncHashtagMaintenance(company, data) {
  const feedbackIndex = buildHashtagFeedbackIndex(data.hashtagFeedback);
  const updates = buildHashtagMaintenanceRecords(data)
    .sort((left, right) => {
      const [leftPending, leftTime] = hashtagMaintenancePriority(left);
      const [rightPending, rightTime] = hashtagMaintenancePriority(right);
      return leftPending - rightPending || leftTime - rightTime || left.id.localeCompare(right.id);
    })
    .slice(0, HASHTAG_MAINTENANCE_BATCH_SIZE);

  let changed = 0;
  for (const update of updates) {
    try {
      const payload = await evaluateEntityHashtags(company, update.payload, feedbackIndex);
      const nextHashtags = payload.finalHashtags;
      const sameHashtags = JSON.stringify(update.current) === JSON.stringify(nextHashtags);

      await prisma[update.model].update({
        where: { id: update.id },
        data: {
          hashtags: sameHashtags ? update.current : nextHashtags,
          hashtagMaintainedAt: new Date(),
          hashtagEvaluationPending: false,
          lastHashtagError: null,
          updatedAt: new Date(),
        },
      });

      for (const tag of payload.addedHashtags) {
        const key = `${update.entityType}:${update.id}:AI_ADD:${tag}`;
        if (feedbackIndex.existingKeys.has(key)) continue;
        await prisma.hashtagFeedback.create({
          data: {
            companyId: company.id,
            entityType: update.entityType,
            entityId: update.id,
            tag,
            action: "AI_ADD",
            createdBy: "local-ai",
          },
        });
        feedbackIndex.existingKeys.add(key);
      }

      for (const tag of payload.rejectedHashtags) {
        const key = `${update.entityType}:${update.id}:AI_REJECT:${tag}`;
        if (feedbackIndex.existingKeys.has(key)) continue;
        await prisma.hashtagFeedback.create({
          data: {
            companyId: company.id,
            entityType: update.entityType,
            entityId: update.id,
            tag,
            action: "AI_REJECT",
            createdBy: "local-ai",
          },
        });
        feedbackIndex.existingKeys.add(key);
      }

      await logHashtagMaintenanceEvent({
        companyId: update.companyId,
        entityType: update.entityType,
        entityId: update.id,
        status: "SUCCESS",
        note: sameHashtags ? "Hashtags reviewed with no changes." : `Applied ${payload.addedHashtags.length} additions and ${payload.rejectedHashtags.length} rejections.`,
      });

      if (!sameHashtags) changed += 1;
      continue;
    } catch (error) {
      await prisma[update.model].update({
        where: { id: update.id },
        data: {
          hashtagEvaluationPending: true,
          lastHashtagError: truncate(error.message, 800),
          updatedAt: new Date(),
        },
      });
      await logHashtagMaintenanceEvent({
        companyId: update.companyId,
        entityType: update.entityType,
        entityId: update.id,
        status: "FAILED",
        note: error.message,
      });
    }
  }

  return changed;
}

function buildFlashcardGenerationPrompts(company, source, research, feedbackContext = {}) {
  const systemPrompt = [
    "You generate zero or more Checklist flashcards as strict JSON.",
    "Return a JSON array.",
    "Each item must be an object with keys: title, body, kind, confidence, impact, weight, hashtags.",
    "Allowed kinds: SUMMARY, EXPLANATION, COMPARISON, NEWS, CONCLUSION, EVALUATION, OPINION, JUDGMENT, RECOMMENDATION, RESEARCH, FORECAST, STOCK, GOSSIP, PRICE.",
    "Use concise business language.",
    "Ground the output in the provided first-party source and public evidence only.",
    "Treat direct user feedback as the highest-priority correction signal.",
    "If prior user annotations, accepts, declines, or manual edits exist, align to them and avoid repeating rejected framing.",
    "If public evidence is present, reflect that in the body without inventing claims.",
    "It is valid to return an empty array when the input is weak, unclear, redundant, not evidence-backed, or not useful enough to justify a flashcard.",
    "Do not force a result from low-quality input.",
    "One source may justify multiple distinct flashcards if it contains multiple separable grounded ideas.",
    "hashtags must be relevant retrieval and grouping tags only.",
    "confidence, impact, and weight must be integers from 1 to 100.",
    "Do not include markdown fences or extra text.",
  ].join(" ");

  const evidencePayload = {
    firstPartySource: {
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      excerpt: truncate(source.promptBody, 1200),
    },
    publicEvidence: research.citations.map((citation) => ({
      url: citation.url,
      domain: citation.domain,
      title: citation.title,
      snippet: citation.snippet,
      excerpt: truncate(citation.excerpt, 900),
    })),
    factCheck: research.factCheck,
  };

  const userPrompt = [
    `Company: ${company.name}`,
    `Industry: ${normalizeText(company.industry) || "n/a"}`,
    `Main goal: ${normalizeText(company.mainGoal) || "n/a"}`,
    `Source type: ${source.sourceType}`,
    `Source name: ${source.sourceName}`,
    `Source hashtags: ${normalizeHashtags(source.hashtags).join(", ") || "none"}`,
    "",
    "Direct user feedback history:",
    JSON.stringify(feedbackContext, null, 2),
    "",
    JSON.stringify(evidencePayload, null, 2),
  ].join("\n");

  return { systemPrompt, userPrompt };
}

function parseFlashcardCandidates(raw, source, research) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const kind = normalizeText(item.kind || (research.citations.length > 0 ? "RESEARCH" : "SUMMARY")).toUpperCase();
      const rawBody = truncate(item.body || "", 900);
      const body = truncate(`${rawBody}\n\n${buildCitationFooter(research.factCheck, research.citations)}`, 1200);
      const modelConfidence = parseBoundedInt(item.confidence, 1, 100);
      const impact = parseBoundedInt(item.impact, 1, 100);
      const weight = parseBoundedInt(item.weight, 1, 100);
      if (!item.title || !rawBody || modelConfidence === null || impact === null || weight === null) {
        return null;
      }
      return {
        title: truncate(item.title, 160),
        body,
        kind: FLASHCARD_KINDS.has(kind) ? kind : "SUMMARY",
        confidence: computeFlashcardConfidence(source, research, modelConfidence),
        impact,
        weight,
        hashtags: mergeHashtags(source.hashtags, item.hashtags, deriveKeywordHashtags(item.title, item.body)).slice(0, 10),
      };
    })
    .filter((item) =>
      item &&
      item.title &&
      item.body,
    )
    .sort((left, right) => scoreFlashcardCandidate(right) - scoreFlashcardCandidate(left))
    .slice(0, 5);
}

async function generateFlashcardCandidates(company, source, research, feedbackContext = {}, options = {}) {
  const { systemPrompt, userPrompt } = buildFlashcardGenerationPrompts(company, source, research, feedbackContext);
  const raw = await callOllamaJson(systemPrompt, userPrompt, options);
  return parseFlashcardCandidates(raw, source, research);
}

function buildSynthesisPrompts(company, topic, sources) {
  const evidenceSources = sources.slice(0, 4).map((source) => ({
    sourceType: source.sourceType,
    sourceName: source.sourceName,
    hashtags: normalizeHashtags(source.hashtags),
    excerpt: truncate(source.promptBody, 700),
  }));

  const systemPrompt = [
    "You generate zero or more synthesis flashcards as strict JSON.",
    "Return a JSON array.",
    "Each item must contain: title, body, kind, confidence, impact, weight, hashtags.",
    "This flashcard must combine evidence across multiple sources, not paraphrase only one source.",
    "Prefer COMPARISON, EVALUATION, CONCLUSION, RECOMMENDATION, or RESEARCH kinds when appropriate.",
    "Return an empty array if the sources do not support a strong combined insight.",
    "hashtags must reflect the topic and the combined evidence.",
  ].join(" ");
  const userPrompt = [
    `Company: ${company.name}`,
    `Focus topic: ${topic.label}`,
    "Sources:",
    JSON.stringify(evidenceSources, null, 2),
  ].join("\n");
  return [systemPrompt, userPrompt];
}

function parseSynthesisFlashcards(raw, topic, sources) {
  const syntheticSource = {
    sourceName: topic.label,
    hashtags: mergeHashtags(topic.label.split(/\s+/).map((word) => `#${word}`), ...sources.map((source) => source.hashtags)),
    promptBody: sources.map((source) => truncate(source.promptBody, 700)).join("\n\n"),
  };

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const confidence = parseBoundedInt(item.confidence, 1, 100);
      const impact = parseBoundedInt(item.impact, 1, 100);
      const weight = parseBoundedInt(item.weight, 1, 100);
      if (!item.title || !item.body || confidence === null || impact === null || weight === null) {
        return null;
      }
      return {
        title: truncate(item.title, 160),
        body: truncate(item.body, 1200),
        kind: FLASHCARD_KINDS.has(normalizeText(item.kind).toUpperCase()) ? normalizeText(item.kind).toUpperCase() : "RESEARCH",
        confidence: computeFlashcardConfidence(syntheticSource, { factCheck: { confidenceCap: 86, citationCount: 0, distinctDomainCount: 0 } }, confidence, sources.length),
        impact,
        weight,
        hashtags: mergeHashtags(item.hashtags, [normalizeHashtag(topic.label)], ...sources.map((source) => source.hashtags)).slice(0, 10),
      };
    })
    .filter((item) =>
      item &&
      item.title &&
      item.body,
    )
    .sort((left, right) => scoreFlashcardCandidate(right) - scoreFlashcardCandidate(left))
    .slice(0, 3);
}

async function generateSynthesisFlashcards(company, topic, sources, options = {}) {
  const [systemPrompt, userPrompt] = buildSynthesisPrompts(company, topic, sources);
  const raw = await callOllamaJson(systemPrompt, userPrompt, options);
  return parseSynthesisFlashcards(raw, topic, sources);
}

async function upsertFlashcardSource(flashcardId, source) {
  const existing = await prisma.flashcardSource.findUnique({
    where: {
      flashcardId_sourceType_sourceId: {
        flashcardId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
      },
    },
  });

  if (!existing) {
    await prisma.flashcardSource.create({
      data: {
        id: crypto.randomUUID(),
        flashcardId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourcePublicId: source.sourcePublicId,
        sourceName: source.sourceName,
        relationRole: source.relationRole,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

async function syncSupportingSources(flashcardId, citations) {
  await prisma.flashcardSource.deleteMany({
    where: {
      flashcardId,
      sourceType: "AGENT_FOUND",
      relationRole: "SUPPORTING",
    },
  });

  for (const citation of citations) {
    await upsertFlashcardSource(flashcardId, {
      sourceType: "AGENT_FOUND",
      sourceId: hashValue(citation.url),
      sourcePublicId: null,
      sourceName: truncate(`${citation.title} (${citation.domain})`, 200),
      relationRole: "SUPPORTING",
    });
  }
}

async function findFlashcardByFingerprint(companyId, fingerprint) {
  if (!companyId || !fingerprint) return null;
  return prisma.flashcard.findFirst({
    where: { companyId, fingerprint },
  });
}

async function syncTopicSynthesisFlashcards(companyId, company, data, sources, existingByFingerprint) {
  const selectedTopics = selectResearchTopics(data, 5);
  let created = 0;
  let updated = 0;

  for (const topic of selectedTopics) {
    const relevantSources = sources
      .filter((source) => topicMatchesSource(topic, source))
      .slice(0, 4);

    if (relevantSources.length < 2) {
      continue;
    }

    let generatedItems;

    try {
      generatedItems = await generateSynthesisFlashcards(company, topic, relevantSources);
    } catch (error) {
      console.error(`Synthesis flashcard generation failed for ${companyId}/${topic.label}: ${error.message}`);
      const [systemPrompt, userPrompt] = buildSynthesisPrompts(company, topic, relevantSources);
      try {
        generatedItems = await runFailsafeModel(
          "synthesis-flashcards",
          { systemPrompt, userPrompt },
          (raw) => parseSynthesisFlashcards(raw, topic, relevantSources),
          {
            companyId,
            topicId: topic.id,
            topicLabel: topic.label,
            payload: {
              topicId: topic.id,
              topicLabel: topic.label,
            },
          },
          { enqueue: false },
        );
      } catch (failsafeError) {
        console.error(`Fail-safe synthesis generation also failed for ${companyId}/${topic.label}: ${failsafeError.message}`);
        continue;
      }
    }

    if (!Array.isArray(generatedItems) || generatedItems.length === 0) {
      continue;
    }

    for (const generated of generatedItems) {
      const fingerprint = hashValue(`TOPIC:${companyId}:${topic.id}:${relevantSources.map((source) => source.sourceId).join(":")}:${generated.title}:${generated.body}`);
      const existing = existingByFingerprint.get(fingerprint) || await findFlashcardByFingerprint(companyId, fingerprint);
      const evidence = {
        synthesisTopic: topic.label,
        sourceCount: relevantSources.length,
        sourceIds: relevantSources.map((source) => source.sourceId),
        excerpts: relevantSources.map((source) => ({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          excerpt: truncate(source.promptBody, 500),
        })),
      };

      if (existing) {
        await prisma.flashcard.update({
          where: { id: existing.id },
          data: {
            title: existing.manualTitle || generated.title,
            body: existing.manualBody || generated.body,
            generatedTitle: generated.title,
            generatedBody: generated.body,
            confidence: generated.confidence,
            impact: generated.impact,
            weight: generated.weight,
            hashtags: generated.hashtags,
            evidence,
            kind: generated.kind,
            fingerprint,
            status: "ACTIVE",
            refreshedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        await prisma.flashcardSource.deleteMany({
          where: { flashcardId: existing.id, relationRole: { in: ["PRIMARY", "MERGED_FROM"] } },
        });
        updated += 1;
      } else {
        const flashcardId = crypto.randomUUID();
        const publicId = await nextPublicId(PUBLIC_ID_SCOPES.flashcard);
        try {
          await prisma.flashcard.create({
            data: {
              id: flashcardId,
              publicId,
              companyId,
              title: generated.title,
              body: generated.body,
              generatedTitle: generated.title,
              generatedBody: generated.body,
              confidence: generated.confidence,
              impact: generated.impact,
              weight: generated.weight,
              hashtags: generated.hashtags,
              evidence,
              kind: generated.kind,
              fingerprint,
              status: "ACTIVE",
              createdBy: "local-ai",
              reviewStatus: "PENDING",
              refreshedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          existingByFingerprint.set(fingerprint, { id: flashcardId });
          created += 1;
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          const concurrent = await findFlashcardByFingerprint(companyId, fingerprint);
          if (!concurrent) throw error;
          await prisma.flashcard.update({
            where: { id: concurrent.id },
            data: {
              title: concurrent.manualTitle || generated.title,
              body: concurrent.manualBody || generated.body,
              generatedTitle: generated.title,
              generatedBody: generated.body,
              confidence: generated.confidence,
              impact: generated.impact,
              weight: generated.weight,
              hashtags: generated.hashtags,
              evidence,
              kind: generated.kind,
              status: "ACTIVE",
              refreshedAt: new Date(),
              updatedAt: new Date(),
            },
          });
          existingByFingerprint.set(fingerprint, concurrent);
          updated += 1;
        }
      }

      const targetId = existing?.id || existingByFingerprint.get(fingerprint)?.id;
      if (targetId) {
        for (const [index, source] of relevantSources.entries()) {
          await upsertFlashcardSource(targetId, {
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            sourcePublicId: source.sourcePublicId,
            sourceName: source.sourceName,
            relationRole: index === 0 ? "PRIMARY" : "MERGED_FROM",
          });
        }
      }
    }
  }

  return { created, updated };
}

async function syncFlashcards(companyId, company, data, previousKnowledge = {}) {
  const sources = buildSourceRecords(company, data);
  const focusTopics = selectResearchTopics(data, 5);
  const localFlashcards = (data.flashcards || []).filter((card) => normalizeText(card.createdBy) === "local-ai");
  const existingByFingerprint = new Map(localFlashcards.map((card) => [card.fingerprint, card]));
  const seenFingerprints = new Set();
  const flashcardActionIndex = buildFlashcardActionIndex(data.flashcardActions);
  const taskFeedbackIndex = buildTaskFeedbackIndex(data.existingNBA, data.feedback);

  let created = 0;
  let updated = 0;
  let researched = 0;

  for (const source of sources) {
    const sourceTopics = focusTopics.filter((topic) => topicMatchesSource(topic, source));
    const research = await discoverResearch(company, source, sourceTopics);
    if (research.enabled) researched += 1;

    let generatedItems;
    try {
      const existing = existingByFingerprint.get(source.fingerprint) || await findFlashcardByFingerprint(companyId, source.fingerprint);
      const relatedFlashcardIds = existing?.id ? [existing.id] : [];
      const feedbackContext = {
        flashcardActions: existing?.id ? (flashcardActionIndex.get(existing.id) || []).slice(0, 12) : [],
        taskFeedback: buildFeedbackContext(
          taskFeedbackIndex,
          relatedFlashcardIds,
          [source.sourceName, source.promptBody, ...(source.hashtags || [])].join(" "),
        ),
      };
      generatedItems = await generateFlashcardCandidates(company, source, research, feedbackContext);
    } catch (error) {
      console.error(`Flashcard generation failed for ${companyId}/${source.sourceType}/${source.sourceId}: ${error.message}`);
      const prompts = buildFlashcardGenerationPrompts(company, source, research, {
        flashcardActions: [],
        taskFeedback: buildFeedbackContext(taskFeedbackIndex, [], [source.sourceName, source.promptBody, ...(source.hashtags || [])].join(" ")),
      });
      try {
        generatedItems = await runFailsafeModel(
          "source-flashcards",
          prompts,
          (raw) => parseFlashcardCandidates(raw, source, research),
          {
            companyId,
            sourceId: source.sourceId,
            sourceName: source.sourceName,
            sourceType: source.sourceType,
            payload: {
              sourceId: source.sourceId,
              sourceName: source.sourceName,
              sourceType: source.sourceType,
            },
          },
          { enqueue: false },
        );
      } catch (failsafeError) {
        console.error(`Fail-safe flashcard generation also failed for ${companyId}/${source.sourceType}/${source.sourceId}: ${failsafeError.message}`);
        continue;
      }
    }

    if (!Array.isArray(generatedItems) || generatedItems.length === 0) {
      continue;
    }

    for (const generated of generatedItems) {
      generated.hashtags = deriveFlashcardHashtags(source, generated);
      const candidateFingerprint = hashValue(`${source.fingerprint}:${generated.title}:${generated.body}`);
      seenFingerprints.add(candidateFingerprint);
      const evidence = buildFlashcardEvidence(source, generated, research);
      const existing = existingByFingerprint.get(candidateFingerprint) || await findFlashcardByFingerprint(companyId, candidateFingerprint);

      if (existing) {
        const title = existing.manualTitle || existing.title || generated.title;
        const body = existing.manualBody || generated.body;

        await prisma.flashcard.update({
          where: { id: existing.id },
          data: {
            title,
            body,
            confidence: generated.confidence,
            impact: generated.impact,
            weight: generated.weight,
            hashtags: generated.hashtags,
            status: "ACTIVE",
            refreshedAt: new Date(),
            updatedAt: new Date(),
            generatedTitle: generated.title,
            generatedBody: generated.body,
            evidence: evidence,
            fingerprint: candidateFingerprint,
            kind: generated.kind,
            appVersion: APP_VERSION,
            brainVersion: BRAIN_VERSION,
            generatedAt: new Date(),
            promptVersion: PROMPT_VERSION,
          },
        });

        await upsertFlashcardSource(existing.id, source);
        if (RESEARCH_ENABLED) {
          await syncSupportingSources(existing.id, research.citations);
        }
        updated += 1;
        continue;
      }

      const flashcardId = crypto.randomUUID();
      const flashcardPublicId = await nextPublicId(PUBLIC_ID_SCOPES.flashcard);
      try {
        await prisma.flashcard.create({
          data: {
            id: flashcardId,
            publicId: flashcardPublicId,
            companyId,
            title: generated.title,
            body: generated.body,
            confidence: generated.confidence,
            impact: generated.impact,
            weight: generated.weight,
            hashtags: generated.hashtags,
            status: "ACTIVE",
            createdBy: "local-ai",
            refreshedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            generatedBody: generated.body,
            generatedTitle: generated.title,
            reviewStatus: "PENDING",
            evidence: evidence,
            fingerprint: candidateFingerprint,
            kind: generated.kind,
            appVersion: APP_VERSION,
            brainVersion: BRAIN_VERSION,
            generatedAt: new Date(),
            promptVersion: PROMPT_VERSION,
          },
        });
        existingByFingerprint.set(candidateFingerprint, { id: flashcardId });
        await upsertFlashcardSource(flashcardId, source);
        if (RESEARCH_ENABLED) {
          await syncSupportingSources(flashcardId, research.citations);
        }
        created += 1;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        const concurrent = await findFlashcardByFingerprint(companyId, candidateFingerprint);
        if (!concurrent) throw error;
        await prisma.flashcard.update({
          where: { id: concurrent.id },
          data: {
            title: concurrent.manualTitle || concurrent.title || generated.title,
            body: concurrent.manualBody || generated.body,
            confidence: generated.confidence,
            impact: generated.impact,
            weight: generated.weight,
            hashtags: generated.hashtags,
            status: "ACTIVE",
            refreshedAt: new Date(),
            updatedAt: new Date(),
            generatedBody: generated.body,
            generatedTitle: generated.title,
            evidence: evidence,
            fingerprint: candidateFingerprint,
            kind: generated.kind,
            appVersion: APP_VERSION,
            brainVersion: BRAIN_VERSION,
            generatedAt: new Date(),
            promptVersion: PROMPT_VERSION,
          },
        });
        existingByFingerprint.set(candidateFingerprint, concurrent);
        await upsertFlashcardSource(concurrent.id, source);
        if (RESEARCH_ENABLED) {
          await syncSupportingSources(concurrent.id, research.citations);
        }
        updated += 1;
      }
    }
  }

  const synthesis = await syncTopicSynthesisFlashcards(companyId, company, data, sources, existingByFingerprint);

  const staleCandidates = localFlashcards
    .filter((card) => card.status === "ACTIVE")
    .filter((card) => !seenFingerprints.has(card.fingerprint))
    .map((card) => card.id);

  if (staleCandidates.length > 0) {
    await prisma.flashcard.updateMany({
      where: { id: { in: staleCandidates } },
      data: {
        status: "STALE",
        refreshedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  if (created > 0 || updated > 0 || synthesis.created > 0 || synthesis.updated > 0) {
    markMeaningfulProgress({
      companyId,
      lane: "flashcardRevisit",
      flashcardsCreated: created + synthesis.created,
      flashcardsUpdated: updated + synthesis.updated,
    });
  }

  return { created: created + synthesis.created, updated: updated + synthesis.updated, stale: staleCandidates.length, researched };
}

async function evictProcessedSources(companyId, data) {
  return 0;
}

function buildRecommendationPrompts(company, flashcards, focusTopics = [], feedbackContext = {}) {
  const cards = flashcards.slice(0, 25).map((card) => ({
    id: card.id,
    title: card.title,
    body: truncate(card.body, 400),
    hashtags: normalizeHashtags(card.hashtags),
    kind: card.kind,
    confidence: card.confidence,
    impact: card.impact,
    weight: card.weight,
    factCheckStatus: normalizeText(card?.evidence?.research?.factCheck?.status || "NOT_RUN"),
    citationCount: Number(card?.evidence?.research?.factCheck?.citationCount || 0),
    userAnnotation: toFeedbackExcerpt(card.userAnnotation, 400),
  }));

  if (cards.length === 0) return [];

  const systemPrompt = [
    "You generate zero or more Checklist recommendations as strict JSON.",
    "Return a JSON array of objects.",
    "Each object must contain: title, description, impact, confidence, ease, sourceFlashcardIds, hashtags.",
    "impact and ease are integers from 1 to 10.",
    "confidence is an integer from 1 to 100.",
    "Prefer the strongest grounded flashcards first.",
    "It is valid to return an empty array when the evidence is weak, too generic, redundant, unsupported, or not actionable enough.",
    "One flashcard can justify zero, one, or many checklist items.",
    "Treat accepted archived task feedback and user annotations as the strongest signal for what good checklist items look like.",
    "Treat declined feedback as a pattern to avoid.",
    "If users rewrote or annotated accepted tasks, mirror that direction.",
    "sourceFlashcardIds must contain one or more ids from the provided flashcards.",
    "Do not force a quota of results.",
    "Do not include markdown fences or extra text.",
  ].join(" ");

  const userPrompt = [
    `Company: ${company.name}`,
    `Main goal: ${normalizeText(company.mainGoal) || "n/a"}`,
    `Active topics: ${focusTopics.map((topic) => topic.label).join(", ") || "none"}`,
    "Archived user feedback patterns:",
    JSON.stringify(feedbackContext, null, 2),
    "Flashcards:",
    JSON.stringify(cards, null, 2),
  ].join("\n");

  return { systemPrompt, userPrompt, cards };
}

function parseRecommendationCandidates(raw, cards) {
  if (!Array.isArray(raw)) return [];
  const allowedIds = new Set(cards.map((card) => card.id));
  return raw
    .map((item) => {
      const impact = parseBoundedInt(item.impact, 1, 10);
      const confidence = parseBoundedInt(item.confidence, 1, 100);
      const ease = parseBoundedInt(item.ease, 1, 10);
      const sourceFlashcardIds = toArray(item.sourceFlashcardIds).filter((id) => allowedIds.has(id));
      if (!item.title || !item.description || impact === null || confidence === null || ease === null || sourceFlashcardIds.length === 0) {
        return null;
      }
      return {
        title: truncate(item.title, 160),
        description: truncate(item.description, 600),
        impact,
        confidence,
        ease,
        sourceFlashcardIds,
        hashtags: normalizeHashtags(item.hashtags),
      };
    })
    .filter((item) => item && item.title && item.description && item.sourceFlashcardIds.length > 0)
    .sort((left, right) => computeRecommendationIceScore(right) - computeRecommendationIceScore(left));
}

async function generateRecommendationCandidates(company, flashcards, focusTopics = [], feedbackContext = {}, options = {}) {
  const { systemPrompt, userPrompt, cards } = buildRecommendationPrompts(company, flashcards, focusTopics, feedbackContext);
  const raw = await callOllamaJson(systemPrompt, userPrompt, options);
  return parseRecommendationCandidates(raw, cards);
}

async function persistRecommendationCandidates(companyId, existingNBA, activeFlashcards, candidates) {
  let created = 0;
  let updated = 0;

  for (const rec of candidates) {
    const match = existingNBA.find((item) => similarity(item.title, rec.title) >= 0.7);
    const iceScore = computeRecommendationIceScore(rec);
    const sourceCards = activeFlashcards.filter((card) => rec.sourceFlashcardIds.includes(card.id));
    const resolvedHashtags = deriveChecklistHashtags(rec, sourceCards);

    if (match && normalizeText(match.createdBy) === "local-ai" && match.status === "PENDING") {
      await prisma.nBAItem.update({
        where: { id: match.id },
        data: {
          title: rec.title,
          description: rec.description,
          impact: rec.impact,
          confidence: rec.confidence,
          ease: rec.ease,
          iceScore,
          sourceFlashcardIds: rec.sourceFlashcardIds,
          hashtags: resolvedHashtags,
          updatedAt: new Date(),
          appVersion: APP_VERSION,
          brainVersion: BRAIN_VERSION,
          generatedAt: new Date(),
          promptVersion: PROMPT_VERSION,
        },
      });
      updated += 1;
      continue;
    }

    if (match) continue;

    const checklistPublicId = await nextPublicId(PUBLIC_ID_SCOPES.checklist);
    await prisma.nBAItem.create({
      data: {
        id: crypto.randomUUID(),
        companyId,
        publicId: checklistPublicId,
        title: rec.title,
        description: rec.description,
        impact: rec.impact,
        confidence: rec.confidence,
        ease: rec.ease,
        iceScore,
        status: "PENDING",
        createdBy: "local-ai",
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceFlashcardIds: rec.sourceFlashcardIds,
        hashtags: resolvedHashtags,
        appVersion: APP_VERSION,
        brainVersion: BRAIN_VERSION,
        generatedAt: new Date(),
        promptVersion: PROMPT_VERSION,
      },
    });
    created += 1;
  }

  return { created, updated };
}

async function persistTaskRevisitCandidates(task, sourceCards, candidates) {
  const bestCandidate = candidates
    .map((candidate) => ({
      candidate,
      score: similarity(task.title, candidate.title),
    }))
    .sort((left, right) =>
      right.score - left.score ||
      computeRecommendationIceScore(right.candidate) - computeRecommendationIceScore(left.candidate),
    )[0]?.candidate;

  if (!bestCandidate) {
    return { updated: 0, skipped: 1 };
  }

  await prisma.nBAItem.update({
    where: { id: task.id },
    data: {
      title: bestCandidate.title,
      description: bestCandidate.description,
      impact: bestCandidate.impact,
      confidence: bestCandidate.confidence,
      ease: bestCandidate.ease,
      iceScore: computeRecommendationIceScore(bestCandidate),
      sourceFlashcardIds: bestCandidate.sourceFlashcardIds,
      hashtags: deriveChecklistHashtags(bestCandidate, sourceCards),
      generatedAt: new Date(),
      updatedAt: new Date(),
      appVersion: APP_VERSION,
      brainVersion: BRAIN_VERSION,
      promptVersion: PROMPT_VERSION,
    },
  });
  return { updated: 1, skipped: 0 };
}

async function runFailsafeModel(kind, prompts, parser, metadata = {}, options = {}) {
  const queueEnabled = options.enqueue !== false;
  const payload = {
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    ...(metadata.payload || {}),
  };
  const models = Array.isArray(options.models) && options.models.length > 0 ? options.models : FAILSAFE_MODELS;
  if (!queueEnabled) {
    const { parsed, model } = await attemptFailsafeModels(prompts, parser, models);
    markMeaningfulProgress({
      companyId: metadata.companyId,
      lane: "failsafeQueue",
      queueKind: kind,
      outputCount: parsed.length,
      model,
    });
    return parsed;
  }

  const queuedJob = enqueueFailsafeJob({
    companyId: metadata.companyId,
    kind,
    status: "PENDING",
    models,
    payload,
  });
  let job = updateFailsafeJob(queuedJob, {
    status: "RUNNING",
    attempts: 1,
    model: models.join(","),
  });

  try {
    const { parsed, model, errors } = await attemptFailsafeModels(prompts, parser, models);
    updateFailsafeJob(job, {
      status: "COMPLETED",
      attempts: 1,
      model,
      outputCount: parsed.length,
      lastError: errors.length > 0 ? errors.join(" | ") : null,
    });
    markMeaningfulProgress({
      companyId: metadata.companyId,
      lane: "failsafeQueue",
      queueKind: kind,
      outputCount: parsed.length,
      model,
    });
    return parsed;
  } catch (error) {
    job = updateFailsafeJob(job, {
      status: "FAILED",
      attempts: 1,
      model: models.join(","),
      lastError: error.message,
    });
    throw error;
  }
}

async function syncRecommendations(companyId, company, existingNBA, focusTopics = []) {
  const activeFlashcards = await prisma.flashcard.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      reviewStatus: { not: "DECLINED" },
    },
    orderBy: [
      { confidence: "desc" },
      { weight: "desc" },
      { impact: "desc" },
      { updatedAt: "desc" },
    ],
  });

  let candidates = [];
  let recommendationError = null;
  const taskFeedbackIndex = buildTaskFeedbackIndex(existingNBA, await prisma.feedback.findMany({
    where: { nbaItem: { companyId } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  }));
  const feedbackContext = buildFeedbackContext(
    taskFeedbackIndex,
    activeFlashcards.map((card) => card.id),
    activeFlashcards
      .slice(0, 25)
      .map((card) => [card.title, card.body, ...(card.hashtags || []), card.userAnnotation].join(" "))
      .join("\n"),
  );
  try {
    candidates = await generateRecommendationCandidates(
      company,
      activeFlashcards,
      focusTopics,
      feedbackContext,
    );
  } catch (error) {
    recommendationError = error;
    console.error(`Recommendation generation failed for ${companyId}: ${error.message}`);
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const reason = recommendationError?.message || "AI returned no recommendation candidates";
    console.error(`Recommendation generation produced no output for ${companyId}: ${reason}`);
    if (recommendationError) {
      try {
        const prompts = buildRecommendationPrompts(company, activeFlashcards, focusTopics, feedbackContext);
        candidates = await runFailsafeModel(
          "company-recommendations",
          prompts,
          (raw) => parseRecommendationCandidates(raw, prompts.cards),
          {
            companyId,
            flashcardCount: activeFlashcards.length,
            payload: {
              systemPrompt: prompts.systemPrompt,
              userPrompt: prompts.userPrompt,
              cards: prompts.cards,
            },
          },
        );
      } catch (failsafeError) {
        return { created: 0, updated: 0, skipped: true, error: `${reason}; fail-safe: ${failsafeError.message}` };
      }
    } else {
      return { created: 0, updated: 0, skipped: true, error: reason };
    }
  }
  const { created, updated } = await persistRecommendationCandidates(companyId, existingNBA, activeFlashcards, candidates);

  if (created > 0 || updated > 0) {
    markMeaningfulProgress({
      companyId,
      lane: "taskRevisit",
      taskcardsCreated: created,
      taskcardsUpdated: updated,
    });
  }

  return { created, updated };
}

async function processCompany(companyId, reason = {}) {
  const previousKnowledge = await loadKnowledge(companyId);
  const data = await getAllData(companyId);
  if (!data?.company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const focusTopics = selectResearchTopics(data, 5);
  const flashcards = await syncFlashcards(companyId, data.company, data, previousKnowledge);
  const recommendations = await syncRecommendations(companyId, data.company, data.existingNBA, focusTopics);
  const nextData = await getAllData(companyId);
  await saveKnowledge(companyId, {
    snapshot: buildSnapshot(nextData),
    lastTriggeredBy: reason,
    lastRun: {
      flashcards,
      recommendations,
      hashtagUpdates: 0,
      focusTopics: focusTopics.map((topic) => topic.label),
    },
    research: {
      enabled: RESEARCH_ENABLED,
      provider: RESEARCH_ENABLED ? RESEARCH_PROVIDER : null,
      refreshHours: RESEARCH_REFRESH_HOURS,
      lastRunAt: isoTimestamp(),
    },
    memory: buildFeedbackMemorySummary(nextData),
  });

  await evictProcessedSources(companyId, data);

  return {
    flashcards,
    recommendations,
    dataSynced: {
      sources: data.sources.length,
      uploadedFiles: data.uploadedFiles.length,
      topics: data.topics.length,
      feedback: data.feedback.length,
    },
  };
}

async function findOldestHashtagMaintenanceCandidate(companyId = null) {
  const where = companyId ? { companyId } : undefined;
  const [source, file, flashcard, checklist, topic] = await Promise.all([
    prisma.source.findFirst({
      where,
      orderBy: [{ hashtagEvaluationPending: "desc" }, { hashtagMaintainedAt: "asc" }, { updatedAt: "asc" }],
      select: { id: true, companyId: true, hashtagMaintainedAt: true, hashtagEvaluationPending: true, updatedAt: true },
    }),
    prisma.uploadedSourceFile.findFirst({
      where,
      orderBy: [{ hashtagEvaluationPending: "desc" }, { hashtagMaintainedAt: "asc" }, { updatedAt: "asc" }],
      select: { id: true, companyId: true, hashtagMaintainedAt: true, hashtagEvaluationPending: true, updatedAt: true },
    }),
    prisma.flashcard.findFirst({
      where,
      orderBy: [{ hashtagEvaluationPending: "desc" }, { hashtagMaintainedAt: "asc" }, { updatedAt: "asc" }],
      select: { id: true, companyId: true, hashtagMaintainedAt: true, hashtagEvaluationPending: true, updatedAt: true },
    }),
    prisma.nBAItem.findFirst({
      where,
      orderBy: [{ hashtagEvaluationPending: "desc" }, { hashtagMaintainedAt: "asc" }, { updatedAt: "asc" }],
      select: { id: true, companyId: true, hashtagMaintainedAt: true, hashtagEvaluationPending: true, updatedAt: true },
    }),
    prisma.topic.findFirst({
      where,
      orderBy: [{ hashtagEvaluationPending: "desc" }, { hashtagMaintainedAt: "asc" }, { updatedAt: "asc" }],
      select: { id: true, companyId: true, hashtagMaintainedAt: true, hashtagEvaluationPending: true, updatedAt: true },
    }),
  ]);

  return [source, file, flashcard, checklist, topic]
    .filter(Boolean)
    .sort((left, right) => {
      const leftPending = left.hashtagEvaluationPending ? 0 : 1;
      const rightPending = right.hashtagEvaluationPending ? 0 : 1;
      const leftTime = left.hashtagMaintainedAt ? new Date(left.hashtagMaintainedAt).getTime() : 0;
      const rightTime = right.hashtagMaintainedAt ? new Date(right.hashtagMaintainedAt).getTime() : 0;
      return leftPending - rightPending || leftTime - rightTime || new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
    })[0] || null;
}

async function processHashtagMaintenance(companyId = null) {
  const selection = companyId
    ? { companyId, idleDelayMs: COMPANY_LANE_CONTINUE_DELAY_MS }
    : await selectNextCompanyForLane("hashtagMaintenance", HASHTAG_MAINTENANCE_INTERVAL_MS);
  if (!selection.companyId) {
    return { processed: 0, changed: 0, companyId: null, idleDelayMs: selection.idleDelayMs };
  }

  const candidate = await findOldestHashtagMaintenanceCandidate(selection.companyId);
  if (!candidate) {
    return { processed: 0, changed: 0, companyId: selection.companyId, idleDelayMs: COMPANY_LANE_CONTINUE_DELAY_MS };
  }

  const data = await getAllData(candidate.companyId);
  if (!data?.company) {
    return { processed: 0, changed: 0, companyId: candidate.companyId, idleDelayMs: COMPANY_LANE_CONTINUE_DELAY_MS };
  }

  const changed = await syncHashtagMaintenance(data.company, data);
  lastHashtagMaintenanceAt = Date.now();
  return { processed: HASHTAG_MAINTENANCE_BATCH_SIZE, changed, companyId: candidate.companyId, idleDelayMs: COMPANY_LANE_CONTINUE_DELAY_MS };
}

function buildResearchHarvestSourceContent(company, flashcard, citation, topics = []) {
  const lines = [
    "AI Research Harvest",
    `Company: ${normalizeText(company.name) || "Unknown company"}`,
    `Triggered from flashcard: ${normalizeText(flashcard.title) || flashcard.id}`,
    `Research title: ${normalizeText(citation.title) || shortenUrl(citation.url)}`,
    `URL: ${citation.url}`,
    `Domain: ${citation.domain || "unknown"}`,
    `Topics: ${topics.map((topic) => topic.label).join(", ") || "none"}`,
    citation.snippet ? `Snippet: ${truncate(citation.snippet, 400)}` : null,
    citation.excerpt ? `Excerpt:\n${truncate(citation.excerpt, 3000)}` : null,
  ].filter(Boolean);
  return lines.join("\n\n");
}

async function harvestResearchSources(companyId, company, data, batchSize = RESEARCH_HARVEST_BATCH_SIZE) {
  const activeTopics = selectResearchTopics(data, 5);
  if (activeTopics.length === 0) {
    return { companyId, processed: 0, createdSources: 0, skipped: 0, reason: "no-active-topics" };
  }

  const flashcards = (data.flashcards || [])
    .filter((card) => card.status === "ACTIVE")
    .sort((left, right) =>
      new Date(left.refreshedAt || left.updatedAt || left.createdAt || 0).getTime() -
      new Date(right.refreshedAt || right.updatedAt || right.createdAt || 0).getTime()
    );

  let processed = 0;
  let createdSources = 0;
  let skipped = 0;

  for (const flashcard of flashcards) {
    if (processed >= batchSize) break;
    const matchedTopics = activeTopics.filter((topic) => topicMatchesFlashcard(topic, flashcard));
    if (matchedTopics.length === 0) {
      continue;
    }

    const primarySource = await prisma.flashcardSource.findFirst({
      where: { flashcardId: flashcard.id, relationRole: "PRIMARY" },
    });
    if (!primarySource) {
      skipped += 1;
      continue;
    }

    const source = {
      sourceType: primarySource.sourceType,
      sourceId: primarySource.sourceId,
      sourcePublicId: primarySource.sourcePublicId,
      sourceName: primarySource.sourceName,
      promptBody: flashcard.generatedBody || flashcard.body,
      fingerprint: flashcard.fingerprint,
      hashtags: flashcard.hashtags,
      queryHints: matchedTopics.map((topic) => `${company.name} ${topic.label}`),
      urls: [],
    };
    const research = await discoverResearch(company, source, matchedTopics);
    const citations = (research.citations || []).filter((citation) => citation.url && citation.excerpt);
    if (citations.length === 0) {
      skipped += 1;
      processed += 1;
      continue;
    }

    let createdForFlashcard = 0;
    for (const citation of citations) {
      if (createdForFlashcard >= batchSize || processed >= batchSize) break;
      const legacyOriginKey = `research-harvest:${citation.url}`;
      const existing = await prisma.source.findFirst({
        where: { companyId, legacyOriginKey },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const publicId = await nextPublicId(PUBLIC_ID_SCOPES.source);
      await prisma.source.create({
        data: {
          id: crypto.randomUUID(),
          companyId,
          publicId,
          content: buildResearchHarvestSourceContent(company, flashcard, citation, matchedTopics),
          hashtags: mergeHashtags(flashcard.hashtags, matchedTopics.flatMap((topic) => topic.hashtags)),
          aiClusters: normalizeHashtags(matchedTopics.map((topic) => topic.label)),
          entityTag: "research-harvest",
          metadata: {
            origin: "research-harvest",
            harvestedBy: "local-ai",
            harvestedAt: isoTimestamp(),
            harvestedFromFlashcardId: flashcard.id,
            harvestedFromFlashcardPublicId: flashcard.publicId ?? null,
            harvestedFromFlashcardTitle: flashcard.title,
            sourceUrl: citation.url,
            sourceDomain: citation.domain,
            sourceTitle: citation.title,
            sourceSnippet: citation.snippet,
            sourceKind: citation.sourceKind,
            query: citation.query,
            topics: matchedTopics.map((topic) => ({
              id: topic.id,
              label: topic.label,
            })),
          },
          legacyOriginKey,
        },
      });
      createdSources += 1;
      createdForFlashcard += 1;
      processed += 1;
    }
  }

  if (createdSources > 0) {
    markMeaningfulProgress({
      companyId,
      lane: "researchHarvest",
      datacardsCreated: createdSources,
    });
    await processCompany(companyId, { trigger: "research-harvest" });
  }

  return { companyId, processed, createdSources, skipped };
}

async function processPollingLane(companyId) {
  const previousKnowledge = await loadKnowledge(companyId);
  const data = await getAllData(companyId);
  if (!data?.company) {
    return { companyId, processedCompanies: 0, refreshedCompanies: 0, skipped: true, reason: "company-missing" };
  }

  const hasAnySource = data.sources.length > 0 || data.uploadedFiles.length > 0;
  if (!previousKnowledge.snapshot && !hasAnySource) {
    await saveKnowledge(companyId, {
      snapshot: buildSnapshot(data),
      research: {
        enabled: RESEARCH_ENABLED,
        provider: RESEARCH_ENABLED ? RESEARCH_PROVIDER : null,
        refreshHours: RESEARCH_REFRESH_HOURS,
        lastRunAt: isoTimestamp(),
      },
    });
    return { companyId, processedCompanies: 0, refreshedCompanies: 0, skipped: true, reason: "no-source-data" };
  }

  const nextSnapshot = buildSnapshot(data);
  const coreChanged = !previousKnowledge.snapshot || hasDataChanged(
    buildCoreSnapshot(previousKnowledge.snapshot),
    buildCoreSnapshot(nextSnapshot),
  );
  const refreshDue = isResearchRefreshDue(previousKnowledge);
  if (!coreChanged && !refreshDue) {
    return { companyId, processedCompanies: 0, refreshedCompanies: 0, skipped: true, reason: "not-due" };
  }

  console.log(
    `Company ${companyId}: ${!previousKnowledge.snapshot ? "initial run" : coreChanged ? "source or topic changed" : "company research refresh due"}`
  );
  const result = await processCompany(
    companyId,
    { trigger: !previousKnowledge.snapshot ? "poll-first-run-serial" : coreChanged ? "poll-core-delta" : "poll-research-refresh" },
  );
  lastSync = Date.now();
  return {
    companyId,
    processedCompanies: 1,
    refreshedCompanies: refreshDue ? 1 : 0,
    skipped: false,
    result,
  };
}

async function refreshOldestFlashcards(companyId, batchSize = FLASHCARD_REVISIT_BATCH_SIZE) {
  console.log(`Flashcard Revisit: checking oldest active flashcards for company ${companyId}...`);
  const flashcards = await prisma.flashcard.findMany({
    where: { companyId, status: "ACTIVE" },
    orderBy: [{ lastActionAt: "asc" }, { refreshedAt: "asc" }, { updatedAt: "asc" }],
    take: batchSize,
  });

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  const companiesToRefresh = new Set();

  for (const flashcard of flashcards) {
    processed += 1;
    const data = await getAllData(companyId);
    if (!data.company) {
      skipped += 1;
      continue;
    }
    const taskFeedbackIndex = buildTaskFeedbackIndex(data.existingNBA, data.feedback);
    const flashcardActionIndex = buildFlashcardActionIndex(data.flashcardActions);
    const fs = await prisma.flashcardSource.findFirst({
      where: { flashcardId: flashcard.id, relationRole: "PRIMARY" },
    });
    if (!fs) {
      skipped += 1;
      continue;
    }

    console.log(`Enriching oldest flashcard: ${flashcard.id} (${flashcard.title})`);
    const source = {
      sourceType: fs.sourceType,
      sourceId: fs.sourceId,
      sourcePublicId: fs.sourcePublicId,
      sourceName: fs.sourceName,
      promptBody: flashcard.generatedBody || flashcard.body,
      fingerprint: flashcard.fingerprint,
      hashtags: flashcard.hashtags,
    };
    const relatedTopics = selectResearchTopics(data, 5).filter((topic) =>
      normalizeLoose([flashcard.title, flashcard.body, ...(flashcard.hashtags || [])].join(" ")).includes(normalizeTopicLabel(topic.label)),
    );
    const research = await discoverResearch(data.company, source, relatedTopics);
    const feedbackContext = {
      flashcardActions: (flashcardActionIndex.get(flashcard.id) || []).slice(0, 12),
      taskFeedback: buildFeedbackContext(
        taskFeedbackIndex,
        [flashcard.id],
        [flashcard.title, flashcard.body, source.promptBody, ...(flashcard.hashtags || [])].join(" "),
      ),
    };
    let generatedCandidates = [];
    try {
      generatedCandidates = await generateFlashcardCandidates(data.company, source, research, feedbackContext);
    } catch (error) {
      const prompts = buildFlashcardGenerationPrompts(data.company, source, research, feedbackContext);
      try {
        generatedCandidates = await runFailsafeModel(
          "flashcard-revisit",
          prompts,
          (raw) => parseFlashcardCandidates(raw, source, research),
          {
            companyId,
            flashcardId: flashcard.id,
            payload: {
              flashcardId: flashcard.id,
              sourceId: source.sourceId,
            },
          },
          { enqueue: false },
        );
      } catch (_failsafeError) {
        skipped += 1;
        continue;
      }
    }
    const generated = generatedCandidates[0];
    if (!generated) {
      console.log(`Flashcard ${flashcard.id} skipped during revisit because AI returned no high-quality result.`);
      skipped += 1;
      continue;
    }

    await prisma.flashcard.update({
      where: { id: flashcard.id },
      data: {
        generatedTitle: generated.title,
        generatedBody: generated.body,
        confidence: generated.confidence,
        impact: generated.impact,
        weight: generated.weight,
        hashtags: mergeHashtags(flashcard.hashtags, generated.hashtags),
        evidence: buildFlashcardEvidence(source, generated, research),
        kind: generated.kind,
        updatedAt: new Date(),
        refreshedAt: new Date(),
      },
    });
    companiesToRefresh.add(companyId);
    updated += 1;
  }

  for (const companyId of companiesToRefresh) {
    const data = await getAllData(companyId);
    if (!data.company) continue;
    await syncRecommendations(companyId, data.company, data.existingNBA, selectResearchTopics(data, 5));
  }

  return { companyId, processed, updated, skipped, companiesRefreshed: companiesToRefresh.size };
}

async function revisitOldestTasks(companyId, batchSize = TASK_REVISIT_BATCH_SIZE) {
  console.log(`Task Revisit: checking oldest pending checklist tasks for company ${companyId}...`);
  const tasks = await prisma.nBAItem.findMany({
    where: {
      companyId,
      createdBy: "local-ai",
      status: "PENDING",
    },
    orderBy: [{ generatedAt: "asc" }, { updatedAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
  });

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (const task of tasks) {
    processed += 1;
    const data = await getAllData(companyId);
    if (!data.company) {
      skipped += 1;
      continue;
    }
    const sourceCards = data.flashcards.filter((card) =>
      card.status === "ACTIVE" && task.sourceFlashcardIds.includes(card.id),
    );
    if (sourceCards.length === 0) {
      skipped += 1;
      continue;
    }

    const taskFeedbackIndex = buildTaskFeedbackIndex(data.existingNBA, data.feedback);
    const feedbackContext = buildFeedbackContext(
      taskFeedbackIndex,
      sourceCards.map((card) => card.id),
      [task.title, task.description, task.userAnnotation, ...sourceCards.map((card) => `${card.title}\n${card.body}`)].filter(Boolean).join("\n"),
    );
    let candidates = [];
    try {
      candidates = await generateRecommendationCandidates(
        data.company,
        sourceCards,
        selectResearchTopics(data, 5),
        feedbackContext,
      );
    } catch (error) {
      const prompts = buildRecommendationPrompts(
        data.company,
        sourceCards,
        selectResearchTopics(data, 5),
        feedbackContext,
      );
      try {
        candidates = await runFailsafeModel(
          "task-revisit",
          prompts,
          (raw) => parseRecommendationCandidates(raw, prompts.cards),
          {
            companyId,
            taskId: task.id,
            taskPublicId: task.publicId ?? null,
            payload: {
              systemPrompt: prompts.systemPrompt,
              userPrompt: prompts.userPrompt,
              cards: prompts.cards,
            },
          },
        );
      } catch (failsafeError) {
        skipped += 1;
        continue;
      }
    }

    const result = await persistTaskRevisitCandidates(task, sourceCards, candidates);
    updated += result.updated;
    skipped += result.skipped;
  }

  return { companyId, processed, updated, skipped };
}

async function replayFeedback(companyId) {
  console.log(`Feedback Replay: checking company ${companyId} for new annotations and task actions...`);
  const data = await getAllData(companyId);
  if (!data.company || (data.feedback.length === 0 && data.flashcardActions.length === 0)) {
    return { companyId, processedCompanies: 0, skipped: true, reason: "no-feedback" };
  }

  const nextSnapshot = buildSnapshot(data);
  const knowledge = await loadKnowledge(companyId);
  const feedbackChanged = hasDataChanged(
    buildFeedbackSnapshot(knowledge.snapshot),
    buildFeedbackSnapshot(nextSnapshot),
  );

  if (!feedbackChanged && FEEDBACK_REPLAY_INTERVAL_MS <= 0) {
    return { companyId, processedCompanies: 0, skipped: true, reason: "no-feedback-change" };
  }

  await processCompany(companyId, { trigger: feedbackChanged ? "feedback-replay-change" : "feedback-replay-refresh" });
  await saveKnowledge(companyId, {
    feedbackReplay: {
      lastRunAt: isoTimestamp(),
      reason: feedbackChanged ? "feedback-changed" : "feedback-refresh-due",
    },
    memory: buildFeedbackMemorySummary(data),
  });

  markMeaningfulProgress({
    companyId,
    lane: "feedbackReplay",
    feedbackRows: data.feedback.length,
    flashcardActions: data.flashcardActions.length,
  });

  return { companyId, processedCompanies: 1, skipped: false, reason: feedbackChanged ? "feedback-changed" : "feedback-refresh-due" };
}

async function processFailsafeQueue(companyId = null) {
  const jobs = listFailsafeJobs({ companyId, status: "FAILED" })
    .concat(listFailsafeJobs({ companyId, status: "PENDING" }))
    .filter((job, index, list) => list.findIndex((entry) => entry.id === job.id) === index)
    .filter((job) => Number(job.attempts || 0) < FAILSAFE_MAX_ATTEMPTS)
    .slice(0, 1);

  if (jobs.length === 0) {
    return { companyId, processed: 0, completed: 0, failed: 0, skipped: true, reason: "empty-queue" };
  }

  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      if (!(job.kind === "company-recommendations" || job.kind === "task-revisit")) {
        updateFailsafeJob(job, {
          status: "FAILED_UNSUPPORTED",
          attempts: Number(job.attempts || 0),
          model: null,
          lastError: `unsupported-queue-kind:${job.kind}`,
        });
        continue;
      }
      const nextAttempts = Number(job.attempts || 0) + 1;
      updateFailsafeJob(job, {
        status: "RUNNING",
        attempts: nextAttempts,
        model: (Array.isArray(job.models) && job.models.length > 0 ? job.models : FAILSAFE_MODELS).join(","),
      });
      const payload = job.payload || {};
      if (!payload.systemPrompt || !payload.userPrompt) {
        throw new Error("Queued fail-safe job is missing prompt payload");
      }
      const { parsed, model, errors } = await attemptFailsafeModels(
        {
          systemPrompt: payload.systemPrompt,
          userPrompt: payload.userPrompt,
        },
        (raw) => parseQueuedOutput(job, raw),
        Array.isArray(job.models) && job.models.length > 0 ? job.models : FAILSAFE_MODELS,
      );
      await persistQueuedOutput(job, parsed);

      updateFailsafeJob(job, {
        status: "COMPLETED",
        attempts: nextAttempts,
        model,
        outputCount: parsed.length,
        lastError: errors.length > 0 ? errors.join(" | ") : null,
      });
      markMeaningfulProgress({
        companyId: job.companyId,
        lane: "failsafeQueue",
        queueKind: job.kind,
        outputCount: parsed.length,
        model,
      });
      completed += 1;
    } catch (error) {
      failed += 1;
      updateFailsafeJob(job, {
        status: Number(job.attempts || 0) + 1 >= FAILSAFE_MAX_ATTEMPTS ? "FAILED_PERMANENT" : "FAILED",
        attempts: Number(job.attempts || 0) + 1,
        model: (Array.isArray(job.models) && job.models.length > 0 ? job.models : FAILSAFE_MODELS).join(","),
        lastError: error.message,
      });
    }
  }

  return { companyId, processed: jobs.length, completed, failed };
}

function flashcardDuplicateKey(card) {
  return `${card.companyId}:${normalizeLoose(card.title)}:${normalizeLoose(card.body)}`;
}

function taskDuplicateKey(task) {
  return `${task.companyId}:${normalizeLoose(task.title)}:${normalizeLoose(task.description)}:${[...(task.sourceFlashcardIds || [])].sort().join(",")}`;
}

function flashcardKeepScore(card) {
  const reviewBoost =
    card.reviewStatus === "MODIFIED_ACCEPTED" ? 5_000 :
    card.reviewStatus === "ACCEPTED" ? 4_000 :
    card.reviewStatus === "PENDING" ? 2_000 :
    0;
  const manualBoost = (card.manualTitle || card.manualBody) ? 1_500 : 0;
  const statusBoost = card.status === "ACTIVE" ? 500 : 0;
  const qualityBoost = (Number(card.confidence || 0) * 10) + (Number(card.weight || 0) * 5) + Number(card.impact || 0);
  const recencyPenalty = new Date(card.updatedAt || card.createdAt || Date.now()).getTime() / 1_000_000_000_000;
  return reviewBoost + manualBoost + statusBoost + qualityBoost - recencyPenalty;
}

function taskKeepScore(task) {
  const statusBoost =
    task.status === "COMPLETED" ? 5_000 :
    task.status === "ACCEPTED" ? 4_000 :
    task.status === "PENDING" ? 2_000 :
    0;
  const annotationBoost = normalizeText(task.userAnnotation).length > 0 ? 500 : 0;
  const qualityBoost = Number(task.iceScore || 0) + Number(task.confidence || 0) + Number(task.impact || 0) + Number(task.ease || 0);
  const recencyPenalty = new Date(task.updatedAt || task.createdAt || Date.now()).getTime() / 1_000_000_000_000;
  return statusBoost + annotationBoost + qualityBoost - recencyPenalty;
}

function remapSourceFlashcardIds(ids, canonicalFlashcardIds) {
  const remapped = [];
  for (const id of ids || []) {
    remapped.push(canonicalFlashcardIds.get(id) || id);
  }
  return unique(remapped);
}

async function applyDuplicateFlashcardMaintenance(batchSize = CLEANUP_BATCH_SIZE, companyId = null) {
  const flashcards = await prisma.flashcard.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      status: { in: ["ACTIVE", "STALE"] },
    },
    select: {
      id: true,
      companyId: true,
      title: true,
      body: true,
      confidence: true,
      impact: true,
      weight: true,
      status: true,
      reviewStatus: true,
      manualTitle: true,
      manualBody: true,
      hashtags: true,
      updatedAt: true,
      createdAt: true,
      createdBy: true,
    },
    take: batchSize * 8,
    orderBy: { updatedAt: "asc" },
  });

  const groups = new Map();
  for (const card of flashcards) {
    const key = flashcardDuplicateKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }

  const canonicalFlashcardIds = new Map();
  let groupsProcessed = 0;
  let archived = 0;
  let rewiredTasks = 0;

  for (const cards of groups.values()) {
    if (cards.length < 2) continue;
    const ranked = [...cards].sort((left, right) =>
      flashcardKeepScore(right) - flashcardKeepScore(left) ||
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
    const keeper = ranked[0];
    const duplicates = ranked.slice(1).filter((card) => normalizeText(card.createdBy) === "local-ai");
    if (duplicates.length === 0) continue;

    groupsProcessed += 1;
    for (const duplicate of duplicates) {
      canonicalFlashcardIds.set(duplicate.id, keeper.id);
    }

    const mergedHashtags = mergeHashtags(...ranked.map((card) => card.hashtags));
    if (JSON.stringify(mergeHashtags(keeper.hashtags)) !== JSON.stringify(mergedHashtags)) {
      await prisma.flashcard.update({
        where: { id: keeper.id },
        data: {
          hashtags: mergedHashtags,
          updatedAt: new Date(),
        },
      });
    }

    for (const duplicate of duplicates) {
      if (duplicate.status !== "ARCHIVED") {
        await prisma.flashcard.update({
          where: { id: duplicate.id },
          data: {
            status: "ARCHIVED",
            updatedAt: new Date(),
          },
        });
        archived += 1;
      }
    }
  }

  if (canonicalFlashcardIds.size > 0) {
    const tasks = await prisma.nBAItem.findMany({
      where: {
        sourceFlashcardIds: { hasSome: [...canonicalFlashcardIds.keys()] },
      },
      select: {
        id: true,
        sourceFlashcardIds: true,
      },
    });

    for (const task of tasks) {
      const remapped = remapSourceFlashcardIds(task.sourceFlashcardIds, canonicalFlashcardIds);
      if (JSON.stringify(remapped) === JSON.stringify(task.sourceFlashcardIds)) continue;
      await prisma.nBAItem.update({
        where: { id: task.id },
        data: {
          sourceFlashcardIds: remapped,
          updatedAt: new Date(),
        },
      });
      rewiredTasks += 1;
    }
  }

  return { groupsProcessed, archivedFlashcards: archived, rewiredTasks, canonicalFlashcardIds };
}

async function applyDuplicateTaskMaintenance(batchSize = CLEANUP_BATCH_SIZE, canonicalFlashcardIds = new Map(), companyId = null) {
  const tasks = await prisma.nBAItem.findMany({
    where: {
      ...(companyId ? { companyId } : {}),
      status: { in: ["PENDING", "ACCEPTED", "COMPLETED"] },
    },
    select: {
      id: true,
      companyId: true,
      title: true,
      description: true,
      sourceFlashcardIds: true,
      status: true,
      userAnnotation: true,
      createdAt: true,
      updatedAt: true,
      iceScore: true,
      confidence: true,
      impact: true,
      ease: true,
      createdBy: true,
    },
    take: batchSize * 8,
    orderBy: { updatedAt: "asc" },
  });

  const normalizedTasks = [];
  let rewired = 0;
  for (const task of tasks) {
    const remapped = remapSourceFlashcardIds(task.sourceFlashcardIds, canonicalFlashcardIds);
    if (JSON.stringify(remapped) !== JSON.stringify(task.sourceFlashcardIds)) {
      await prisma.nBAItem.update({
        where: { id: task.id },
        data: {
          sourceFlashcardIds: remapped,
          updatedAt: new Date(),
        },
      });
      rewired += 1;
    }
    normalizedTasks.push({ ...task, sourceFlashcardIds: remapped });
  }

  const groups = new Map();
  for (const task of normalizedTasks) {
    const key = taskDuplicateKey(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }

  let groupsProcessed = 0;
  let declined = 0;
  for (const tasksInGroup of groups.values()) {
    if (tasksInGroup.length < 2) continue;
    const ranked = [...tasksInGroup].sort((left, right) =>
      taskKeepScore(right) - taskKeepScore(left) ||
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
    const keeper = ranked[0];
    const duplicates = ranked.slice(1).filter((task) => task.status === "PENDING" && normalizeText(task.createdBy) === "local-ai");
    if (duplicates.length === 0) continue;

    groupsProcessed += 1;
    for (const duplicate of duplicates) {
      await prisma.nBAItem.update({
        where: { id: duplicate.id },
        data: {
          status: "DECLINED",
          userAnnotation: "Auto-declined because a duplicate checklist item already exists.",
          updatedAt: new Date(),
        },
      });
      declined += 1;
    }
  }

  return { groupsProcessed, declinedTasks: declined, rewiredTasks: rewired };
}

async function auditMaintenanceBacklog(batchSize = CLEANUP_BATCH_SIZE, companyId = null) {
  const flashcardCleanup = await applyDuplicateFlashcardMaintenance(batchSize, companyId);
  const taskCleanup = await applyDuplicateTaskMaintenance(batchSize, flashcardCleanup.canonicalFlashcardIds, companyId);
  return {
    companyId,
    duplicateFlashcardGroups: flashcardCleanup.groupsProcessed,
    archivedFlashcards: flashcardCleanup.archivedFlashcards,
    flashcardTaskRewires: flashcardCleanup.rewiredTasks,
    duplicateTaskGroups: taskCleanup.groupsProcessed,
    declinedTasks: taskCleanup.declinedTasks,
    taskRewires: taskCleanup.rewiredTasks,
  };
}

async function processNextCompanyCycle() {
  const selection = await selectNextCompanyForLane("companyCycle", POLL_INTERVAL_MS);
  if (!selection.companyId) {
    return { companyId: null, processed: false, idleDelayMs: selection.idleDelayMs };
  }

  const companyId = selection.companyId;
  const cycleStartedAt = Date.now();
  const poll = await runLane("poll", () => processPollingLane(companyId));
  const researchHarvest = await runLane("researchHarvest", async () => {
    const data = await getAllData(companyId);
    if (!data.company) {
      return { companyId, processed: 0, createdSources: 0, skipped: 0, reason: "company-missing" };
    }
    return harvestResearchSources(companyId, data.company, data, RESEARCH_HARVEST_BATCH_SIZE);
  });
  const flashcardRevisit = await runLane("flashcardRevisit", () => refreshOldestFlashcards(companyId, FLASHCARD_REVISIT_BATCH_SIZE));
  const taskRevisit = await runLane("taskRevisit", () => revisitOldestTasks(companyId, TASK_REVISIT_BATCH_SIZE));
  const feedbackReplay = await runLane("feedbackReplay", () => replayFeedback(companyId));
  const failsafeQueue = await runLane("failsafeQueue", () => processFailsafeQueue(companyId));
  const hashtagMaintenance = await runLane("hashtagMaintenance", () => processHashtagMaintenance(companyId));
  const cleanup = await runLane("cleanup", () => auditMaintenanceBacklog(CLEANUP_BATCH_SIZE, companyId));

  const result = {
    companyId,
    processed: true,
    poll,
    researchHarvest,
    flashcardRevisit,
    taskRevisit,
    feedbackReplay,
    failsafeQueue,
    hashtagMaintenance,
    cleanup,
  };
  const cycleDurationMs = Date.now() - cycleStartedAt;
  const cycleMetric = buildCompanyCycleMetric(companyId, result, cycleDurationMs);
  appendRuntimeMetric(cycleMetric);
  if (cycleMetric.cardsCreated > 0 || cycleMetric.flashcardsUpdated > 0 || cycleMetric.taskcardsUpdated > 0) {
    markMeaningfulProgress({
      companyId,
      lane: "companyCycle",
      cardsCreated: cycleMetric.cardsCreated,
      flashcardsUpdated: cycleMetric.flashcardsUpdated,
      taskcardsUpdated: cycleMetric.taskcardsUpdated,
    });
  }
  return { ...result, idleDelayMs: COMPANY_LANE_CONTINUE_DELAY_MS };
}

function scheduleCompanyCycleLoop(delayMs = 0) {
  setTimeout(() => {
    runLane("companyCycle", processNextCompanyCycle)
      .then((result) => {
        scheduleCompanyCycleLoop(result?.idleDelayMs ?? COMPANY_LANE_CONTINUE_DELAY_MS);
      })
      .catch((error) => {
        lastPollError = error.message;
        console.error("Company cycle scheduler failed:", error.message);
        scheduleCompanyCycleLoop(COMPANY_LANE_IDLE_DELAY_MS);
      });
  }, delayMs);
}

async function buildLaneBacklogEstimates() {
  if (!dbReady || !prisma) {
    return {};
  }

  const [
    companyCount,
    activeFlashcards,
    pendingTasks,
    feedbackCount,
    flashcardActionCount,
    pendingSourceTags,
    pendingFileTags,
    pendingFlashcardTags,
    pendingTaskTags,
    pendingTopicTags,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.flashcard.count({ where: { status: "ACTIVE" } }),
    prisma.nBAItem.count({ where: { createdBy: "local-ai", status: "PENDING" } }),
    prisma.feedback.count(),
    prisma.flashcardAction.count(),
    prisma.source.count({ where: { hashtagEvaluationPending: true } }),
    prisma.uploadedSourceFile.count({ where: { hashtagEvaluationPending: true } }),
    prisma.flashcard.count({ where: { hashtagEvaluationPending: true } }),
    prisma.nBAItem.count({ where: { hashtagEvaluationPending: true } }),
    prisma.topic.count({ where: { hashtagEvaluationPending: true } }),
  ]);

  return {
    companyCycle: companyCount,
    poll: companyCount,
    researchHarvest: activeFlashcards,
    flashcardRevisit: activeFlashcards,
    taskRevisit: pendingTasks,
    feedbackReplay: feedbackCount + flashcardActionCount,
    failsafeQueue: listFailsafeJobs().filter((job) => job.status === "PENDING" || job.status === "FAILED").length,
    hashtagMaintenance:
      pendingSourceTags +
      pendingFileTags +
      pendingFlashcardTags +
      pendingTaskTags +
      pendingTopicTags,
    cleanup: activeFlashcards + pendingTasks,
  };
}

async function parseRequestBody(req) {
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(data ? parseBooleanBody(data) : {});
    });
  });
}

async function handleSync(req, res) {
  try {
    if (!(await ensureDbReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: dbBlocker || "database unavailable" }));
      return;
    }
    if (!(await ensureModelReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: modelBlocker || "model unavailable" }));
      return;
    }

    if (req.headers.authorization !== `Bearer ${LOCAL_SYNC_SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const body = await parseRequestBody(req);
    const { companyId, dataType, action } = body;
    if (!companyId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "companyId required" }));
      return;
    }

    const result = await processCompany(companyId, { dataType, action, trigger: "sync" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, ...result }));
  } catch (error) {
    console.error("Checklist worker sync error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleForce(req, res) {
  try {
    if (!(await ensureDbReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: dbBlocker || "database unavailable" }));
      return;
    }
    if (!(await ensureModelReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: modelBlocker || "model unavailable" }));
      return;
    }

    const body = await parseRequestBody(req);
    if (!body.companyId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "companyId required" }));
      return;
    }

    const result = await processCompany(body.companyId, { trigger: "force" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, ...result }));
  } catch (error) {
    console.error("Checklist worker force error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleHealth(_req, res) {
  await ensureDbReady();
  await ensureModelReady();

  const backlog = await buildLaneBacklogEstimates().catch((error) => ({
    error: error.message,
  }));
  const lanes = Object.fromEntries(
    Object.entries(laneStates).map(([key, lane]) => [
      key,
      {
        health: classifyLaneHealth(lane),
        intervalMs: lane.intervalMs,
        batchSize: lane.batchSize,
        running: lane.running,
        lastStartedAt: lane.lastStartedAt,
        lastSucceededAt: lane.lastSucceededAt,
        lastFailedAt: lane.lastFailedAt,
        lastDurationMs: lane.lastDurationMs,
        lastError: lane.lastError,
        lastResult: lane.lastResult,
        backlog: typeof backlog === "object" && backlog !== null ? backlog[key] ?? null : null,
      },
    ]),
  );
  const progress = buildProgressState(backlog);

  const health = {
    status: dbReady && modelReady && progress.state === "healthy" ? "ok" : "degraded",
    ready: dbReady && modelReady,
    model: OLLAMA_MODEL,
    ollamaHost: OLLAMA_HOST,
    lastSync,
    settings: {
      // Surface the active runtime contract here so operators can verify that the
      // running worker picked up the configured cadence/timeout values.
      schedulingMode: "company-serial-cycle",
      companyCycleCooldownMs: POLL_INTERVAL_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      researchHarvestBatchSize: RESEARCH_HARVEST_BATCH_SIZE,
      ollamaTimeoutMs: OLLAMA_TIMEOUT_MS,
      failsafeModel: FAILSAFE_MODEL,
      failsafeModels: FAILSAFE_MODELS,
      failsafeTimeoutMs: FAILSAFE_TIMEOUT_MS,
      failsafeMaxAttempts: FAILSAFE_MAX_ATTEMPTS,
      researchTimeoutMs: RESEARCH_TIMEOUT_MS,
      flashcardRevisitIntervalMinutes: FLASHCARD_REVISIT_INTERVAL_MINUTES,
      flashcardRevisitBatchSize: FLASHCARD_REVISIT_BATCH_SIZE,
      taskRevisitIntervalMinutes: TASK_REVISIT_INTERVAL_MINUTES,
      taskRevisitBatchSize: TASK_REVISIT_BATCH_SIZE,
      feedbackReplayIntervalMinutes: FEEDBACK_REPLAY_INTERVAL_MINUTES,
      feedbackReplayBatchSize: FEEDBACK_REPLAY_BATCH_SIZE,
      hashtagMaintenanceIntervalHours: HASHTAG_MAINTENANCE_INTERVAL_HOURS,
      hashtagMaintenanceBatchSize: HASHTAG_MAINTENANCE_BATCH_SIZE,
      cleanupIntervalHours: CLEANUP_INTERVAL_HOURS,
      cleanupBatchSize: CLEANUP_BATCH_SIZE,
      taskMinIceScore: TASK_MIN_ICE_SCORE,
      flashcardMinConfidence: FLASHCARD_MIN_CONFIDENCE,
      flashcardMinImpact: FLASHCARD_MIN_IMPACT,
      flashcardMinWeight: FLASHCARD_MIN_WEIGHT,
      stuckRunningMs: STUCK_RUNNING_MS,
      noProgressMs: NO_PROGRESS_MS,
    },
    db: {
      configured: Boolean(currentDbUrl),
      ready: dbReady,
      blocker: dbBlocker,
    },
    ai: {
      ready: modelReady,
      blocker: modelBlocker,
    },
    researchEnabled: RESEARCH_ENABLED,
    hashtagMaintenance: {
      intervalHours: HASHTAG_MAINTENANCE_INTERVAL_HOURS,
      batchSize: HASHTAG_MAINTENANCE_BATCH_SIZE,
      lastRunAt: lastHashtagMaintenanceAt,
    },
    progress,
    lanes,
    appVersion: APP_VERSION,
    brainVersion: BRAIN_VERSION,
    lastPollError,
  };

  res.writeHead(health.ready ? 200 : 503, { "Content-Type": "application/json" });
  res.end(JSON.stringify(health));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/sync" && req.method === "POST") {
    await handleSync(req, res);
    return;
  }

  if (url.pathname === "/force" && req.method === "POST") {
    await handleForce(req, res);
    return;
  }

  if (url.pathname === "/health" || url.pathname === "/") {
    await handleHealth(req, res);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, async () => {
  console.log("--------------------------------------------------");
  console.log(`Checklist worker starting on port ${PORT}`);
  console.log(`AI Configuration: ${OLLAMA_MODEL} @ ${OLLAMA_HOST}`);
  console.log(`Poll lane: every ${Math.round(POLL_INTERVAL_MS / 1000)}s`);
  console.log(`Flashcard revisit lane: every ${FLASHCARD_REVISIT_INTERVAL_MINUTES}m, batch ${FLASHCARD_REVISIT_BATCH_SIZE}`);
  console.log(`Task revisit lane: every ${TASK_REVISIT_INTERVAL_MINUTES}m, batch ${TASK_REVISIT_BATCH_SIZE}`);
  console.log(`Feedback replay lane: every ${FEEDBACK_REPLAY_INTERVAL_MINUTES}m, batch ${FEEDBACK_REPLAY_BATCH_SIZE}`);
  console.log(`Hashtag maintenance lane: every ${HASHTAG_MAINTENANCE_INTERVAL_HOURS}h, batch ${HASHTAG_MAINTENANCE_BATCH_SIZE}`);
  console.log(`Cleanup lane: every ${CLEANUP_INTERVAL_HOURS}h, batch ${CLEANUP_BATCH_SIZE}`);
  console.log(`Fail-safe models: ${FAILSAFE_MODELS.join(", ")} (timeout ${FAILSAFE_TIMEOUT_MS}ms, max attempts ${FAILSAFE_MAX_ATTEMPTS})`);
  console.log(`Preferred quality floors: task ICE ${TASK_MIN_ICE_SCORE}, flashcard confidence ${FLASHCARD_MIN_CONFIDENCE}, impact ${FLASHCARD_MIN_IMPACT}, weight ${FLASHCARD_MIN_WEIGHT}`);
  console.log("--------------------------------------------------");

  if (!(await ensureDbReady())) {
    console.warn("\x1b[31m%s\x1b[0m", "⚠ DATABASE BLOCKER:");
    console.warn("\x1b[31m%s\x1b[0m", `  ${dbBlocker}`);
  }

  if (!(await ensureModelReady())) {
    console.warn("\x1b[31m%s\x1b[0m", "⚠ AI MODEL BLOCKER:");
    console.warn("\x1b[31m%s\x1b[0m", `  ${modelBlocker}`);
  }

  if (dbReady && modelReady) {
    console.log("\x1b[32m%s\x1b[0m", "✓ WORKER IS READY AND POLLING");
  } else {
    console.log("\x1b[33m%s\x1b[0m", "⚠ WORKER IS DEGRADED - check health endpoint for details");
  }
  console.log("--------------------------------------------------");

  scheduleCompanyCycleLoop(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
