const crypto = require("crypto");
const { normalizeTaskScores } = require("./scoring-contract");

const SALES_DEPARTMENT_KEY = "SALES";
const OPPORTUNITY_TYPE_OPTIONS = Object.freeze(["PROSPECT", "PARTNER", "RESELLER"]);
const ACTIVE_OPPORTUNITY_STATES = Object.freeze(["ACTIVE", "STALE", "EXPIRED"]);
const ACTIVE_OPPORTUNITY_STATUSES = Object.freeze(["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "DECLINED", "REVIEW"]);
const OPPORTUNITY_PUBLIC_ID_SCOPE = "opportunity";
const TRANSACTION_SETTINGS = Object.freeze({
  maxWait: 10_000,
  timeout: 120_000,
});

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function opportunityTypeHashtag(opportunityType) {
  return String(opportunityType || "PROSPECT").toLowerCase();
}

function deriveOpportunityLane(iceScore) {
  const score = Number(iceScore || 0);
  if (score >= 90) return "CHECKLIST";
  if (score >= 75) return "TODO";
  if (score >= 60) return "BACKLOG";
  if (score >= 45) return "ROADMAP";
  return "IDEABANK";
}

function buildOpportunityFingerprint(input = {}) {
  const website = String(input.website || "").trim().toLowerCase();
  const companyName = String(input.companyName || "").trim().toLowerCase();
  const opportunityType = String(input.opportunityType || "PROSPECT").trim().toUpperCase();
  return crypto.createHash("sha1").update(`${website}|${companyName}|${opportunityType}`).digest("hex");
}

function normalizeOpportunityPayload(input = {}) {
  const title = normalizeText(input.title) || normalizeText(input.companyName) || "Opportunitycard";
  const companyName = normalizeText(input.companyName) || title;
  const body = normalizeText(input.body) || normalizeText(input.fitRationale) || "Sales opportunity candidate.";
  const opportunityType = OPPORTUNITY_TYPE_OPTIONS.includes(String(input.opportunityType || "").toUpperCase())
    ? String(input.opportunityType).toUpperCase()
    : "PROSPECT";

  const normalizedScores = normalizeTaskScores({
    confidence: Number(input.confidenceScore ?? input.confidence ?? 5),
    impact: Number(input.impact ?? 5),
    ease: Number(input.weight ?? input.ease ?? 5),
  });

  const baseHashtags = Array.isArray(input.hashtags)
    ? input.hashtags
        .map((tag) => String(tag || "").trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    : [];

  return {
    companyName,
    title,
    body,
    website: normalizeText(input.website),
    linkedinUrl: normalizeText(input.linkedinUrl),
    instagramUrl: normalizeText(input.instagramUrl),
    facebookUrl: normalizeText(input.facebookUrl),
    xUrl: normalizeText(input.xUrl),
    location: normalizeText(input.location),
    coreOffer: normalizeText(input.coreOffer),
    financialBackground: normalizeText(input.financialBackground),
    fitRationale: normalizeText(input.fitRationale),
    salesGeographies: Array.isArray(input.salesGeographies)
      ? input.salesGeographies.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    contactInfo: input.contactInfo && typeof input.contactInfo === "object" && !Array.isArray(input.contactInfo)
      ? input.contactInfo
      : null,
    opportunityType,
    confidence: normalizedScores.confidence,
    confidenceScore: normalizedScores.confidenceScore,
    impact: normalizedScores.impact,
    weight: normalizedScores.ease,
    iceScore: normalizedScores.iceScore,
    scoreProfile: normalizedScores.scoreProfile || null,
    hashtags: Array.from(new Set([opportunityTypeHashtag(opportunityType), ...baseHashtags])),
  };
}

function domainFromUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).startsWith("http") ? String(value) : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function titleCaseHost(host) {
  if (!host) return null;
  return host
    .split(".")[0]
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s)]+/g) || [];
  return Array.from(new Set(matches));
}

function inferOpportunityType(text) {
  const normalized = String(text || "").toLowerCase();
  if (/\breseller|distributor|affiliate\b/.test(normalized)) return "RESELLER";
  if (/\bpartner|integration partner|channel partner|alliance\b/.test(normalized)) return "PARTNER";
  return "PROSPECT";
}

