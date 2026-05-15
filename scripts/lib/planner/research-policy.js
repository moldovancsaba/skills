const { truncate } = require("../shared");
const { fetchUrlContent } = require("../fetcher");
const { deriveSourceProcessingStatus, getWeakestProcessingStatus } = require("../../../src/lib/source-contract");

const RESEARCH_STALE_DAYS = 14;
const RESEARCH_HIGH_ICE_THRESHOLD = 30;
const RESEARCH_LOW_CONFIDENCE_THRESHOLD = 6;

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isOlderThan(dateValue, days) {
  const date = toDate(dateValue);
  if (!date) return true;
  return (Date.now() - date.getTime()) > days * 24 * 60 * 60 * 1000;
}

function extractUrlsFromValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractUrlsFromValue(entry));
  }
  if (typeof value === "object") {
    return Object.values(value).flatMap((entry) => extractUrlsFromValue(entry));
  }
  if (typeof value !== "string") return [];
  return value.match(/https?:\/\/[^\s)>"']+/g) || [];
}

function listSourceUrls(sources = []) {
  return Array.from(new Set(
    sources.flatMap((source) => [
      ...extractUrlsFromValue(source?.provenance),
      ...extractUrlsFromValue(source?.metadata?.url),
      ...extractUrlsFromValue(source?.content),
      ...extractUrlsFromValue(source?.canonicalContent),
    ]),
  ));
}

function listFlashcardUrls(flashcards = []) {
  return Array.from(new Set(
    flashcards.flatMap((flashcard) => [
      ...extractUrlsFromValue(flashcard?.body),
      ...extractUrlsFromValue(flashcard?.title),
      ...extractUrlsFromValue(flashcard?.scoreProfile?.rationale?.sourceUrls),
    ]),
  ));
}

function deriveSourceSignals(sources = []) {
  const weakestStatus = sources.length > 0
    ? getWeakestProcessingStatus(sources.map((source) => deriveSourceProcessingStatus(source)))
    : null;
  const averageConfidence = sources.length > 0
    ? sources.reduce((sum, source) => sum + Number(source?.confidenceScore ?? source?.confidence ?? 0), 0) / sources.length
    : 0;
  const staleCount = sources.filter((source) => {
    const refreshedAt = source?.metadata?.lastCheckedAt || source?.updatedAt || source?.createdAt;
    return isOlderThan(refreshedAt, Number(source?.freshnessWindowDays || RESEARCH_STALE_DAYS));
  }).length;
  const weakCount = sources.filter((source) => Number(source?.confidenceScore ?? source?.confidence ?? 0) < RESEARCH_LOW_CONFIDENCE_THRESHOLD).length;
  return {
    weakestStatus,
    averageConfidence,
    staleCount,
    weakCount,
  };
}

function deriveFlashcardSignals(flashcards = []) {
  const averageConfidence = flashcards.length > 0
    ? flashcards.reduce((sum, flashcard) => sum + Number(flashcard?.confidenceScore ?? flashcard?.confidence ?? 0), 0) / flashcards.length
    : 0;
  const staleCount = flashcards.filter((flashcard) => {
    const refreshedAt = flashcard?.lastRescoredAt || flashcard?.updatedAt || flashcard?.createdAt;
    return isOlderThan(refreshedAt, RESEARCH_STALE_DAYS);
  }).length;
  const weakCount = flashcards.filter((flashcard) => Number(flashcard?.confidenceScore ?? flashcard?.confidence ?? 0) < RESEARCH_LOW_CONFIDENCE_THRESHOLD).length;
  const highPriorityCount = flashcards.filter((flashcard) => Number(flashcard?.iceScore ?? 0) >= RESEARCH_HIGH_ICE_THRESHOLD).length;
  return {
    averageConfidence,
    staleCount,
    weakCount,
    highPriorityCount,
  };
}

