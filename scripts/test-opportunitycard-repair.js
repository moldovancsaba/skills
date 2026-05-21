const assert = require("node:assert/strict");

const { repairOpportunitycards } = require("./lib/opportunitycard-score-repair");

function makeFakePrisma(seedCards) {
  const cards = seedCards
    .map((card) => ({
      ...card,
      createdAt: new Date(card.createdAt),
      manualLaneOverrideAt: card.manualLaneOverrideAt ? new Date(card.manualLaneOverrideAt) : null,
    }))
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  const updates = [];

  return {
    cards,
    updates,
    opportunitycard: {
      async findMany(args) {
        const take = Number(args?.take || cards.length);
        const gtCreatedAt = args?.where?.OR?.[0]?.createdAt?.gt ?? null;
        const eqCreatedAt = args?.where?.OR?.[1]?.createdAt ?? null;
        const gtId = args?.where?.OR?.[1]?.id?.gt ?? null;
        const companyId = args?.where?.companyId ?? null;

        return cards
          .filter((card) => {
            if (companyId && card.companyId !== companyId) return false;
            if (!gtCreatedAt && !eqCreatedAt) return true;
            const createdAtMs = card.createdAt.getTime();
            if (gtCreatedAt && createdAtMs > new Date(gtCreatedAt).getTime()) return true;
            if (eqCreatedAt && createdAtMs === new Date(eqCreatedAt).getTime() && gtId && card.id > gtId) return true;
            return false;
          })
          .slice(0, take)
          .map((card) => ({ ...card }));
      },
      async update({ where, data }) {
        const index = cards.findIndex((card) => card.id === where.id);
        if (index === -1) throw new Error(`Unknown card ${where.id}`);
        cards[index] = { ...cards[index], ...data };
        updates.push({ id: where.id, data });
        return cards[index];
      },
    },
  };
}

async function main() {
  const prisma = makeFakePrisma([
    {
      id: "opp-1",
      companyId: "company-1",
      createdAt: "2026-05-01T00:00:00.000Z",
      companyName: "Acme",
      title: "Acme",
      body: "Legacy card",
      website: "https://acme.example",
      linkedinUrl: null,
      instagramUrl: null,
      facebookUrl: null,
      xUrl: null,
      location: "Berlin",
      coreOffer: "Consulting",
      financialBackground: null,
      fitRationale: "Strong fit",
      opportunityType: "PROSPECT",
      hashtags: ["legacy"],
      salesGeographies: ["DACH"],
      contactInfo: {},
      confidence: 50,
      confidenceScore: 50,
      impact: 8,
      weight: 3,
      iceScore: 24,
      scoreProfile: null,
      fingerprint: "legacy-fingerprint",
      kanbanColumn: "IDEABANK",
      manualLaneOverrideAt: null,
    },
    {
      id: "opp-2",
      companyId: "company-1",
      createdAt: "2026-05-02T00:00:00.000Z",
      companyName: "Bravo",
      title: "Bravo",
      body: "Manual lane card",
      website: "https://bravo.example",
      linkedinUrl: null,
      instagramUrl: null,
      facebookUrl: null,
      xUrl: null,
      location: "Paris",
      coreOffer: "Software",
      financialBackground: null,
      fitRationale: "Manual hold",
      opportunityType: "PARTNER",
      hashtags: ["partner"],
      salesGeographies: ["EU"],
      contactInfo: {},
      confidence: 40,
      confidenceScore: 40,
      impact: 9,
      weight: 4,
      iceScore: 36,
      scoreProfile: null,
      fingerprint: "manual-fingerprint",
      kanbanColumn: "ROADMAP",
      manualLaneOverrideAt: "2026-05-03T00:00:00.000Z",
    },
  ]);

  const firstPass = await repairOpportunitycards(prisma, { batchSize: 1, maxBatches: 1 });
  assert.equal(firstPass.processed, 1, "bounded repair should inspect only one batch per pass");
  assert.equal(firstPass.updated, 1, "bounded repair should update the stale card in the inspected batch");
  assert.equal(firstPass.completed, false, "bounded repair should remain pending when more rows exist");
  assert.equal(typeof firstPass.cursor?.id, "string", "bounded repair must persist a cursor for the next pass");

  const repairedAutomatic = prisma.cards.find((card) => card.id === "opp-1");
  assert.equal(repairedAutomatic.confidence, 5, "legacy 0-100 confidence must normalize to canonical scale");
  assert.equal(repairedAutomatic.confidenceScore, 5, "confidenceScore must normalize with confidence");
  assert.equal(repairedAutomatic.iceScore, 120, "repaired ICE must use task-style scoring");
  assert.equal(repairedAutomatic.kanbanColumn, "CHECKLIST", "non-manual lane should be rederived from repaired ICE");
  assert.equal(typeof repairedAutomatic.scoreProfile, "object", "repair must persist a score profile");

  const resumedPass = await repairOpportunitycards(prisma, {
    batchSize: 1,
    maxBatches: 1,
    startAfter: firstPass.cursor,
  });
  assert.equal(resumedPass.processed, 1, "resumed repair should continue from the saved cursor");
  assert.equal(resumedPass.updated, 1, "resumed repair should update the remaining stale card");
  assert.equal(resumedPass.completed, false, "resume pass stays pending until a terminal empty batch confirms completion");

  const repairedManual = prisma.cards.find((card) => card.id === "opp-2");
  assert.equal(repairedManual.kanbanColumn, "ROADMAP", "manual lane override must be preserved during repair");
  assert.equal(typeof repairedManual.scoreProfile, "object", "manual-lane cards still require repaired score profiles");

  const terminalPass = await repairOpportunitycards(prisma, {
    batchSize: 1,
    maxBatches: 1,
    startAfter: resumedPass.cursor,
  });
  assert.equal(terminalPass.processed, 0, "terminal empty pass should not inspect already completed cards");
  assert.equal(terminalPass.updated, 0, "terminal empty pass should not rewrite converged cards");
  assert.equal(terminalPass.completed, true, "repair should mark completion once no more rows remain");

  const idempotencePass = await repairOpportunitycards(prisma, { batchSize: 2 });
  assert.equal(idempotencePass.processed, 2, "idempotence check should still inspect all cards");
  assert.equal(idempotencePass.updated, 0, "repair should converge after prior passes");
  assert.equal(idempotencePass.completed, true, "full replay over converged rows should complete immediately");

  console.log("Opportunitycard repair tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