function buildOpportunitySeedFromRecord(record, company) {
  const urls = [
    ...extractUrls(record?.body),
    ...extractUrls(record?.provenance),
    ...(record?.website ? [record.website] : []),
  ];
  const website = urls[0] || record?.website || null;
  const host = domainFromUrl(website);
  const ownDomain = domainFromUrl(company?.website);
  if (host && ownDomain && host === ownDomain) {
    return null;
  }

  const sourceText = [record?.title, record?.body, record?.sourceName, record?.provenance].filter(Boolean).join("\n");
  const companyName = record?.sourceName || record?.title || titleCaseHost(host) || null;
  if (!companyName || normalizeText(companyName)?.toLowerCase() === normalizeText(company?.name)?.toLowerCase()) {
    return null;
  }

  const opportunityType = inferOpportunityType(sourceText);
  const fitSignals = [
    company?.industry ? `Relevant to ${company.industry}` : null,
    company?.targetMarket ? `Possible fit for ${company.targetMarket}` : null,
    opportunityType === "PARTNER" ? "Potential partner relationship" : null,
    opportunityType === "RESELLER" ? "Potential reseller channel" : null,
  ].filter(Boolean);
  const fitRationale = fitSignals.length > 0
    ? fitSignals.join(" · ")
    : "Possible company lead based on current research signals.";
  const impact = company?.targetMarket && sourceText.toLowerCase().includes(String(company.targetMarket).toLowerCase()) ? 8 : 6;
  const confidence = website ? 7 : 5;
  const weight = urls.length > 1 ? 7 : 5;

  return normalizeOpportunityPayload({
    title: companyName,
    body: sourceText.slice(0, 1400) || fitRationale,
    companyName,
    website,
    location: record?.location || null,
    coreOffer: sourceText.slice(0, 280),
    fitRationale,
    opportunityType,
    hashtags: record?.hashtags || [],
    impact,
    confidence,
    confidenceScore: confidence,
    weight,
  });
}

async function reservePublicIds(tx, scope, count) {
  if (count <= 0) return [];

  await tx.publicIdCounter.upsert({
    where: { scope },
    update: {},
    create: {
      scope,
      value: 0,
      updatedAt: new Date(),
    },
  });

  const counter = await tx.publicIdCounter.update({
    where: { scope },
    data: {
      value: {
        increment: count,
      },
    },
  });

  const firstPublicId = counter.value - count + 1;
  return Array.from({ length: count }, (_, index) => firstPublicId + index);
}

async function nextOpportunityPublicId(tx) {
  const [publicId] = await reservePublicIds(tx, OPPORTUNITY_PUBLIC_ID_SCOPE, 1);
  return publicId;
}

async function mineOpportunitycards(prisma, companyId) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      industry: true,
      targetMarket: true,
      website: true,
    },
  });

  if (!company) {
    return { created: 0, updated: 0, discovered: 0 };
  }

  const [sources, flashcards] = await Promise.all([
    prisma.source.findMany({
      where: {
        companyId,
        OR: [
          { departmentKey: SALES_DEPARTMENT_KEY },
          { intelligenceType: "COMPETITOR" },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        content: true,
        provenance: true,
        hashtags: true,
        entityTag: true,
        departmentKey: true,
        updatedAt: true,
      },
    }),
    prisma.flashcard.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        OR: [
          { departmentKey: SALES_DEPARTMENT_KEY },
          { intelligenceType: "COMPETITOR" },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        sources: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
    }),
  ]);

  const seeds = [
    ...sources.map((source) =>
      buildOpportunitySeedFromRecord(
        {
          title: source.entityTag,
          body: source.content,
          provenance: source.provenance,
          sourceName: source.provenance,
          hashtags: source.hashtags,
        },
        company,
      ),
    ),
    ...flashcards.map((flashcard) =>
      buildOpportunitySeedFromRecord(
        {
          title: flashcard.title,
          body: flashcard.body,
          provenance: flashcard.sources[0]?.sourceName || null,
          sourceName: flashcard.title,
          website: null,
          hashtags: flashcard.hashtags,
        },
        company,
      ),
    ),
  ].filter(Boolean);

  const uniqueSeeds = Array.from(
    new Map(
      seeds.map((seed) => {
        const fingerprint = buildOpportunityFingerprint({
          website: seed.website,
          companyName: seed.companyName,
          opportunityType: seed.opportunityType,
        });
        return [fingerprint, { ...seed, fingerprint }];
      }),
    ).values(),
  );

  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const seed of uniqueSeeds) {
      const existing = await tx.opportunitycard.findFirst({
        where: {
          companyId,
          fingerprint: seed.fingerprint,
        },
      });

      if (existing) {
        await tx.opportunitycard.update({
          where: { id: existing.id },
          data: {
            companyName: seed.companyName,
            title: seed.title,
            body: seed.body,
            website: existing.website || seed.website,
            location: existing.location || seed.location,
            coreOffer: existing.coreOffer || seed.coreOffer,
            financialBackground: existing.financialBackground || seed.financialBackground,
            fitRationale: existing.fitRationale || seed.fitRationale,
            opportunityType: seed.opportunityType,
            confidence: seed.confidence,
            confidenceScore: seed.confidenceScore,
            impact: seed.impact,
            weight: seed.weight,
            iceScore: seed.iceScore,
            scoreProfile: seed.scoreProfile,
            hashtags: Array.from(new Set([...(existing.hashtags || []), ...(seed.hashtags || [])])),
            departmentKey: SALES_DEPARTMENT_KEY,
            refreshedAt: new Date(),
            processingStatus: existing.processingStatus === "DECLINED" ? existing.processingStatus : "CHECKED",
            kanbanColumn: existing.manualLaneOverrideAt ? existing.kanbanColumn : deriveOpportunityLane(seed.iceScore),
          },
        });
        updated += 1;
        continue;
      }

      const publicId = await nextOpportunityPublicId(tx);
      await tx.opportunitycard.create({
        data: {
          publicId,
          companyId,
          companyName: seed.companyName,
          title: seed.title,
          body: seed.body,
          website: seed.website,
          linkedinUrl: seed.linkedinUrl,
          instagramUrl: seed.instagramUrl,
          facebookUrl: seed.facebookUrl,
          xUrl: seed.xUrl,
          location: seed.location,
          coreOffer: seed.coreOffer,
          financialBackground: seed.financialBackground,
          fitRationale: seed.fitRationale,
          opportunityType: seed.opportunityType,
          departmentKey: SALES_DEPARTMENT_KEY,
          confidence: seed.confidence,
          confidenceScore: seed.confidenceScore,
          impact: seed.impact,
          weight: seed.weight,
          iceScore: seed.iceScore,
          hashtags: seed.hashtags,
          salesGeographies: seed.salesGeographies,
          contactInfo: seed.contactInfo,
          scoreProfile: seed.scoreProfile,
          evidence: {
            minedAt: new Date().toISOString(),
            strategy: "heuristic-opportunity-miner",
          },
          fingerprint: seed.fingerprint,
          kanbanColumn: deriveOpportunityLane(seed.iceScore),
          processingStatus: "CHECKED",
          generatedAt: new Date(),
          refreshedAt: new Date(),
        },
      });
      created += 1;
    }
  }, TRANSACTION_SETTINGS);

  return { created, updated, discovered: uniqueSeeds.length };
}

