const ATLAS_STORAGE_QUOTA_RETRY_AFTER_MS = 30 * 60 * 1000;
const RETRYABLE_QUOTA_KEYWORDS = [
  "over your space quota",
  "writes are blocked",
  "quota",
  "storage limit",
  "write blocked",
  "out of disk space",
  "insufficient disk space",
];

export type PersistenceFailureInfo = {
  kind: "ATLAS_STORAGE_QUOTA_BLOCKED";
  status: 503;
  retryable: true;
  retryAfterMs: number;
  reasonCode: "atlas_storage_quota_blocked";
  summary: string;
  details: string;
  prismaCode: string | null;
};

function readErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    const meta = record.meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta) && typeof (meta as Record<string, unknown>).message === "string") {
      return String((meta as Record<string, unknown>).message);
    }
  }
  return "";
}

function readPrismaCode(error: unknown) {
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === "string") return record.code;
  }
  return null;
}

function extractAtlasQuotaDetail(message: string) {
  if (!message) return "Atlas storage quota blocked write operations.";
  const normalized = message.replace(/\s+/g, " ").trim();
  const atlasMatch = normalized.match(/AtlasError\):\s*([^`]+?)(?:`|$)/i);
  if (atlasMatch?.[1]) return atlasMatch[1].trim();
  const writeBlockedMatch = normalized.match(/you are over your space quota[^.]*\.[^.]*Writes are blocked on your cluster\./i);
  if (writeBlockedMatch?.[0]) return writeBlockedMatch[0].trim();
  return normalized.length > 320 ? `${normalized.slice(0, 317).trimEnd()}...` : normalized;
}

function readErrorName(error: unknown) {
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const record = error as Record<string, unknown>;
    if (typeof record.name === "string") return record.name;
  }
  return null;
}

function includesText(target: string, values: string[]) {
  const normalized = target.toLowerCase();
  return values.some((entry) => normalized.includes(entry.toLowerCase()));
}

export function classifyPersistenceFailure(error: unknown): PersistenceFailureInfo | null {
  const message = readErrorMessage(error);
  const prismaCode = readPrismaCode(error);
  const errorName = readErrorName(error);
  const atlasErrorMeta = message.toLowerCase().includes("atlaserror");
  const quotaBlockedLike = includesText(message, RETRYABLE_QUOTA_KEYWORDS) || atlasErrorMeta || errorName === "MongoBulkWriteError";

  if (!quotaBlockedLike) return null;

  return {
    kind: "ATLAS_STORAGE_QUOTA_BLOCKED",
    status: 503,
    retryable: true,
    retryAfterMs: ATLAS_STORAGE_QUOTA_RETRY_AFTER_MS,
    reasonCode: "atlas_storage_quota_blocked",
    summary: "MongoDB Atlas is refusing writes because the cluster is over its storage quota.",
    details: extractAtlasQuotaDetail(message),
    prismaCode,
  };
}
