import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env", override: false });

const prisma = new PrismaClient();
const comparePublicCopy = JSON.parse(
  readFileSync(new URL("../src/config/compare-public-copy.json", import.meta.url), "utf8"),
);

function parseArgs(argv) {
  const args = {
    companyId: "",
    visitorKey: "compare",
    outDir: "logs",
    limit: 20,
    cleanCatalog: false,
    syncCatalogOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--companyId") {
      args.companyId = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (token === "--visitorKey") {
      args.visitorKey = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (token === "--outDir") {
      args.outDir = String(argv[index + 1] || "logs").trim() || "logs";
      index += 1;
    } else if (token === "--limit") {
      const raw = Number(argv[index + 1]);
      if (Number.isFinite(raw)) args.limit = Math.max(1, Math.min(100, Math.trunc(raw)));
      index += 1;
    } else if (token === "--clean") {
      args.cleanCatalog = true;
    } else if (token === "--no-clean") {
      args.cleanCatalog = false;
    } else if (token === "--sync-catalog-only") {
      args.syncCatalogOnly = true;
      args.cleanCatalog = true;
    }
  }
  return args;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function json(value) {
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter(Boolean)
    .filter((entry) => entry.length <= 200);
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSourceUrl(value) {
  const raw = asString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    return url.toString().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function normalizeVisitorKey(value) {
  return asString(value).toLowerCase();
}

function hasSuspiciousCopy(value) {
  const text = asString(value).toLowerCase();
  if (!text) return false;
  return [
    "source-backed",
    "source backed",
    "check local",
    "source verified",
    "should refresh",
    "should be refreshed",
    "before showing",
    "publicly",
    "publishes this",
    "checkout",
    "this listing is",
    "this is intentionally",
    "intentionally marked",
    "not yet extracted",
    "not stable",
    "should be updated",
    "before publishing",
    "published by check local",
    "should not be shown",
    "compare listing",
    "listing for",
    "verified listing for",
    "published listing",
    "offers activities",
  ].some((token) => text.includes(token));
}

function sanitizeCopyText(value) {
  const text = asString(value);
  if (!text) return "";
  const cleaned = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !hasSuspiciousCopy(sentence))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned && !hasSuspiciousCopy(cleaned) ? cleaned : "";
}

function sanitizeComparePayloadForStorage(inputPayload, sourceUrl = "") {
  const payload = asRecord(inputPayload) ?? {};
  const localized = asRecord(payload.localized) ?? {};

  const next = {
    ...payload,
    localized: {
      en: sanitizeLocalizedCopy(localized.en),
      hu: sanitizeLocalizedCopy(localized.hu),
      it: sanitizeLocalizedCopy(localized.it),
    },
    announcementBadge: sanitizeCopyText(asString(payload.announcementBadge) || asString(payload.badge)),
    shortDescription: sanitizeCopyText(asString(payload.shortDescription) || asString(payload.short)),
    longDescription: sanitizeCopyText(asString(payload.longDescription) || asString(payload.long)),
  };

  if (payload.badge && !payload.announcementBadge) delete next.badge;
  if (payload.short && !payload.shortDescription) delete next.short;
  if (payload.long && !payload.longDescription) delete next.long;
  return next;
}

function sanitizeLocalizedCopy(value) {
  const safe = asRecord(value);
  if (!safe) return {};

  const legacyBadge = asString(safe.badge);
  const legacyShort = asString(safe.short);
  const legacyLong = asString(safe.long);
  const announcementBadge = asString(safe.announcementBadge) || legacyBadge;
  const shortDescription = asString(safe.shortDescription) || legacyShort;
  const longDescription = asString(safe.longDescription) || legacyLong;
  const next = {
    ...safe,
    announcementBadge: sanitizeCopyText(announcementBadge),
    shortDescription: sanitizeCopyText(shortDescription),
    longDescription: sanitizeCopyText(longDescription),
  };

  if (safe.badge && !safe.announcementBadge) delete next.badge;
  if (safe.short && !safe.shortDescription) delete next.short;
  if (safe.long && !safe.longDescription) delete next.long;

  return next;
}

const CONTENT_TYPE_LABELS = {
  range: "Range",
  shooting_school: "Shooting School",
  hunter_education: "Hunter Education",
  club: "Club",
  competition: "Competition",
  expo: "Expo",
  source_only: "Source Only",
  unknown: "",
};

function pickContentTypeLabel(type) {
  return CONTENT_TYPE_LABELS[normalizeVisitorKey(type)] || "";
}

function buildSafeDraftPayload({ sourceUrl, sourceDatacard }) {
  const facts = asRecord(sourceDatacard.extractedFacts) ?? {};
  const sourceDraftPayload = asRecord(sourceDatacard.publicDraftPayload) ?? {};
  const { provider: draftProvider, ...draftPayload } = sourceDraftPayload;
  const contentType = asString(
    asStringArray(sourceDatacard.knownContentTypes)[0] || asString(draftPayload.contentType) || asString(draftPayload.type) || asString(sourceDatacard.sourceKind),
  ) || "unknown";
  const name = asString(draftPayload.name) || asString(facts.title) || asString(sourceDatacard.sourceTitle);
  const provider = asString(draftProvider) || asString(facts.provider) || name;
  const location = asString(draftPayload.address) || asString(facts.location) || asString(draftPayload.neighborhood) || "";
  const category = asString(draftPayload.category) || pickContentTypeLabel(contentType);
  const localizedSource = asRecord(draftPayload.localized) ?? {};
  const localized = {
    en: sanitizeLocalizedCopy(localizedSource.en),
    hu: sanitizeLocalizedCopy(localizedSource.hu),
    it: sanitizeLocalizedCopy(localizedSource.it),
  };

  const safeTopShort = (() => {
    const shortText = asString(draftPayload.shortDescription);
    const candidate = shortText || asString(draftPayload.short);
    return sanitizeCopyText(candidate);
  })();

  const safeTopLong = (() => {
    const longText = asString(draftPayload.longDescription);
    const candidate = longText || asString(draftPayload.long);
    return sanitizeCopyText(candidate);
  })();

  return {
    ...draftPayload,
    catalogProject: "compare",
    image: asString(draftPayload.image),
    galleryImages: Array.isArray(draftPayload.galleryImages) ? draftPayload.galleryImages : [],
    rating: asNumber(draftPayload.rating),
    reviewCount: asNumber(draftPayload.reviewCount),
    badges: asRecordArray(draftPayload.badges),
    bookingEnabled: draftPayload.bookingEnabled === true,
    localized,
    publishedAt: asString(draftPayload.publishedAt) || nowIso(),
    updatedAt: nowIso(),
    id: asString(draftPayload.id) || hash(`compare:${sourceUrl}`).slice(0, 24),
    name,
    category,
    borough: asString(draftPayload.borough) || asString(facts.country) || "",
    neighborhood: asString(draftPayload.neighborhood) || location,
    address: asString(draftPayload.address) || location,
    activityTypes: asStringArray(draftPayload.activityTypes),
    ageRanges: asStringArray(draftPayload.ageRanges),
    dayTimeTags: asStringArray(draftPayload.dayTimeTags),
    pricePerClass: asNumber(draftPayload.pricePerClass),
    shortDescription: safeTopShort,
    longDescription: safeTopLong,
    email: asString(draftPayload.email),
    website: asString(draftPayload.website) || sourceUrl,
    phone: asString(draftPayload.phone),
  };
}

function asRecordArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry !== undefined && entry !== null);
}

function safeMetadataParse(value) {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return asRecord(value) || {};
}

async function ensureCompany(companyId) {
  if (companyId) {
    const existing = await prisma.company.findUnique({ where: { id: companyId } });
    if (existing) return existing;
  }
  const named = await prisma.company.findFirst({
    where: {
      OR: [
        { name: { equals: "Compare", mode: "insensitive" } },
  ],
    },
    orderBy: { updatedAt: "desc" },
  });
  if (named) return named;
  return prisma.company.create({
    data: {
      name: "Compare",
      industry: "sport_shooting_hunting",
      industries: ["sport_shooting_hunting"],
      description: "CHECK Visitor unit for verified sport shooting and hunting discovery in Hungary.",
      targetMarket: "Hunters, sport shooters, clubs, training seekers",
    },
  });
}

async function ensureDestinationInstance(companyId) {
  const existing = await prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey: "compare", isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.destinationInstance.create({
    data: {
      companyId,
      destinationKey: "compare",
      name: "Compare",
      authRef: "check-local-compare-bridge",
      config: {
        visitor: {
          blueprints: {
            "compare": {
              visitorKey: "compare",
              state: "active",
              industry: "sport_shooting_hunting",
              location: { country: "Hungary", geoGranularity: "country" },
              audience: ["hunters", "sport shooters", "clubs", "training seekers"],
              publicPromise: "Find verified ranges, training, competitions, clubs, and hunting-related events in Hungary.",
              taxonomyVersion: "v1",
              sourcePolicyVersion: "v1",
              qualityGateVersion: "v1",
              feedbackPolicyVersion: "v1",
            },
          },
        },
      },
    },
  });
}

async function listSourceCards(instanceId, visitorKey, limit) {
  const rows = await prisma.destinationSourceDocument.findMany({
    where: {
      destinationInstanceId: instanceId,
      sourceType: "visitor_datacard",
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const normalizedVisitor = normalizeVisitorKey(visitorKey);
  const latestByUrl = new Map();

  for (const row of rows) {
    const metadata = safeMetadataParse(row.metadata);
    const sourceDatacard = asRecord(metadata.visitorSourceDatacard);
    if (!sourceDatacard) continue;

    const sourceUrl = normalizeSourceUrl(
      asString(sourceDatacard.canonicalUrl) || asString(sourceDatacard.url) || asString(row.sourceUrl),
    );
    if (!sourceUrl) continue;
    const datacardVisitorKey = normalizeVisitorKey(sourceDatacard.visitorKey || normalizedVisitor);
    if (normalizedVisitor && datacardVisitorKey !== normalizedVisitor) continue;
    if (asString(sourceDatacard.trustTier).toLowerCase() === "blocked") continue;
    if (latestByUrl.has(sourceUrl)) continue;

    latestByUrl.set(sourceUrl, {
      sourceDocumentId: row.id,
      sourceUrl,
      sourceDatacard: {
        ...sourceDatacard,
        datacardType: asString(sourceDatacard.datacardType) || "source_datacard",
        url: normalizeSourceUrl(asString(sourceDatacard.url) || sourceUrl),
        canonicalUrl: sourceUrl,
      },
      fetchedAt: row.updatedAt,
      sourceFacts: asRecord(sourceDatacard.extractedFacts) ?? {},
    });
  }

  const cards = [...latestByUrl.values()].slice(0, limit);
  return cards;
}

function buildVisitorSourceKey(sourceDatacard) {
  return normalizeVisitorKey(asString(sourceDatacard.visitorKey) || "compare");
}

async function sanitizeSourceDocument(sourceCard) {
  const sourceUrl = sourceCard.sourceUrl;
  const sourceDatacard = asRecord(sourceCard.sourceDatacard) ?? {};
  const safePayload = buildSafeDraftPayload({ sourceUrl, sourceDatacard: { ...sourceDatacard, extractedFacts: sourceCard.sourceFacts } });
  const currentMeta = safeMetadataParse(await prisma.destinationSourceDocument
    .findUnique({ where: { id: sourceCard.sourceDocumentId }, select: { metadata: true } })
    .then((value) => value?.metadata));
  const currentDatacard = asRecord(currentMeta.visitorSourceDatacard);
  if (!currentDatacard) return { sourceCard, payload: safePayload, changed: false };

  const alreadySafe = JSON.stringify(currentDatacard.publicDraftPayload ?? {}) === JSON.stringify(safePayload);
  if (alreadySafe) return { sourceCard, payload: safePayload, changed: false };

  await prisma.destinationSourceDocument.update({
    where: { id: sourceCard.sourceDocumentId },
    data: {
      metadata: json({
        ...currentMeta,
        visitorSourceDatacard: {
          ...currentDatacard,
          publicDraftPayload: safePayload,
        },
      }),
      fetchedAt: sourceCard.fetchedAt instanceof Date ? sourceCard.fetchedAt : undefined,
    },
  });

  return { sourceCard, payload: safePayload, changed: true };
}

async function repairPersistedPayloads(instanceId) {
  const candidates = await prisma.destinationCandidate.findMany({
    where: { destinationInstanceId: instanceId },
    select: { id: true, canonicalSourceUrl: true, metadata: true },
  });
  const candidateIds = candidates.map((candidate) => candidate.id);
  const allDrafts = candidateIds.length > 0
    ? await prisma.destinationDraft.findMany({
      where: { candidateId: { in: candidateIds } },
      select: { id: true, candidateId: true, draftJson: true },
    })
    : [];
  const draftsByCandidate = new Map();
  for (const draft of allDrafts) {
    const current = draftsByCandidate.get(draft.candidateId) ?? [];
    current.push(draft);
    draftsByCandidate.set(draft.candidateId, current);
  }
  let repairedCandidateCount = 0;
  let repairedDraftCount = 0;

  for (const candidate of candidates) {
    const sourceUrl = candidate.canonicalSourceUrl;
    const metadata = safeMetadataParse(candidate.metadata);
    const currentPublicDraft = asRecord(metadata.publicDraftPayload);
    if (!currentPublicDraft) continue;

    const cleanPayload = sanitizeComparePayloadForStorage(currentPublicDraft, sourceUrl);
    if (JSON.stringify(cleanPayload) !== JSON.stringify(currentPublicDraft)) {
      repairedCandidateCount += 1;
      await prisma.destinationCandidate.update({
        where: { id: candidate.id },
        data: {
          metadata: json({
            ...metadata,
            publicDraftPayload: cleanPayload,
          }),
        },
      });
    }

    const relatedDrafts = draftsByCandidate.get(candidate.id) ?? [];
    for (const draft of relatedDrafts) {
      const draftPayload = asRecord(draft.draftJson) ?? {};
      if (Object.keys(draftPayload).length > 0) {
        const cleanDraftPayload = sanitizeComparePayloadForStorage(draftPayload, sourceUrl);
        if (JSON.stringify(cleanDraftPayload) !== JSON.stringify(draftPayload)) {
          repairedDraftCount += 1;
          await prisma.destinationDraft.update({
            where: { id: draft.id },
            data: { draftJson: json(cleanDraftPayload) },
          });
        }
      }
    }
  }

  return {
    repairedCandidateCount,
    repairedDraftCount,
  };
}

async function cleanCompareCatalog() {
  return compareFetch("/api/ingest", {
    operations: [
      { resource: "providers", action: "replaceAll", documents: [] },
      { resource: "meetupGroups", action: "replaceAll", documents: [] },
      {
        resource: "site",
        action: "patch",
        patch: {
          guides: [],
          locationHeroImages: [],
          homeHeroUrl: "",
          discoverHeroUrl: "",
          publicCopy: comparePublicCopy,
          publicLocales: ["en", "hu", "it"],
          publicDefaultLocale: "en",
          publicCopyMaintainedAt: nowIso(),
          publicCopyMaintainedBy: "CHECK Local verified Compare publisher",
        },
      },
    ],
  });
}

async function compareFetch(path, body) {
  const baseUrl = String(process.env.COMPARE_BASE_URL || "").replace(/\/$/, "");
  const ingestKey = String(process.env.COMPARE_INGEST_API_KEY || "").trim();
  if (!baseUrl || !ingestKey) {
    throw new Error("COMPARE_BASE_URL and COMPARE_INGEST_API_KEY are required");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Compare ${path} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

function shouldPublishFromCard(sourceDatacard) {
  const extracted = asRecord(sourceDatacard.extractedFacts) ?? {};
  const hasTitle = asString(sourceDatacard.sourceTitle || extracted.title) !== "";
  const hasSource = asString(sourceDatacard.sourceUrl || sourceDatacard.url || sourceDatacard.canonicalUrl) !== "";
  const autoPublishEligible = sourceDatacard.autoPublishEligible !== false;
  return hasTitle && hasSource && autoPublishEligible;
}

function isImgBbHttpsImageUrl(value) {
  const url = asString(value);
  if (!url || !/^https:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "i.ibb.co" || host === "ibb.co" || host === "image.ibb.co" || host.endsWith(".ibb.co");
  } catch {
    return false;
  }
}

function validatePublicReadyComparePayload(payload) {
  const issues = [];
  if (asString(payload.catalogProject) !== "compare") issues.push("public_scope_mismatch");
  if (!asString(payload.name)) issues.push("missing_name");
  if (!isImgBbHttpsImageUrl(payload.image)) issues.push("missing_uploaded_public_image");
  const descriptions = [payload.shortDescription, payload.longDescription]
    .map(asString)
    .filter(Boolean);
  if (descriptions.length === 0 || descriptions.every((description) => description.length < 50)) {
    issues.push("missing_public_content_summary");
  }
  if (descriptions.some(hasSuspiciousCopy)) issues.push("backend_or_placeholder_copy_leak");
  return [...new Set(issues)];
}

async function publishListing(companyId, instance, listing) {
  const instanceId = instance.id;
  const sourceCard = listing.sourceCard;
  const sourceDatacard = asRecord(sourceCard.sourceDatacard);
  const sourceFacts = asRecord(listing.sourceFacts) ?? asRecord(sourceDatacard.extractedFacts) ?? {};

  const sourceUrl = listing.sourceUrl;
  const sourcePayload = listing.sanitizedPayload;
  const publicReadyIssues = validatePublicReadyComparePayload(sourcePayload);
  if (publicReadyIssues.length > 0) {
    throw new Error(`Compare payload is not public-ready for ${sourceUrl}: ${publicReadyIssues.join(", ")}`);
  }
  const contentType = asString(asStringArray(sourceDatacard.knownContentTypes)[0] || "unknown");
  // keep stable candidate keying; datacard id is retained for traceability.
  const datacardId = asString(sourceDatacard.sourceId || sourcePayload.id || hash(sourceUrl).slice(0, 20));
  const visitorKey = normalizeVisitorKey(sourceDatacard.visitorKey || "compare");
  const fingerprint = hash(`${visitorKey}|${sourceUrl}|${contentType}|${asString(sourcePayload.name)}`);
  const name = asString(sourcePayload.name);

  const workflowRun = await prisma.destinationWorkflowRun.create({
    data: {
      companyId,
      destinationInstanceId: instanceId,
      workflowKind: "compare_source_backed_publish",
      state: "PUBLISHING",
      currentStage: "PUBLISH_REVIEWED_DRAFT",
      metadata: json({
        source: "publish-compare-source-backed-content",
        visitorKey,
        sourceUrl,
        generatedAt: nowIso(),
        sourceDocumentId: sourceCard.sourceDocumentId,
      }),
    },
  });

  const sourceDoc = await prisma.destinationSourceDocument.findFirst({
    where: { id: sourceCard.sourceDocumentId },
    select: { id: true, sourceUrl: true, metadata: true },
  });
  if (!sourceDoc) {
    throw new Error(`Source document missing for ${sourceUrl}`);
  }

  const sourceDatacardMetadata = safeMetadataParse(sourceDoc.metadata);
  const sourceDatacardRecord = asRecord(sourceDatacardMetadata.visitorSourceDatacard) ?? {};
  const now = nowIso();
  await prisma.destinationSourceDocument.update({
    where: { id: sourceDoc.id },
    data: {
      sourceUrl,
      metadata: json({
        ...sourceDatacardMetadata,
        visitorSourceDatacard: {
          ...sourceDatacardRecord,
          sourceId: datacardId,
          visitorKey,
          datacardType: sourceDatacardRecord.datacardType || "trusted_source_datacard",
          url: sourceUrl,
          canonicalUrl: sourceUrl,
          sourceKind: asString(sourceDatacardRecord.sourceKind) || "official_site",
          trustTier: asString(sourceDatacardRecord.trustTier) || "trusted",
          industryRelevance: Number.isFinite(Number(sourceDatacardRecord.industryRelevance))
            ? Number(sourceDatacardRecord.industryRelevance)
            : 1,
          locationRelevance: Number.isFinite(Number(sourceDatacardRecord.locationRelevance))
            ? Number(sourceDatacardRecord.locationRelevance)
            : 1,
          extractionHints: asStringArray(sourceDatacardRecord.extractionHints),
          knownContentTypes: asStringArray(sourceDatacardRecord.knownContentTypes),
          sourceTitle: asString(sourceDatacardRecord.sourceTitle) || asString(sourcePayload.name),
          entityKind: asString(sourceDatacardRecord.entityKind) || "provider",
          extractedFacts: sourceFacts,
          publicDraftPayload: sourcePayload,
          autoPublishEligible: true,
          refreshCadenceDays: Number(sourceDatacardRecord.refreshCadenceDays) || 14,
          lastCheckedAt: now,
          createdAt: sourceDatacardRecord.createdAt || now,
          updatedAt: now,
        },
      }),
      fetchedAt: new Date(),
    },
  });

  const candidate = await prisma.destinationCandidate.upsert({
    where: {
      companyId_destinationInstanceId_candidateFingerprint: {
        companyId,
        destinationInstanceId: instanceId,
        candidateFingerprint: fingerprint,
      },
    },
    update: {
      workflowRunId: workflowRun.id,
      canonicalSourceUrl: sourceUrl,
      proposedType: contentType,
      status: "PUBLISHING",
      dedupeStatus: "UNIQUE",
      metadata: json({
        visitorKey,
        sourceDatacardId: datacardId,
        visitorCandidateState: "APPROVED",
        sourceDatacardIds: [sourceCard.sourceDocumentId],
        sourceTrustTier: asString(sourceDatacard.trustTier) || "trusted",
        entityKind: asString(sourceDatacard.entityKind) || "provider",
        adapterVersion: "visitor-public-draft-adapter@v1",
        publicDraftPayload: sourcePayload,
        extractedFacts: sourceFacts,
        autoPublishEligible: true,
        sourceUrl,
      }),
    },
    create: {
      companyId,
      destinationInstanceId: instanceId,
      workflowRunId: workflowRun.id,
      candidateFingerprint: fingerprint,
      canonicalSourceUrl: sourceUrl,
      proposedType: contentType,
      status: "PUBLISHING",
      dedupeStatus: "UNIQUE",
      metadata: json({
        visitorKey,
        sourceDatacardId: datacardId,
        visitorCandidateState: "APPROVED",
        sourceDatacardIds: [sourceCard.sourceDocumentId],
        sourceTrustTier: asString(sourceDatacard.trustTier) || "trusted",
        entityKind: asString(sourceDatacard.entityKind) || "provider",
        adapterVersion: "visitor-public-draft-adapter@v1",
        publicDraftPayload: sourcePayload,
        extractedFacts: sourceFacts,
        autoPublishEligible: true,
      }),
    },
  });

  const version = await prisma.destinationFactSnapshot.count({
    where: { candidateId: candidate.id },
  }) + 1;
  const factSnapshot = await prisma.destinationFactSnapshot.create({
    data: {
      companyId,
      destinationInstanceId: instanceId,
      candidateId: candidate.id,
      version,
      factsJson: json({
        ...sourceFacts,
        sourceUrl,
      }),
      provenanceJson: json({
        source: "publish-compare-source-backed-content",
        sourceDocumentId: sourceDoc.id,
        canonicalSourceUrl: sourceUrl,
      }),
      extractorVersion: "check-local-source-backed-extractor@v1",
    },
  });

  const draft = await prisma.destinationDraft.create({
    data: {
      companyId,
      destinationInstanceId: instanceId,
      candidateId: candidate.id,
      version,
      destinationKey: "compare",
      adapterVersion: "visitor-public-draft-adapter@v1",
      draftJson: json(sourcePayload),
      provenanceJson: json({
        source: "publish-compare-source-backed-content",
        factSnapshotId: factSnapshot.id,
        sourceDocumentId: sourceDoc.id,
      }),
      basedOnFactSnapshotId: factSnapshot.id,
      reviewState: "APPROVED",
    },
  });

  await prisma.destinationCandidate.update({
    where: { id: candidate.id },
    data: {
      latestFactSnapshotId: factSnapshot.id,
      latestDraftId: draft.id,
    },
  });

  const packetFingerprint = hash(`review|${fingerprint}|${draft.id}`);
  const reviewPacket = await prisma.destinationReviewPacket.create({
    data: {
      companyId,
      destinationInstanceId: instanceId,
      workflowRunId: workflowRun.id,
      candidateId: candidate.id,
      draftId: draft.id,
      bridgeVersion: "visitor-auto-review@v1",
      packetFingerprint,
      packetState: "APPROVED",
      evidenceSummary: json({
        sourceUrl,
        sourceDocumentId: sourceDoc.id,
        sourceTitle: asString(sourceDatacard.sourceTitle) || asString(sourcePayload.name),
        evidence: asString(sourceFacts.evidence),
      }),
      diagnostics: json({
        imagePolicy: "Only media extracted from official source pages is published.",
        pricePolicy: "Price is shown only when extracted from source; otherwise omitted from the payload.",
      }),
      mediaSummary: json({ status: "source-only" }),
      draftPayload: json(sourcePayload),
      metadata: json({
        visitorKey,
        entityKind: asString(sourceDatacard.entityKind) || "provider",
        autoPublishEligible: true,
      }),
      submittedAt: new Date(),
    },
  });

  const publish = await compareFetch("/api/content-intelligence/publish-reviewed", {
    draftId: draft.id,
    entityKind: asString(sourceDatacard.entityKind) || "provider",
    draftPayload: sourcePayload,
    adapterVersion: "visitor-public-draft-adapter@v1",
    workflowMetadata: {
      companyId,
      checklistCompanyId: companyId,
      destinationKey: "compare",
      workflowRunId: workflowRun.id,
      candidateId: candidate.id,
      reviewPacketId: reviewPacket.id,
      bridgeVersion: "visitor-auto-review@v1",
    },
    idempotencyKey: `review-packet:${reviewPacket.id}`,
  });

  const published = publish.status === "published" || publish.status === "partial";
  await prisma.destinationCandidate.update({
    where: { id: candidate.id },
    data: {
      status: published ? "PUBLISHED" : "FAILED",
      metadata: json({
        visitorKey,
        sourceDatacardId: datacardId,
        visitorCandidateState: published ? "PUBLISHED" : "REWORK_REQUIRED",
        sourceDatacardIds: [sourceCard.sourceDocumentId],
        sourceTrustTier: asString(sourceDatacard.trustTier) || "trusted",
        entityKind: asString(sourceDatacard.entityKind) || "provider",
        adapterVersion: "visitor-public-draft-adapter@v1",
        publicDraftPayload: sourcePayload,
        extractedFacts: sourceFacts,
        autoPublishEligible: true,
        publish,
      }),
    },
  });

  await prisma.destinationWorkflowRun.update({
    where: { id: workflowRun.id },
    data: {
      state: published ? "PUBLISHED" : "FAILED",
      currentStage: published ? "PUBLIC_VISIBLE" : "PUBLISH_FAILED",
      metadata: json({
        source: "publish-compare-source-backed-content",
        visitorKey,
        sourceUrl,
        sourceDocumentId: sourceDoc.id,
        publish,
      }),
    },
  });

  const outcome = await prisma.destinationOutcomeMemory.create({
    data: {
      companyId,
      destinationInstanceId: instanceId,
      workflowRunId: workflowRun.id,
      candidateId: candidate.id,
      draftId: draft.id,
      reviewPacketId: reviewPacket.id,
      bridgeVersion: "visitor-auto-review@v1",
      eventType: published ? "publish_completed" : "publish_failed",
      reasonCode: published ? "source_backed_compare_publish" : "source_backed_compare_publish_failed",
      notes: published ? "Verified Compare listing published by CHECK Local." : "Verified Compare listing failed publish.",
      actorType: "SYSTEM",
      actorId: "CHECK Local verified Compare publisher",
      payload: json({
        publish,
        sourceUrl,
        sourceDocumentId: sourceDoc.id,
        candidateId: candidate.id,
        draftId: draft.id,
        reviewPacketId: reviewPacket.id,
      }),
    },
  });

  return {
    sourceDocumentId: sourceCard.sourceDocumentId,
    sourceUrl,
    candidateId: candidate.id,
    draftId: draft.id,
    reviewPacketId: reviewPacket.id,
    outcomeId: outcome.id,
    workflowRunId: workflowRun.id,
    published,
    publish,
    name,
    version,
  };
}

const args = parseArgs(process.argv.slice(2));

try {
  const company = await ensureCompany(args.companyId);
  const instance = await ensureDestinationInstance(company.id);

  if (args.cleanCatalog) {
    await cleanCompareCatalog();
  }

  const sourceCards = await listSourceCards(instance.id, args.visitorKey, args.limit);
  const sanitized = [];
  const published = [];
  const skipped = [];
  let repairedPayloads = { repairedCandidateCount: 0, repairedDraftCount: 0 };

  if (sourceCards.length === 0) {
    throw new Error(`No active source cards found for compare visitor ${args.visitorKey}.`);
  }

  for (const sourceCard of sourceCards) {
    const sourceDatacard = asRecord(sourceCard.sourceDatacard) ?? {};
    if (!shouldPublishFromCard(sourceDatacard)) {
      skipped.push({ sourceUrl: sourceCard.sourceUrl, reason: "autoPublishEligible false or missing required fields" });
      continue;
    }

    const sanitizeResult = await sanitizeSourceDocument({ ...sourceCard, sourceDatacard: sourceDatacard });
    const result = await publishListing(company.id, instance, {
      sourceCard,
      sourceUrl: sourceCard.sourceUrl,
      sourceDatacard,
      sourceFacts: sourceCard.sourceFacts,
      sanitizedPayload: sanitizeResult.payload,
    });
    sanitized.push({ sourceUrl: sourceCard.sourceUrl, changed: sanitizeResult.changed, ...result });
    published.push(result);
  }

  if (args.cleanCatalog) {
    repairedPayloads = await repairPersistedPayloads(instance.id);
  }

  const output = {
    ok: true,
    companyId: company.id,
    visitorKey: normalizeVisitorKey(args.visitorKey),
    destinationInstanceId: instance.id,
    cleanCatalogRequested: args.cleanCatalog,
    sourceCardsExamined: sourceCards.length,
    publishedCount: published.length,
    skippedCount: skipped.length,
    skipped,
    repairedPayloads,
    published,
  };

  mkdirSync(args.outDir, { recursive: true });
  const outputPath = join(args.outDir, `compare-source-backed-publish-${Date.now()}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
  console.log(
    JSON.stringify({
      ok: true,
      outputPath,
      companyId: company.id,
      destinationInstanceId: instance.id,
      sourceCardsExamined: sourceCards.length,
      publishedCount: published.length,
      skippedCount: skipped.length,
      sanitizedCount: sanitized.length,
      repairedCandidatePayloads: repairedPayloads.repairedCandidateCount,
      repairedDraftPayloads: repairedPayloads.repairedDraftCount,
      targetCompareApp: process.env.COMPARE_BASE_URL || null,
    },
    null,
    2,
    ),
  );
} catch (error) {
  console.error(`Compare source-backed publish failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