function resolveOpportunityMaintenanceTake(executionOptions = {}) {
  const override = executionOptions?.countOverrides?.opportunitycards;
  if (Number.isFinite(override)) {
    return Math.max(1, Math.min(3, Number(override)));
  }
  return 2;
}

async function refreshOldestOpportunitycards(prisma, company = null, refreshedAt = new Date(), executionOptions = {}) {
  const take = resolveOpportunityMaintenanceTake(executionOptions);
  const skip = Number.isFinite(executionOptions?.selectionOffset)
    ? Math.max(0, Number(executionOptions.selectionOffset))
    : 0;

  const items = await prisma.opportunitycard.findMany({
    where: {
      ...(company?.id ? { companyId: company.id } : {}),
      departmentKey: SALES_DEPARTMENT_KEY,
      activityState: { in: ACTIVE_OPPORTUNITY_STATES },
      processingStatus: { in: ACTIVE_OPPORTUNITY_STATUSES },
    },
    orderBy: [
      { updatedAt: "asc" },
      { createdAt: "asc" },
    ],
    skip,
    take,
  });

  for (const item of items) {
    const normalized = normalizeOpportunityPayload({
      companyName: item.companyName,
      title: item.title,
      body: item.body,
      website: item.website,
      linkedinUrl: item.linkedinUrl,
      instagramUrl: item.instagramUrl,
      facebookUrl: item.facebookUrl,
      xUrl: item.xUrl,
      location: item.location,
      coreOffer: item.coreOffer,
      financialBackground: item.financialBackground,
      fitRationale: item.fitRationale,
      opportunityType: item.opportunityType,
      hashtags: item.hashtags,
      salesGeographies: item.salesGeographies,
      contactInfo: item.contactInfo,
      impact: item.impact,
      confidence: item.confidenceScore ?? item.confidence,
      confidenceScore: item.confidenceScore ?? item.confidence,
      weight: item.weight,
    });

    await prisma.opportunitycard.update({
      where: { id: item.id },
      data: {
        companyName: normalized.companyName,
        title: normalized.title,
        body: normalized.body,
        website: normalized.website,
        linkedinUrl: normalized.linkedinUrl,
        instagramUrl: normalized.instagramUrl,
        facebookUrl: normalized.facebookUrl,
        xUrl: normalized.xUrl,
        location: normalized.location,
        coreOffer: normalized.coreOffer,
        financialBackground: normalized.financialBackground,
        fitRationale: normalized.fitRationale,
        opportunityType: normalized.opportunityType,
        confidence: normalized.confidence,
        confidenceScore: normalized.confidenceScore,
        impact: normalized.impact,
        weight: normalized.weight,
        iceScore: normalized.iceScore,
        hashtags: normalized.hashtags,
        salesGeographies: normalized.salesGeographies,
        contactInfo: normalized.contactInfo,
        departmentKey: SALES_DEPARTMENT_KEY,
        scoreProfile: normalized.scoreProfile,
        refreshedAt,
        kanbanColumn: item.manualLaneOverrideAt ? item.kanbanColumn : deriveOpportunityLane(normalized.iceScore),
      },
    });
  }

  return items;
}

module.exports = {
  SALES_DEPARTMENT_KEY,
  OPPORTUNITY_TYPE_OPTIONS,
  ACTIVE_OPPORTUNITY_STATES,
  ACTIVE_OPPORTUNITY_STATUSES,
  buildOpportunityFingerprint,
  opportunityTypeHashtag,
  deriveOpportunityLane,
  normalizeOpportunityPayload,
  buildOpportunitySeedFromRecord,
  mineOpportunitycards,
  refreshOldestOpportunitycards,
};
