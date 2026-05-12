/**
 * TRINITY EVIDENCE LAYER
 * M1.1 — Canonical Evidence Model
 * v1.0.0
 *
 * Implements the EvidenceUnit contract from the Trinity formal production definition §7.
 *
 * Responsibilities:
 *   - canonicalize raw evidence content deterministically
 *   - compute a stable contentHash for exact-hash deduplication
 *   - enforce tenant-binding (companyId required)
 *   - attach topicHints, freshnessWindowDays, provenance, sourceType
 *   - reject exact duplicate evidence at ingress (same hash + companyId)
 *
 * The evidence layer is the entry boundary for all generation.
 * If it is sloppy, every downstream stage inherits that sloppiness.
 */

const crypto = require("crypto");
const CANONICALIZER_VERSION = "v2.0.0";
const { deriveDataCardScoreProfile } = require("../../src/lib/upstream-card-scoring");
const { ensureCitationSnapshotForSource } = require("./citations");

// ---------------------------------------------------------------------------
// 1. Canonicalization
// ---------------------------------------------------------------------------

/**
 * Produces a stable, normalized text representation of raw evidence content.
 * Deterministic: same input always produces the same canonical string.
 *
 * @param {string} raw - Raw evidence content
 * @returns {string} Canonical content
 */
function canonicalizeContent(raw) {
  if (!raw || typeof raw !== "string") return "";

  return raw
    .replace(/<[^>]+>/g, " ")           // Strip HTML tags
    .replace(/&[a-zA-Z]+;/g, " ")       // Strip HTML entities
    .replace(/https?:\/\/\S+/g, " ")    // Strip URLs (preserve signal, not noise)
    .replace(/\s+/g, " ")               // Collapse whitespace
    .toLowerCase()                       // Lowercase for hash stability
    .trim();
}

/**
 * Computes a stable SHA-256 content hash from canonical content.
 * Used for exact-hash deduplication at ingress.
 *
 * @param {string} canonical - Canonical content string
 * @returns {string} hex SHA-256 hash
 */
