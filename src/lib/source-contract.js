const crypto = require("crypto");

const SOURCE_PROCESSING_STATUS_ORDER = Object.freeze({
  DRAFT: 0,
  CHECKED: 1,
  VERIFIED: 2,
  ACCEPTED: 2,
});

function canonicalizeSourceContent(raw) {
  if (!raw || typeof raw !== "string") return "";

  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeSourceContentHash(canonicalContent) {
  return crypto.createHash("sha256").update(String(canonicalContent || ""), "utf8").digest("hex");
}

function normalizeProcessingStatus(status) {
  const normalized = String(status || "DRAFT").toUpperCase();
  return SOURCE_PROCESSING_STATUS_ORDER[normalized] === undefined ? "DRAFT" : normalized === "ACCEPTED" ? "VERIFIED" : normalized;
}

function getWeakestProcessingStatus(statuses = []) {
  if (!statuses.length) return "DRAFT";
  return statuses
    .map(normalizeProcessingStatus)
    .sort((left, right) => (SOURCE_PROCESSING_STATUS_ORDER[left] ?? 0) - (SOURCE_PROCESSING_STATUS_ORDER[right] ?? 0))[0];
}

function deriveSourceProcessingStatus(source = {}) {
  if (source.processingStatus) {
    return normalizeProcessingStatus(source.processingStatus);
  }

  const content = String(source.canonicalContent || source.content || "").trim();
  const confidence = Number(source.confidenceScore ?? source.confidence ?? 0);
  const hasCanonicalHash = Boolean(source.canonicalContentHash || (content && computeSourceContentHash(canonicalizeSourceContent(content))));
  const hasProvenance = Boolean(
    source.provenance ||
    source.metadata?.url ||
    source.metadata?.bridgeChannel ||
    source.sourceType === "BRIDGE" ||
    source.sourceType === "UPLOAD" ||
    source.sourceType === "MANUAL" ||
    source.sourceType === "CRM",
  );

  if (content.length >= 160 && confidence >= 6 && hasCanonicalHash && hasProvenance) {
    return "VERIFIED";
  }
  if (content.length >= 60 && confidence >= 4 && hasCanonicalHash) {
    return "CHECKED";
  }
  return "DRAFT";
}

function buildSourceLifecycleData(input = {}) {
  const content = String(input.content || "");
  const canonicalContent = canonicalizeSourceContent(content);
  const canonicalContentHash = computeSourceContentHash(canonicalContent);
  const processingStatus = deriveSourceProcessingStatus({
    ...input,
    content,
    canonicalContent,
    canonicalContentHash,
  });

  return {
    canonicalContent,
    canonicalContentHash,
    processingStatus,
  };
}

module.exports = {
  SOURCE_PROCESSING_STATUS_ORDER,
  canonicalizeSourceContent,
  computeSourceContentHash,
  normalizeProcessingStatus,
  getWeakestProcessingStatus,
  deriveSourceProcessingStatus,
  buildSourceLifecycleData,
};
