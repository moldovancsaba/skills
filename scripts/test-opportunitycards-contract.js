const assert = require("node:assert/strict");

const {
  normalizeOpportunityPayload,
  deriveOpportunityLane,
  normalizeOpportunityType,
} = require("../src/lib/opportunitycard-contract");
const {
  buildOpportunitySeedFromRecord,
  rebalanceOpportunitycardBoard,
  refreshOldestOpportunitycards,
} = require("../src/lib/opportunitycards-runtime");

async function main() {
  const normalized = normalizeOpportunityPayload({
    companyName: "Acme Revenue",
    title: "Acme Revenue",
    body: "Revenue operations software company for enterprise teams.",
    website: "https://acme.example.com",
    opportunityType: "partner",
    hashtags: ["RevOps", "#Europe"],
    salesGeographies: ["Europe", "Europe", "DACH"],
    contactInfo: { email: "hello@acme.example.com", phone: "+36 1 555 5555" },
    impact: 8,
    confidence: 50,
    confidenceScore: 50,
    weight: 6,
  });

  assert.equal(normalized.opportunityType, "PARTNER", "opportunity type should be canonicalized");
  assert.equal(normalized.confidence, 5, "50-scale confidence must be normalized to canonical 1-10 scoring");
  assert.equal(normalized.confidenceScore, 5, "50-scale confidence score must be normalized to canonical 1-10 scoring");
  assert.equal(normalized.impact, 8, "impact should be preserved when already canonical");
  assert.equal(normalized.weight, 6, "weight should remain task-like effort");
  assert.equal(normalized.iceScore, 240, "opportunitycards should use canonical task-style ICE scoring");
  assert.equal(Array.isArray(normalized.salesGeographies), true, "sales geographies should remain an array");
  assert.deepEqual(normalized.salesGeographies, ["Europe", "DACH"], "sales geographies should dedupe while preserving values");
  assert.equal(typeof normalized.scoreProfile, "object", "score profile must be persisted");
  assert.equal(normalized.scoreProfile.scoreKind, "TASK", "opportunitycards should persist the task-like score family");
  assert.equal(deriveOpportunityLane(normalized.iceScore), "CHECKLIST", "lane placement should derive from canonical normalized ICE");
  assert.equal(normalizeOpportunityType("reseller"), "RESELLER", "type normalization should preserve supported variants");

  const scrapedPageNormalized = normalizeOpportunityPayload({
    companyName: "Accueil",
    title: "Accueil",
    body: "myCANAL - Accueil | myCANAL Une nouvelle façon de regarder la télé. Page Evidence: Status: 403 Source: https://www.mycanal.fr/",
    coreOffer: "Accueil Regarder les meilleurs programmes, films, séries, sports en streaming direct ou en replay.",
    fitRationale: "Possible fit for enterprise teams.",
    website: "https://www.canalplus.com/",
  });
  assert.equal(
    scrapedPageNormalized.body,
    "Possible fit for enterprise teams.",
    "access-denied page evidence must not become the professional description",
  );
  assert.equal(scrapedPageNormalized.coreOffer, null, "derived page copy must not persist as core offer when the source body is failed scrape evidence");

  const validFrenchNormalized = normalizeOpportunityPayload({
    companyName: "Studio Lumiere",
    title: "Studio Lumiere",
    body: "Studio francais de production video pour les marques et les equipes marketing.",
    coreOffer: "Production video, montage et direction creative.",
    fitRationale: "Possible fit for marketing teams.",
    website: "https://studio-lumiere.example.com/",
  });
  assert.equal(
    validFrenchNormalized.body,
    "Studio francais de production video pour les marques et les equipes marketing.",
    "French opportunity descriptions must remain valid when the source is clean",
  );
  assert.equal(
    validFrenchNormalized.coreOffer,
    "Production video, montage et direction creative.",
    "French core offers must remain valid when the source is clean",
  );

  const company = {
    name: "Checklist OS",
    industry: "B2B SaaS",
    targetMarket: "RevOps teams",
    website: "https://checklist.example.com",
  };

  const validSeed = buildOpportunitySeedFromRecord(
    {
      title: "Acme Revenue Platform",
      body: "Acme Revenue Platform helps RevOps teams manage enterprise forecasting.",
      provenance: "https://acmerevenue.example.com/platform",
      metadata: {
        query: "revops platform companies europe",
        searchDomain: "acmerevenue.example.com",
        url: "https://acmerevenue.example.com/platform",
      },
    },
    company,
  );
  assert.equal(Boolean(validSeed?.website), true, "company-like sources with a distinct domain should still produce a seed");
  assert.equal(validSeed?.companyName, "Acme Revenue Platform", "seed company name should preserve a valid company-like title");
  assert.equal(validSeed?.evidence?.query, "revops platform companies europe", "seed evidence should preserve originating search query");
  assert.equal(validSeed?.evidence?.searchDomain, "acmerevenue.example.com", "seed evidence should preserve originating search domain");

  const genericSeed = buildOpportunitySeedFromRecord(
    {
      title: "Top 25 RevOps Tools for 2026",
      body: "Comparison guide covering the market landscape for RevOps software.",
      provenance: "https://market.example.com/revops-tools",
    },
    company,
  );
  assert.equal(genericSeed, null, "generic article titles must not be promoted into opportunitycards");

  const noWebsiteSeed = buildOpportunitySeedFromRecord(
    {
      title: "Enterprise workflow tips",
      body: "Advice for enterprise operations leaders.",
      provenance: null,
    },
    company,
  );
  assert.equal(noWebsiteSeed, null, "records without company identity evidence must not create opportunitycards");

  const briefingSeed = buildOpportunitySeedFromRecord(
    {
      title: "Sales lead generation brief",
      body: "Internal sales lead generation brief for a company.",
      provenance: null,
    },
    company,
  );
  assert.equal(briefingSeed, null, "internal briefing titles must not create opportunitycards");

  const instagramSeed = buildOpportunitySeedFromRecord(
    {
      title: "Instagram",
      body: "https://www.instagram.com/tsoccer_training_academy Instagram",
      provenance: "https://www.instagram.com/tsoccer_training_academy",
      website: "https://www.instagram.com/tsoccer_training_academy",
      hashtags: ["prospect", "usa", "training"],
    },
    company,
  );
  assert.equal(Boolean(instagramSeed?.website), true, "social profile records should remain usable evidence when the profile URL is present");
  assert.equal(instagramSeed?.companyName, "Tsoccer Training Academy", "social platform brand names must not replace the actual company/profile identity");
  assert.equal(instagramSeed?.title, "Tsoccer Training Academy", "social profile slug should drive the displayed company title");

  const singleWordCompanySeed = buildOpportunitySeedFromRecord(
    {
      title: "CNN",
      body: "CNN operates a global media and news business with a recognizable single-word brand.",
      provenance: "https://www.cnn.com/",
      website: "https://www.cnn.com/",
    },
    company,
  );
  assert.equal(singleWordCompanySeed?.companyName, "CNN", "single-word company names must remain valid lead titles");

  const cleanFrenchSingleWordSeed = buildOpportunitySeedFromRecord(
    {
      title: "Accueil",
      body: "Accueil fournit une plateforme B2B pour aider les equipes commerciales a gerer les demandes entrantes.",
      provenance: "https://accueil.example.com/",
      website: "https://accueil.example.com/",
    },
    company,
  );
  assert.equal(cleanFrenchSingleWordSeed?.companyName, "Accueil", "French single-word company names must remain valid when the source is clean");

  const genericPageTitleSeed = buildOpportunitySeedFromRecord(
    {
      title: "Accueil",
      body: "Accueil Regarder les meilleurs programmes. Page Evidence: Status: 403 Source: https://www.canalplus.com/",
      provenance: "https://www.canalplus.com/",
      website: "https://www.canalplus.com/",
    },
    company,
  );
  assert.equal(genericPageTitleSeed?.companyName, "Canalplus", "weak single-word page titles from failed scrape evidence should fall back to the company domain");

  const bareInstagramSeed = buildOpportunitySeedFromRecord(
    {
      title: "Instagram",
      body: "Instagram",
      provenance: "https://www.instagram.com",
      website: "https://www.instagram.com",
    },
    company,
  );
  assert.equal(bareInstagramSeed, null, "bare social platform hosts without a profile identity must not create opportunitycards");

  const compactInstagramSeed = buildOpportunitySeedFromRecord(
    {
      title: "Instagram",
      body: "https://www.instagram.com/scprosocceracademy Instagram",
      provenance: "https://www.instagram.com/scprosocceracademy",
      website: "https://www.instagram.com/scprosocceracademy",
      hashtags: ["prospect", "usa", "training"],
    },
    company,
  );
  assert.equal(compactInstagramSeed?.companyName, "Scpro Soccer Academy", "compact social slugs should be segmented into readable company names");

  const updates = [];
  const mockCards = [
    {
      id: "opp-1",
      companyId: "company-1",
      title: "High priority lead",
      companyName: "High priority lead",
      description: null,
      body: "Urgent revenue opportunity with strong fit.",
      iceScore: 240,
      confidenceScore: 8,
      confidence: 8,
      impact: 8,
      weight: 6,
      scoreProfile: normalized.scoreProfile,
      processingStatus: "ACCEPTED",
      activityState: "ACTIVE",
      kanbanColumn: "IDEABANK",
      sortOrder: 0,
      feedbackScore: 1,
      hashtags: ["revops"],
      updatedAt: new Date("2026-05-21T12:00:00Z"),
      createdAt: new Date("2026-05-20T12:00:00Z"),
      manualLaneOverrideAt: null,
      manualLaneCooldownUntil: null,
      manualLaneFloorColumn: null,
    },
    {
      id: "opp-2",
      companyId: "company-1",
      title: "Medium priority lead",
      companyName: "Medium priority lead",
      description: null,
      body: "Steady fit with weaker urgency.",
      iceScore: 120,
      confidenceScore: 6,
      confidence: 6,
      impact: 6,
      weight: 4,
      scoreProfile: normalized.scoreProfile,
      processingStatus: "DRAFT",
      activityState: "ACTIVE",
      kanbanColumn: "IDEABANK",
      sortOrder: 0,
      feedbackScore: 0,
      hashtags: ["pipeline"],
      updatedAt: new Date("2026-05-20T12:00:00Z"),
      createdAt: new Date("2026-05-19T12:00:00Z"),
      manualLaneOverrideAt: null,
      manualLaneCooldownUntil: null,
      manualLaneFloorColumn: null,
    },
    {
      id: "opp-3",
      companyId: "company-1",
      title: "Pinned lead",
      companyName: "Pinned lead",
      description: null,
      body: "Human-pinned priority should stay high.",
      iceScore: 90,
      confidenceScore: 5,
      confidence: 5,
      impact: 5,
      weight: 4,
      scoreProfile: normalized.scoreProfile,
      processingStatus: "CHECKED",
      activityState: "ACTIVE",
      kanbanColumn: "CHECKLIST",
      sortOrder: -3,
      feedbackScore: 0,
      hashtags: ["manual"],
      updatedAt: new Date("2026-05-20T12:00:00Z"),
      createdAt: new Date("2026-05-18T12:00:00Z"),
      manualLaneOverrideAt: new Date("2026-05-21T11:00:00Z"),
      manualLaneCooldownUntil: new Date("2026-05-28T11:00:00Z"),
      manualLaneFloorColumn: "CHECKLIST",
    },
  ];
  const mockPrisma = {
    opportunitycard: {
      findMany: async () => mockCards,
      update: async ({ where, data }) => {
        updates.push({ id: where.id, data });
        return null;
      },
    },
  };
  const rebalanceResult = await rebalanceOpportunitycardBoard(mockPrisma, "company-1");
  assert.equal(rebalanceResult.total, 3, "rebalance should inspect the full active sales cohort");
  assert.equal(updates.some((entry) => entry.id === "opp-1" && entry.data.kanbanColumn === "CHECKLIST"), true, "highest-ranked lead should be promoted into CHECKLIST");
  assert.equal(updates.some((entry) => entry.id === "opp-2"), true, "non-manual leads should receive managed board placement");
  assert.equal(updates.some((entry) => entry.id === "opp-3"), false, "manual lane override items already in-place should not be rewritten");

  const refreshUpdates = [];
  const refreshMockPrisma = {
    opportunitycard: {
      findMany: async () => [
        {
          id: "opp-refresh-1",
          companyId: "company-1",
          companyName: "Scprosocceracademy",
          title: "Scprosocceracademy",
          body: "Email info@scprosocceracademy.com Phone +1 555 222 3333 Address 14 Training Street, Austin, Texas",
          website: null,
          linkedinUrl: null,
          instagramUrl: null,
          facebookUrl: null,
          xUrl: null,
          location: null,
          coreOffer: null,
          financialBackground: null,
          fitRationale: "Relevant to #industry",
          opportunityType: "PROSPECT",
          hashtags: ["prospect"],
          salesGeographies: [],
          contactInfo: {},
          impact: 5,
          confidence: 5,
          confidenceScore: 5,
          weight: 5,
          processingStatus: "DRAFT",
          activityState: "ACTIVE",
          scoreProfile: normalized.scoreProfile,
          evidence: null,
          manualLaneOverrideAt: null,
          updatedAt: new Date("2026-05-20T10:00:00Z"),
          createdAt: new Date("2026-05-19T10:00:00Z"),
        },
      ],
      update: async ({ where, data }) => {
        refreshUpdates.push({ id: where.id, data });
        return null;
      },
    },
  };

  await refreshOldestOpportunitycards(
    refreshMockPrisma,
    { id: "company-1", industry: "Sports training", targetMarket: "Youth soccer families" },
    new Date("2026-05-21T12:00:00Z"),
    { countOverrides: { opportunitycards: 1 } },
  );
  assert.equal(refreshUpdates.length >= 1, true, "oldest-card refresh should update the selected opportunitycard");
  assert.equal(refreshUpdates[0].data.companyName, "Scpro Soccer Academy", "refresh should normalize compact company names during oldest-first revisit");
  assert.equal(refreshUpdates[0].data.contactInfo.email, "info@scprosocceracademy.com", "refresh should extract missing email from existing evidence");
  assert.equal(refreshUpdates[0].data.contactInfo.phone, "+1 555 222 3333", "refresh should extract missing phone from existing evidence");
  assert.equal(refreshUpdates[0].data.contactInfo.address, "Email info@scprosocceracademy.com Phone +1 555 222 3333 Address 14 Training Street, Austin, Texas", "refresh should persist an address candidate when present");
  assert.equal(refreshUpdates[0].data.fitRationale.includes("Sports training"), true, "refresh should refine weak fit rationale using company context");
  assert.deepEqual(refreshUpdates[0].data.evidence.maintenanceFocus.missing.includes("email"), true, "refresh evidence should record the focused missing fields for the visited oldest card");

  console.log("Opportunitycard contract tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
