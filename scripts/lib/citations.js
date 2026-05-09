/**
 * Durable citation snapshots and deterministic conflict detection for Knowmore.
 *
 * Citation snapshots persist source-backed evidence beyond raw URLs. Conflict
 * detection deliberately uses stable, auditable heuristics so contradictions
 * reduce trust instead of silently inflating confidence.
 */

function normalizeCitationUrl(value) {
  if (!value || typeof value !== "string") return null;

  try {
    const parsed = new URL(value.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    return parsed.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}

function buildExcerpt(value, maxLength = 320) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function extractNumericClaims(content) {
  const normalized = String(content || "").toLowerCase();
  const claims = [];
  const regex = /([a-z][a-z0-9\s/-]{0,36})?\b(\d+(?:[.,]\d+)?)\s*(%|percent|x|k|m|b|million|billion|days?|weeks?|months?|years?|usd|eur|\$)?/gi;
  let match;

  while ((match = regex.exec(normalized)) !== null) {
    const rawValue = String(match[2] || "").replace(/,/g, "");
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) continue;

    const context = String(match[1] || "")
      .split(/\s+/g)
      .map((token) => token.replace(/[^a-z0-9/-]/g, ""))
      .filter((token) => token.length >= 3)
      .slice(-4);

    if (context.length === 0) continue;

    claims.push({
      context,
      value: numericValue,
      unit: (match[3] || "").toLowerCase(),
    });
  }

  return claims;
}

const POSITIVE_MARKERS = ["increase", "growth", "up", "gain", "improved", "strong", "profit", "expansion", "accelerate"];
const NEGATIVE_MARKERS = ["decrease", "decline", "down", "loss", "weak", "risk", "drop", "shrink", "slow"];

function detectPolarity(content) {
  const normalized = String(content || "").toLowerCase();
  let positive = 0;
  let negative = 0;

  for (const marker of POSITIVE_MARKERS) {
    if (normalized.includes(marker)) positive += 1;
  }
  for (const marker of NEGATIVE_MARKERS) {
    if (normalized.includes(marker)) negative += 1;
  }

  if (positive > negative) return "positive";
  if (negative > positive) return "negative";
  return "neutral";
}

function overlapCount(left, right) {
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function detectEvidenceConflict(evidenceBatch = []) {
  if (!Array.isArray(evidenceBatch) || evidenceBatch.length < 2) {
    return { detected: false, severity: 0, summary: null, reasons: [] };
  }

  const analyzed = evidenceBatch.map((source) => ({
    id: source.id,
    sourceName: source.entityTag || source.sourceName || source.provenance || source.id,
    content: String(source.canonicalContent || source.content || ""),
    claims: extractNumericClaims(source.canonicalContent || source.content || ""),
    polarity: detectPolarity(source.canonicalContent || source.content || ""),
  }));

  const reasons = [];

  for (let i = 0; i < analyzed.length; i += 1) {
    for (let j = i + 1; j < analyzed.length; j += 1) {
      const left = analyzed[i];
      const right = analyzed[j];

      for (const leftClaim of left.claims) {
        for (const rightClaim of right.claims) {
          if (leftClaim.unit !== rightClaim.unit) continue;
          if (overlapCount(leftClaim.context, rightClaim.context) < 2) continue;

          const baseline = Math.max(Math.abs(leftClaim.value), Math.abs(rightClaim.value), 1);
          const divergence = Math.abs(leftClaim.value - rightClaim.value) / baseline;
          if (divergence >= 0.2) {
            reasons.push(
              `Numeric conflict on ${leftClaim.context.join(" ")} between ${left.sourceName} (${leftClaim.value}${leftClaim.unit}) and ${right.sourceName} (${rightClaim.value}${rightClaim.unit})`,
            );
          }
        }
      }

      const sharedTokens = overlapCount(
        String(left.content).split(/\W+/g).filter((token) => token.length >= 4),
        String(right.content).split(/\W+/g).filter((token) => token.length >= 4),
      );

      if (sharedTokens >= 6 && left.polarity !== "neutral" && right.polarity !== "neutral" && left.polarity !== right.polarity) {
        reasons.push(`Directional conflict between ${left.sourceName} and ${right.sourceName}`);
      }
    }
  }

  if (reasons.length === 0) {
    return { detected: false, severity: 0, summary: null, reasons: [] };
  }

  const severity = Math.min(3, reasons.length);
  return {
    detected: true,
    severity,
    reasons,
    summary: reasons.slice(0, 2).join("; "),
  };
}

async function ensureCitationSnapshotForSource(prisma, source) {
  if (!source?.companyId || !source?.id) return null;

  const normalizedUrl = normalizeCitationUrl(source.provenance || source.metadata?.url || source.metadata?.sourceUrl || null);
  const excerpt = buildExcerpt(source.content || source.canonicalContent || "");
  if (!excerpt) return null;

  const existing = await prisma.citationSnapshot.findFirst({
    where: {
      companyId: source.companyId,
      sourceId: source.id,
      contentHash: source.canonicalContentHash || "",
    },
  });

  const data = {
    companyId: source.companyId,
    sourceId: source.id,
    sourcePublicId: source.publicId ?? null,
    sourceType: source.sourceType || "WEB",
    sourceName: source.entityTag || source.legacyOriginKey || source.id,
    normalizedUrl,
    excerpt,
    contentHash: source.canonicalContentHash || "",
    fetchedAt: new Date(source.updatedAt || source.createdAt || Date.now()),
    metadata: source.metadata || {},
  };

  if (existing) {
    return prisma.citationSnapshot.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.citationSnapshot.create({ data });
}

async function ensureCitationSnapshotsForEvidenceBatch(prisma, evidenceBatch = []) {
  const snapshots = [];

  for (const source of evidenceBatch) {
    const snapshot = await ensureCitationSnapshotForSource(prisma, source);
    if (snapshot) snapshots.push(snapshot);
  }

  return snapshots;
}

module.exports = {
  buildExcerpt,
  detectEvidenceConflict,
  ensureCitationSnapshotForSource,
  ensureCitationSnapshotsForEvidenceBatch,
  normalizeCitationUrl,
};
