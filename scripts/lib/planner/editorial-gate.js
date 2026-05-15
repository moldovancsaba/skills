const { truncate } = require("../shared");

const EDITORIAL_REVIEW_THRESHOLD = 4.8;

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function stripRepeatedPunctuation(value) {
  return String(value || "")
    .replace(/([!?.,])\1{1,}/g, "$1")
    .replace(/-{3,}/g, "--");
}

function normalizeTitle(value) {
  return stripRepeatedPunctuation(normalizeWhitespace(value))
    .replace(/^[\-\s:]+/, "")
    .replace(/\s+[-:]\s*$/, "");
}

function normalizeBody(value) {
  return stripRepeatedPunctuation(normalizeWhitespace(value));
}

function scoreGrammar(text) {
  const value = String(text || "");
  let score = 7;
  if (!value) return 1;
  if (/\s{2,}/.test(value)) score -= 1.2;
  if (/[!?.,]{2,}/.test(value)) score -= 1.4;
  if (/^[a-z]/.test(value)) score -= 0.8;
  if (!/[.!?]$/.test(value) && value.length > 60) score -= 0.8;
  if (/[A-Z]{5,}/.test(value)) score -= 1.2;
  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}

function scoreClarity(title, body) {
  let score = 7;
  const titleLength = String(title || "").length;
  const bodyLength = String(body || "").length;
  if (titleLength < 12 || titleLength > 140) score -= 1.2;
  if (bodyLength < 40) score -= 1.8;
  if (bodyLength > 900) score -= 0.8;
  if (/\b(maybe|stuff|things|somehow|various)\b/i.test(body)) score -= 1.5;
  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}

function scoreTone(title, body) {
  let score = 7.5;
  const text = `${title || ""} ${body || ""}`;
  if (/[!?]{2,}/.test(text)) score -= 1.2;
  if (/\b(amazing|incredible|revolutionary|best ever)\b/i.test(text)) score -= 1.5;
  if (/[A-Z]{5,}/.test(text)) score -= 1.2;
  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}

function scoreTitleQuality(title) {
  let score = 7;
  const value = String(title || "");
  if (value.length < 12) score -= 2;
  if (value.length > 140) score -= 1.5;
  if (/^(summary|task|goal|idea)\b[:\- ]*/i.test(value)) score -= 1.3;
  if (!/[a-z]/i.test(value)) score -= 2;
  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}

function scoreActionability(entityType, body) {
  if (entityType !== "TASK") return 7;
  let score = 6.5;
  const value = String(body || "");
  if (/\b(review|compare|audit|document|prepare|contact|validate|schedule|draft|benchmark|interview)\b/i.test(value)) score += 1.4;
  if (/\b(maybe|consider|explore eventually|someday)\b/i.test(value)) score -= 1.8;
  if (value.length < 60) score -= 1.2;
  return Math.max(1, Math.min(10, Number(score.toFixed(1))));
}

function assessEditorialQuality(entityType, candidate) {
  const title = normalizeTitle(candidate?.title);
  const body = normalizeBody(candidate?.body ?? candidate?.description);
  const dimensions = {
    grammar: scoreGrammar(body),
    clarity: scoreClarity(title, body),
    tone: scoreTone(title, body),
    titleQuality: scoreTitleQuality(title),
    actionability: scoreActionability(entityType, body),
  };
  const aggregate = Number((
    dimensions.grammar * 0.24 +
    dimensions.clarity * 0.24 +
    dimensions.tone * 0.14 +
    dimensions.titleQuality * 0.18 +
    dimensions.actionability * 0.20
  ).toFixed(2));
  const weakestDimension = Object.entries(dimensions).sort((left, right) => left[1] - right[1])[0]?.[0] || null;

  return {
    title,
    body,
    dimensions,
    aggregate,
    weakestDimension,
    shouldDowngrade: aggregate < EDITORIAL_REVIEW_THRESHOLD,
  };
}

function applyEditorialQualityGate(entityType, candidate = {}, options = {}) {
  const assessment = assessEditorialQuality(entityType, candidate);
  const output = {
    ...candidate,
    title: truncate(assessment.title, 160),
  };

  if ("body" in candidate) {
    output.body = truncate(assessment.body, Number(options.bodyLimit || 1200));
  }
  if ("description" in candidate) {
    output.description = truncate(assessment.body, Number(options.bodyLimit || 1200));
  }

  if (assessment.shouldDowngrade && !["DECLINED", "ARCHIVED"].includes(String(candidate.processingStatus || "").toUpperCase())) {
    output.processingStatus = "REVIEW";
  }

  output.editorialGate = assessment;
  return output;
}

module.exports = {
  EDITORIAL_REVIEW_THRESHOLD,
  assessEditorialQuality,
  applyEditorialQualityGate,
};
