"use strict";

const {
  normalizeOpportunityPayload,
  buildOpportunityFingerprint,
  rebalanceOpportunitycardBoard,
  looksCompanyLikeName,
} = require("../../src/lib/opportunitycards-runtime");
const {
  isScrapedPageEvidenceNoise,
} = require("../../src/lib/opportunitycard-contract");

function buildAfterWhere(baseWhere, lastRecord) {
  if (!lastRecord) return baseWhere;
  return {
    ...baseWhere,
    OR: [
      { createdAt: { gt: lastRecord.createdAt } },
      {
        createdAt: lastRecord.createdAt,
        id: { gt: lastRecord.id },
      },
    ],
  };
}

function compareOpportunityRepair(normalized, card) {
  return (
    normalized.companyName !== card.companyName ||
    normalized.title !== card.title ||
    normalized.body !== card.body ||
    normalized.website !== card.website ||
    normalized.linkedinUrl !== card.linkedinUrl ||
    normalized.instagramUrl !== card.instagramUrl ||
    normalized.facebookUrl !== card.facebookUrl ||
    normalized.xUrl !== card.xUrl ||
    normalized.location !== card.location ||
    normalized.coreOffer !== card.coreOffer ||
    normalized.financialBackground !== card.financialBackground ||
    normalized.fitRationale !== card.fitRationale ||
    normalized.opportunityType !== card.opportunityType ||
    JSON.stringify(normalized.hashtags || []) !== JSON.stringify(card.hashtags || []) ||
    JSON.stringify(normalized.salesGeographies || []) !== JSON.stringify(card.salesGeographies || []) ||
    JSON.stringify(normalized.contactInfo || {}) !== JSON.stringify(card.contactInfo || {}) ||
    normalized.confidence !== card.confidence ||
    normalized.confidenceScore !== card.confidenceScore ||
    normalized.impact !== card.impact ||
    normalized.weight !== card.weight ||
    normalized.iceScore !== card.iceScore ||
    normalized.processingStatus !== undefined && normalized.processingStatus !== card.processingStatus ||
    normalized.activityState !== undefined && normalized.activityState !== card.activityState ||
    normalized.fingerprint !== card.fingerprint ||
    JSON.stringify(card.scoreProfile || null) !== JSON.stringify(normalized.scoreProfile || null)
  );
}

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function deriveCompanyNameFromUrl(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`);
    const label = url.hostname.replace(/^www\./i, "").split(".")[0] || "";
    const cleaned = label
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return null;
    return cleaned
      .split(" ")
      .map((part) => {
        const upper = part.toUpperCase();
        return upper.length <= 4 ? upper : part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  } catch {
    return null;
  }
}

function isWeakSingleWordIdentity(value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return /^[A-Za-z0-9]{2,24}$/.test(normalized);
}

function repairOpportunityIdentity(card) {
  const sourceEvidenceIsNoisy = isScrapedPageEvidenceNoise(card.body) || isScrapedPageEvidenceNoise(card.coreOffer);
  if (!sourceEvidenceIsNoisy) {
    return {
      companyName: card.companyName,
      title: card.title,
    };
  }

  const fallbackName = deriveCompanyNameFromUrl(card.website);
  if (!fallbackName) {
    return {
      companyName: card.companyName,
      title: card.title,
    };
  }

  return {
    companyName: isWeakSingleWordIdentity(card.companyName) ? fallbackName : card.companyName,
    title: isWeakSingleWordIdentity(card.title) ? fallbackName : card.title,
  };
}

function shouldArchiveOpportunitycard(card) {
  if (String(card.processingStatus || "").toUpperCase() === "DECLINED" && String(card.activityState || "").toUpperCase() !== "ARCHIVED") {
    return true;
  }
  const hasWebsite = typeof card.website === "string" && card.website.trim().length > 0;
  const companyNameLooksValid = looksCompanyLikeName(card.companyName);
  const titleLooksValid = looksCompanyLikeName(card.title);
  return !hasWebsite && !companyNameLooksValid && !titleLooksValid;
}

async function repairOpportunitycards(prisma, options = {}) {
  const batchSize = Math.max(1, Number.parseInt(String(options.batchSize || "100"), 10) || 100);
  const maxBatches = Number.isFinite(Number(options.maxBatches))
    ? Math.max(1, Number(options.maxBatches))
    : Number.POSITIVE_INFINITY;
  const companyId = typeof options.companyId === "string" && options.companyId ? options.companyId : null;
  const startAfter = options.startAfter && typeof options.startAfter === "object" ? options.startAfter : null;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  let updated = 0;
  let processed = 0;
  let batchesProcessed = 0;
  let lastRecord = startAfter?.createdAt && startAfter?.id
    ? { createdAt: new Date(String(startAfter.createdAt)), id: String(startAfter.id) }
    : null;
  let completed = false;
  const touchedCompanyIds = new Set();

  while (true) {
    if (batchesProcessed >= maxBatches) break;

    const cards = await prisma.opportunitycard.findMany({
      where: buildAfterWhere(companyId ? { companyId } : {}, lastRecord),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        companyId: true,
        createdAt: true,
        companyName: true,
        title: true,
        body: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        facebookUrl: true,
        xUrl: true,
        location: true,
        coreOffer: true,
        financialBackground: true,
        fitRationale: true,
        opportunityType: true,
        hashtags: true,
        salesGeographies: true,
        contactInfo: true,
        confidence: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        iceScore: true,
        scoreProfile: true,
        fingerprint: true,
        kanbanColumn: true,
        processingStatus: true,
        activityState: true,
        manualLaneOverrideAt: true,
      },
    });

    if (cards.length === 0) {
      completed = true;
      break;
    }

    let batchUpdated = 0;
    const batchTouchedCompanyIds = new Set();

    for (const card of cards) {
      processed += 1;
      const repairedIdentity = repairOpportunityIdentity(card);
      const normalized = normalizeOpportunityPayload({
        companyName: repairedIdentity.companyName,
        title: repairedIdentity.title,
        body: card.body,
        website: card.website,
        linkedinUrl: card.linkedinUrl,
        instagramUrl: card.instagramUrl,
        facebookUrl: card.facebookUrl,
        xUrl: card.xUrl,
        location: card.location,
        coreOffer: card.coreOffer,
        financialBackground: card.financialBackground,
        fitRationale: card.fitRationale,
        opportunityType: card.opportunityType,
        hashtags: card.hashtags,
        salesGeographies: card.salesGeographies,
        contactInfo: card.contactInfo,
        confidence: card.confidenceScore ?? card.confidence,
        confidenceScore: card.confidenceScore ?? card.confidence,
        impact: card.impact,
        weight: card.weight,
        scoreProfile: card.scoreProfile,
      });
      const fingerprint = buildOpportunityFingerprint({
        website: normalized.website,
        companyName: normalized.companyName,
        opportunityType: normalized.opportunityType,
      });
      const repaired = {
        ...normalized,
        fingerprint,
      };

      if (shouldArchiveOpportunitycard(card)) {
        repaired.processingStatus = "DECLINED";
        repaired.activityState = "ARCHIVED";
      }

      if (compareOpportunityRepair(repaired, card)) {
        await prisma.opportunitycard.update({
          where: { id: card.id },
          data: repaired,
        });
        updated += 1;
        batchUpdated += 1;
        if (card.companyId) {
          touchedCompanyIds.add(card.companyId);
          batchTouchedCompanyIds.add(card.companyId);
        }
      }
    }

    lastRecord = cards[cards.length - 1];
    batchesProcessed += 1;
    if (cards.length < batchSize) {
      completed = true;
    }
    if (onProgress) {
      await onProgress({
        processed,
        updated,
        batchProcessed: cards.length,
        batchUpdated,
        batchSize,
        companyId,
        batchesProcessed,
        completed,
        cursor: completed || !lastRecord
          ? null
          : {
              createdAt: lastRecord.createdAt.toISOString(),
              id: lastRecord.id,
            },
        touchedCompanyIds: [...batchTouchedCompanyIds],
      });
    }
    if (completed) break;
  }

  for (const touchedCompanyId of touchedCompanyIds) {
    await rebalanceOpportunitycardBoard(prisma, touchedCompanyId);
  }

  return {
    processed,
    updated,
    companyId,
    batchesProcessed,
    completed,
    cursor: completed || !lastRecord
      ? null
      : {
          createdAt: lastRecord.createdAt.toISOString(),
          id: lastRecord.id,
        },
    touchedCompanyIds: [...touchedCompanyIds],
  };
}

module.exports = {
  compareOpportunityRepair,
  repairOpportunitycards,
};
