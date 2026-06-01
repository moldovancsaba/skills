/**
 * checklist SHARED UTILITIES
 *
 * Shared normalization, validation, and worker helper functions used across
 * the local AI runtime.
 */
const crypto = require("crypto");
const { getStageModels } = require("./core");

/**
 * Canonical text normalization.
 * Offsets and citations should refer to this sanitized output.
 */
function canonicalSourceText(raw) {
  if (!raw) return "";
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Idempotency fingerprinting.
 */
function generateFingerprint(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * Runtime clock helper.
 * Uses the local process clock for timestamps in the single-node runtime.
 */
async function getServerTime(prisma) {
  // The prisma parameter is retained for compatible call-site usage.
  return new Date(); 
}

/**
 * Fail-closed tenant isolation.
 */
function validateTenant(companyId) {
  if (!companyId) {
    throw new Error("CRITICAL: Tenant isolation breach. companyId is missing.");
  }
}

/**
 * HMAC verification for bridge requests.
 */
function verifyHmac(payload, signature, secret) {
  if (!secret) return false;
  const hmac = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
  return hmac === signature;
}

async function getWorkerConfig(prisma, company, key, defaultValue) {
  const companyConfig = company?.workerConfig || {};
  if (companyConfig[key] !== undefined) return companyConfig[key];

  if (prisma) {
    const globalSetting = await prisma.globalSetting.findUnique({ where: { key } });
    if (globalSetting && globalSetting.value !== undefined) return globalSetting.value;
  }
  return defaultValue;
}

function isUniqueConstraintError(error) {
  return error && (error.code === 'P2002' || error.message?.includes('unique constraint'));
}

function truncate(str, length) {
  if (!str) return "";
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

function hashValue(val) {
  return crypto.createHash("sha256").update(String(val)).digest("hex");
}

function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const set1 = new Set(s1.toLowerCase().split(/\s+/));
  const set2 = new Set(s2.toLowerCase().split(/\s+/));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  return intersection.size / Math.max(set1.size, set2.size);
}

function tokenizeText(val) {
  return val.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(t => t.length > 3);
}

function unique(arr) {
  return [...new Set(arr)];
}

function parseBoundedInt(val, min, max) {
  const n = parseInt(val, 10);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseBoundedScore(val, min, max, precision = 1) {
  const n = Number.parseFloat(val);
  if (!Number.isFinite(n)) return min;
  const bounded = Math.max(min, Math.min(max, n));
  const factor = 10 ** precision;
  return Math.round(bounded * factor) / factor;
}

function stripTechnicalMetadata(text) {
  if (!text) return "";
  return String(text)
    .replace(/\[(?:TRACE|TOPIC_ID):[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}

function sanitizeUserFacingText(text) {
  return stripTechnicalMetadata(text).replace(/\s+/g, " ").trim();
}

function normalizeText(text) {
  return sanitizeUserFacingText(text);
}

async function nextPublicId(prisma, modelName) {
  const counterKey = `counter:${modelName.toLowerCase()}`;
  try {
    const counter = await prisma.publicIdCounter.upsert({
      where: { key: counterKey },
      create: { key: counterKey, value: 1000 },
      update: { value: { increment: 1 } }
    });
    return counter.value;
  } catch (err) {
    return Math.floor(Math.random() * 1000000);
  }
}

module.exports = {
  canonicalSourceText,
  generateFingerprint,
  getServerTime,
  validateTenant,
  verifyHmac,
  getWorkerConfig,
  isUniqueConstraintError,
  truncate,
  hashValue,
  similarity,
  tokenizeText,
  unique,
  parseBoundedInt,
  parseBoundedScore,
  getStageModels,
  stripTechnicalMetadata,
  sanitizeUserFacingText,
  normalizeText,
  nextPublicId
};