function buildResearchDecision({
  operation,
  urls = [],
  mandatory = false,
  shouldResearch = false,
  allowWithoutUrls = false,
  reason,
  signals = {},
}) {
  return {
    operation,
    mode: mandatory ? "MANDATORY" : shouldResearch ? "OPPORTUNISTIC" : "SKIP",
    shouldResearch: Boolean(shouldResearch && (allowWithoutUrls || urls.length > 0)),
    reason,
    urls: urls.slice(0, 3),
    signals: {
      ...signals,
      urlCount: urls.length,
    },
  };
}

function decideResearchPolicy({
  operation,
  company = null,
  inventory = null,
  sources = [],
  flashcards = [],
  entity = null,
}) {
  const sourceUrls = listSourceUrls(sources);
  const flashcardUrls = listFlashcardUrls(flashcards);
  const urls = Array.from(new Set([...sourceUrls, ...flashcardUrls]));
  const sourceSignals = deriveSourceSignals(sources);
  const flashcardSignals = deriveFlashcardSignals(flashcards);
  const combinedSignals = {
    datacardCount: Number(inventory?.datacardCount || 0),
    flashcardCount: Number(inventory?.flashcardCount || 0),
    weakestSourceStatus: sourceSignals.weakestStatus,
    sourceAverageConfidence: sourceSignals.averageConfidence,
    sourceStaleCount: sourceSignals.staleCount,
    sourceWeakCount: sourceSignals.weakCount,
    flashcardAverageConfidence: flashcardSignals.averageConfidence,
    flashcardStaleCount: flashcardSignals.staleCount,
    flashcardWeakCount: flashcardSignals.weakCount,
    flashcardHighPriorityCount: flashcardSignals.highPriorityCount,
    entityIceScore: Number(entity?.iceScore ?? 0),
  };

  switch (operation) {
    case "DATACARD_REFRESH":
      return buildResearchDecision({
        operation,
        urls,
        mandatory: urls.length > 0,
        shouldResearch: urls.length > 0,
        reason: urls.length > 0
          ? "Datacard refresh must fetch live content when a source URL exists."
          : "Datacard refresh has no reachable URL, so only local evidence can be used.",
        signals: combinedSignals,
      });
    case "FLASHCARD_REFRESH": {
      const shouldResearch = urls.length > 0 && (
        sourceSignals.staleCount > 0
        || sourceSignals.weakCount > 0
        || Number(entity?.iceScore ?? 0) >= RESEARCH_HIGH_ICE_THRESHOLD
        || Number(entity?.confidenceScore ?? entity?.confidence ?? 0) < RESEARCH_LOW_CONFIDENCE_THRESHOLD
      );
      return buildResearchDecision({
        operation,
        urls,
        mandatory: shouldResearch,
        shouldResearch,
        reason: shouldResearch
          ? "Flashcard refresh has stale, weak, or high-value upstream evidence and must re-check the web."
          : "Flashcard refresh can rely on linked local evidence without live research.",
        signals: combinedSignals,
      });
    }
    case "GOAL_REFRESH": {
      const shouldResearch = urls.length > 0 && (
        sourceSignals.staleCount > 0
        || sourceSignals.weakCount > 0
        || Number(entity?.iceScore ?? 0) >= RESEARCH_HIGH_ICE_THRESHOLD
        || Number(entity?.confidenceScore ?? entity?.confidence ?? 0) < RESEARCH_LOW_CONFIDENCE_THRESHOLD
      );
      return buildResearchDecision({
        operation,
        urls,
        mandatory: shouldResearch,
        shouldResearch,
        reason: shouldResearch
          ? "Goal refresh has stale, weak, or high-value upstream evidence and must re-check the web."
          : "Goal refresh can rely on linked local evidence without live research.",
        signals: combinedSignals,
      });
    }
    case "TASK_REFRESH": {
      const shouldResearch = urls.length > 0 && (
        flashcardSignals.staleCount > 0
        || flashcardSignals.weakCount > 0
        || flashcardSignals.highPriorityCount > 0
        || Number(entity?.iceScore ?? 0) >= RESEARCH_HIGH_ICE_THRESHOLD
        || Number(entity?.urgencyScore ?? 0) >= 0.75
      );
      return buildResearchDecision({
        operation,
        urls,
        mandatory: shouldResearch,
        shouldResearch,
        reason: shouldResearch
          ? "Task refresh has stale, weak, or strategically important upstream evidence and must re-check the web."
          : "Task refresh can proceed from existing flashcard evidence without live research.",
        signals: combinedSignals,
      });
    }
    case "FLASHCARD_CREATE": {
      const shouldResearch = urls.length > 0 && (
        Number(inventory?.flashcardCount || 0) < 10
        || sourceSignals.weakCount > 0
        || sourceSignals.staleCount > 0
        || sourceSignals.weakestStatus !== "VERIFIED"
      );
      return buildResearchDecision({
        operation,
        urls,
        mandatory: shouldResearch,
        shouldResearch,
        reason: shouldResearch
          ? "New flashcards need live research because inventory is low or source evidence is weak/stale."
          : "New flashcards can be drafted from strong recent datacards without live fetch.",
        signals: combinedSignals,
      });
    }
    case "TASK_CREATE": {
      const shouldResearch = urls.length > 0 && (
        flashcardSignals.weakCount > 0
        || flashcardSignals.staleCount > 0
        || flashcardSignals.highPriorityCount > 0
        || Number(inventory?.flashcardCount || 0) < 10
      );
      return buildResearchDecision({
        operation,
        urls,
        mandatory: shouldResearch,
        shouldResearch,
        reason: shouldResearch
          ? "New tasks need live research because the driving flashcards are weak, stale, or strategically high-value."
          : "New tasks can be drafted from strong recent flashcards without live fetch.",
        signals: combinedSignals,
      });
    }
    case "RESEARCH_BACKFILL": {
      const shouldResearch = Number(inventory?.datacardCount || 0) > 0
        && (
          Number(inventory?.flashcardCount || 0) < 10
          || Number(inventory?.datacardCount || 0) <= 3
        );
      return buildResearchDecision({
        operation,
        urls: [],
        mandatory: shouldResearch,
        shouldResearch,
        allowWithoutUrls: true,
        reason: shouldResearch
          ? "Company inventory is sparse, so research backfill should run to expand datacards."
          : "Company inventory is strong enough that backfill research is not required right now.",
        signals: combinedSignals,
      });
    }
    default:
      return buildResearchDecision({
        operation,
        urls,
        mandatory: false,
        shouldResearch: false,
        reason: "No explicit research policy matched this operation.",
        signals: combinedSignals,
      });
  }
}

async function buildResearchContextFromDecision(decision) {
  if (!decision?.shouldResearch || !Array.isArray(decision.urls) || decision.urls.length === 0) {
    return null;
  }

  const snippets = [];
  for (const url of decision.urls.slice(0, 2)) {
    try {
      const content = await fetchUrlContent(url);
      if (content?.content && Number(content?.status || 0) < 400) {
        snippets.push(`URL: ${url}\n${truncate(content.content, 1200)}`);
      }
    } catch (_error) {
      // Best effort only. Unreachable sources simply drop out of the context bundle.
    }
  }

  if (snippets.length === 0) return null;
  return `Fresh external research context (${decision.operation.toLowerCase()}):\n${snippets.join("\n\n---\n\n")}`;
}

module.exports = {
  RESEARCH_STALE_DAYS,
  RESEARCH_HIGH_ICE_THRESHOLD,
  RESEARCH_LOW_CONFIDENCE_THRESHOLD,
  listSourceUrls,
  listFlashcardUrls,
  decideResearchPolicy,
  buildResearchContextFromDecision,
};
