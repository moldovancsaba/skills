/**
 * SOVEREIGN SHARED UTILITIES
 * v0.11.3-PRODUCTION
 */
const crypto = require("crypto");

function normalizeText(value) {
  if (!value) return "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max = 2000) {
  if (!value) return "";
  if (value.length <= max) return value;
  return value.slice(0, max - 3) + "...";
}

function hashValue(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function tokenizeText(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function unique(items) {
  return [...new Set(items)];
}

function normalizeHashtag(value) {
  if (!value) return null;
  const cleaned = normalizeText(value).replace(/\s+/g, "").toLowerCase();
  return cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
}

function normalizeHashtags(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map(normalizeHashtag).filter(Boolean);
}

function mergeHashtags(...groups) {
  const all = groups.flat().filter(Boolean);
  return unique(normalizeHashtags(all));
}

function clampInt(value, fallback, min = 1, max = 100) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseBoundedInt(value, min = 1, max = 100) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return null;
  return Math.min(Math.max(parsed, min), max);
}

function isUniqueConstraintError(error) {
  return error && (error.code === 'P2002' || error.message?.includes('unique constraint'));
}

/**
 * Provides the next sequential publicId for a specific scope (e.g., "Flashcard", "Source").
 */
async function nextPublicId(prisma, scope) {
  const counter = await prisma.publicIdCounter.upsert({
    where: { scope },
    update: { value: { increment: 1 } },
    create: { scope, value: 1 }
  });
  return counter.value;
}

/**
 * Fetches a configuration value from the Company's dynamic workerConfig or GlobalSetting.
 * Ensures zero hardcoding in the logic files.
 */
async function getWorkerConfig(prisma, company, key, fallback) {
  const companyConfig = company?.workerConfig || {};
  if (companyConfig[key] !== undefined) return companyConfig[key];

  // Check GlobalSetting
  if (prisma) {
    const globalSetting = await prisma.globalSetting.findUnique({
      where: { key }
    });
    if (globalSetting && globalSetting.value !== undefined) return globalSetting.value;
  }

  return fallback;
}

/**
 * Calculates the Nth percentile value from a list of numbers.
 */
function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * (sorted.length - 1));
  return sorted[index];
}

module.exports = {
  nextPublicId,
  getWorkerConfig,
  normalizeText,
  truncate,
  hashValue,
  similarity,
  tokenizeText,
  unique,
  normalizeHashtag,
  normalizeHashtags,
  mergeHashtags,
  clampInt,
  parseBoundedInt,
  calculatePercentile,
  isUniqueConstraintError
};
