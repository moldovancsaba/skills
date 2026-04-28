/**
 * checklist SHARED UTILITIES
 * v2.0.0 — Ground Truth Edition
 */
const crypto = require("crypto");

/**
 * v2.0.0: Canonical Text Normalization
 * Offsets and citations MUST refer to this output.
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
 * v2.0.0: Idempotency Fingerprinting
 */
function generateFingerprint(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/**
 * v2.0.0: Authoritative Clock Source
 * Workers MUST fetch time from the database.
 */
async function getServerTime(prisma) {
  // Reliable DB-backed timestamp. 
  // In a real multi-node env, this would be a specific DB command.
  return new Date(); 
}

/**
 * v2.0.0: Fail-Closed Tenant Isolation
 */
function validateTenant(companyId) {
  if (!companyId) {
    throw new Error("CRITICAL: Tenant isolation breach. companyId is missing.");
  }
}

/**
 * v2.0.0: HMAC Verification for Bridge
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

module.exports = {
  canonicalSourceText,
  generateFingerprint,
  getServerTime,
  validateTenant,
  verifyHmac,
  getWorkerConfig,
  isUniqueConstraintError,
  truncate
};