function computeContentHash(canonical) {
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// 2. Evidence Ingestion — Exact Hash Deduplication
// ---------------------------------------------------------------------------

/**
 * Ingests a single evidence unit into the database.
 * Rejects exact duplicates silently (same contentHash + companyId).
 * Returns the stored Source record (existing or newly created).
 *
 * @param {PrismaClient} prisma
 * @param {object} opts
 * @param {string} opts.companyId           - Required tenant binding
 * @param {string} opts.content             - Raw evidence content
 * @param {string} [opts.provenance]        - Origin URL or reference
 * @param {string} [opts.sourceType]        - WEB | UPLOAD | BRIDGE | MANUAL
 * @param {string[]} [opts.topicHints]      - Topic label hints for Generator
 * @param {number} [opts.freshnessWindowDays] - Days evidence is considered fresh
 * @param {object} [opts.metadata]          - Arbitrary metadata
 * @param {string} [opts.entityTag]         - Optional entity classification tag
 * @returns {{ source: Source, isDuplicate: boolean }}
 */
async function ingestEvidenceUnit(prisma, opts) {
  const {
    companyId,
    content,
    provenance = null,
    sourceType = "WEB",
    topicHints = [],
    freshnessWindowDays = 30,
    metadata = {},
    entityTag = null,
  } = opts;

  if (!companyId) throw new Error("[EVIDENCE] companyId is required — evidence must be tenant-bound");
  if (!content || content.trim().length === 0) throw new Error("[EVIDENCE] content is required");

  const contentCanonical = canonicalizeContent(content);
  const canonicalContentHash = computeContentHash(contentCanonical);
  const scoreProfile = deriveDataCardScoreProfile({
    content,
    entityTag,
    metadata,
    hashtags: [],
    aiClusters: [],
  });

  // --- Exact-hash deduplication ---
  const existing = await prisma.source.findFirst({
    where: { companyId, canonicalContentHash },
  });

  if (existing) {
    await ensureCitationSnapshotForSource(prisma, existing);
    return { source: existing, isDuplicate: true };
  }

  // --- Create new EvidenceUnit ---
  const source = await prisma.source.create({
    data: {
      companyId,
      content,
      confidence: scoreProfile.confidence,
      confidenceScore: scoreProfile.confidence,
      impact: scoreProfile.impact,
      weight: scoreProfile.weight,
      iceScore: scoreProfile.iceScore,
      scoreProfile: scoreProfile.scoreProfile ?? null,
      canonicalContent: contentCanonical,
      canonicalContentHash,
      canonicalizerVersion: CANONICALIZER_VERSION,
      provenance,
      sourceType,
      topicHints,
      freshnessWindowDays,
      metadata,
      entityTag,
    },
  });

  await ensureCitationSnapshotForSource(prisma, source);

  return { source, isDuplicate: false };
}

// ---------------------------------------------------------------------------
// 3. Grouped Evidence — for multi-evidence generation cardinalities
// ---------------------------------------------------------------------------

/**
 * Loads active evidence units for a company, optionally filtered by topic hints.
 * Used by the Generator to build evidence batches for multi-cardinality synthesis.
 *
 * Priority ordering per spec §21.1:
 *   1. Freshest (most recently created)
 *   2. Not already fully processed (no generated candidates yet)
 *   3. Matching topic hints if provided
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {string[]} [topicFilter] - Optional topic hint filter
 * @param {number} [limit]
 * @returns {Source[]}
 */
async function selectEvidenceForGeneration(prisma, company, topicFilter = [], limit = 20) {
  const freshnessThreshold = new Date(
    Date.now() - (company.freshnessWindowDays || 30) * 24 * 60 * 60 * 1000
  );

  const suppressedSources = await prisma.flashcardCorrection.findMany({
    where: {
      companyId: company.id,
      correctionType: "SUPPRESS_SOURCE",
    },
    select: { sourceId: true },
  });
  const suppressedIds = suppressedSources.map(s => s.sourceId).filter(Boolean);

  const where = {
    companyId: company.id,
    createdAt: { gte: freshnessThreshold },
  };

  if (suppressedIds.length > 0) {
    where.id = { notIn: suppressedIds };
  }

  // If topic hints are provided, prefer evidence that matches
  if (topicFilter.length > 0) {
    where.OR = [
      { topicHints: { hasSome: topicFilter } },
      { entityTag: { in: topicFilter } },
    ];
  }

  return await prisma.source.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
}

/**
 * Builds evidence batches grouped by topic hints for multi-cardinality generation.
 * Supports many→1 and many→many synthesis cardinalities.
 *
 * @param {Source[]} evidenceUnits
 * @param {number} [maxBatchSize]
 * @returns {Source[][]} Array of evidence batches
 */
function buildEvidenceBatches(evidenceUnits, maxBatchSize = 5) {
  if (!evidenceUnits || evidenceUnits.length === 0) return [];

  // Group by shared topic hints
  const topicGroups = {};
  const ungrouped = [];

  for (const unit of evidenceUnits) {
    if (unit.topicHints && unit.topicHints.length > 0) {
      const primaryTopic = unit.topicHints[0];
      if (!topicGroups[primaryTopic]) topicGroups[primaryTopic] = [];
      topicGroups[primaryTopic].push(unit);
    } else {
      ungrouped.push(unit);
    }
  }

  const batches = [];

  // Chunk topic groups into batches
  for (const group of Object.values(topicGroups)) {
    for (let i = 0; i < group.length; i += maxBatchSize) {
      batches.push(group.slice(i, i + maxBatchSize));
    }
  }

  // Ungrouped evidence as individual 1→1 batches
  for (const unit of ungrouped) {
    batches.push([unit]);
  }

  return batches;
}

// ---------------------------------------------------------------------------
// 4. Evidence Freshness
// ---------------------------------------------------------------------------

/**
 * Returns true if the evidence unit is still within its freshness window.
 *
 * @param {Source} source
 * @returns {boolean}
 */
function isEvidenceFresh(source) {
  const windowDays = source.freshnessWindowDays ?? 30;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return new Date(source.createdAt) >= cutoff;
}

/**
 * Computes an initial freshness score (0–1) for a newly generated candidate.
 * Based on how recently the source evidence was created.
 *
 * @param {Source} source
 * @returns {number} 0.0 to 1.0
 */
function computeInitialFreshnessScore(source) {
  const windowDays = source.freshnessWindowDays ?? 30;
  const ageMs = Date.now() - new Date(source.createdAt).getTime();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return Math.max(0, 1 - ageMs / windowMs);
}

// ---------------------------------------------------------------------------
// 5. Exports
// ---------------------------------------------------------------------------

module.exports = {
  canonicalizeContent,
  computeContentHash,
  ingestEvidenceUnit,
  selectEvidenceForGeneration,
  buildEvidenceBatches,
  isEvidenceFresh,
  computeInitialFreshnessScore,
  CANONICALIZER_VERSION,
};
