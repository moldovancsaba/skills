import assert from "node:assert/strict";

const model = await import("../src/lib/visitor-card-classification.ts");

const {
  mergeVisitorCardClassification,
  normalizeVisitorCardClassification,
  normalizeVisitorCardIdentity,
  validateVisitorCardClassification,
  validateVisitorCardIdentity,
} = model;

const identity = normalizeVisitorCardIdentity({
  name: "Parabellum lőtér",
  website: "https://parabellumse.hu/?utm=test",
  address: "XX. kerület, Magyarország",
});

assert.equal(identity.officialWebsite, "https://parabellumse.hu/");
assert(identity.stableId.includes("https://parabellumse.hu/"), "stable identity should include official website anchor.");
assert.equal(validateVisitorCardIdentity(identity).valid, true);

const classification = normalizeVisitorCardClassification({
  primaryCategory: "Classes",
  primaryCategoryReason: "Source mentions training and firearm knowledge courses.",
  categoryAffinities: [
    {
      category: "Camps",
      confidence: 0.82,
      evidence: ["Official page describes a lőtér/range."],
      sourceUrls: ["https://parabellumse.hu/?utm=abc"],
      reason: "Venue/range evidence.",
    },
    {
      category: "Camps",
      confidence: 0.76,
      evidence: ["Secondary range evidence."],
      sourceUrls: ["https://parabellumse.hu/#section"],
      reason: "Duplicate lower-confidence affinity should merge.",
    },
    {
      category: "Competitions",
      confidence: 0.71,
      evidence: ["Official source mentions versenyek."],
      sourceUrls: ["https://parabellumse.hu/"],
      reason: "Competition evidence.",
    },
  ],
  viewEligibility: ["training", "ranges", "training"],
  activityTypes: ["Képzések", "Foglalás", "Képzések"],
});

assert.equal(classification.primaryCategory, "Classes");
assert.equal(classification.categoryAffinities.length, 2, "duplicate affinity categories should merge.");
assert.deepEqual(classification.viewEligibility, ["training", "ranges"]);
assert.deepEqual(classification.activityTypes, ["Képzések", "Foglalás"]);
assert.equal(validateVisitorCardClassification(classification).valid, true);

const weak = normalizeVisitorCardClassification({
  primaryCategory: "Classes",
  categoryAffinities: [{ category: "Camps", confidence: 0.4, evidence: [], reason: "" }],
});
const weakValidation = validateVisitorCardClassification(weak);
assert.equal(weakValidation.valid, false);
assert(weakValidation.issues.some((issue) => issue.code === "weak_affinity_confidence"));
assert(weakValidation.issues.some((issue) => issue.code === "missing_affinity_evidence"));

const merged = mergeVisitorCardClassification(classification, {
  primaryCategory: "Camps",
  primaryCategoryReason: "Updated primary placement after maintenance.",
  categoryAffinities: [
    {
      category: "Classes",
      confidence: 0.9,
      evidence: ["Course page evidence."],
      sourceUrls: ["https://parabellumse.hu/"],
      reason: "Training remains eligible.",
    },
  ],
  viewEligibility: ["competitions"],
  activityTypes: ["Versenyek"],
});

assert.equal(merged.primaryCategory, "Camps", "new classification should be able to update primary category.");
assert(merged.categoryAffinities.some((affinity) => affinity.category === "Classes"));
assert.deepEqual(merged.viewEligibility, ["training", "ranges", "competitions"]);
assert.deepEqual(merged.activityTypes, ["Képzések", "Foglalás", "Versenyek"]);

console.log("visitor card classification contract passed.");
