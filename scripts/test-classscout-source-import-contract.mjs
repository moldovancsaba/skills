import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sourceImport = await import("../src/lib/classscout-source-import.ts");

const {
  normalizeClassScoutManhattanSourceLead,
  normalizeClassScoutManhattanSourceLeads,
} = sourceImport;

const normalized = normalizeClassScoutManhattanSourceLead(
  {
    url: "https://example.org/classes?utm_source=test#section",
    title: "Example Kids Studio",
    category: "STEM",
    neighborhood: "Upper West Side",
    extractionHints: ["Look for age ranges and registration URLs."],
    tags: ["robotics"],
    sourceUrls: ["https://example.org/register"],
  },
  0,
  "test-batch",
);

assert.equal(normalized.datacard.canonicalUrl, "https://example.org/classes?utm_source=test");
assert.equal(normalized.datacard.trustTier, "trusted");
assert.equal(normalized.datacard.sourceKind, "official_site");
assert.deepEqual(normalized.datacard.coverageGoalIds, ["classscout-manhattan-stem"]);
assert.equal(normalized.datacard.geography, "Manhattan");
assert.deepEqual(normalized.datacard.neighborhoods, ["Upper West Side"]);
assert.deepEqual(normalized.datacard.knownContentTypes, ["STEM"]);
assert.equal(normalized.datacard.importBatchId, "test-batch");
assert.equal(normalized.datacard.autoPublishEligible, false);
assert.equal(normalized.diagnostics.length, 0);

const blocked = normalizeClassScoutManhattanSourceLead({ url: "https://example.org/adult-only", category: "Dance" }, 1);
assert.equal(blocked.datacard.trustTier, "blocked");
assert(blocked.diagnostics.some((diagnostic) => diagnostic.code === "blocked_without_reason"));

const batch = normalizeClassScoutManhattanSourceLeads([
  { url: "https://example.org/music", category: "Music", neighborhood: "Chelsea" },
  { url: "", category: "Arts" },
]);
assert.equal(batch.ok, false);
assert.equal(batch.totalLeads, 2);
assert(batch.diagnostics.some((diagnostic) => diagnostic.code === "missing_url"));

const graphSource = readFileSync("src/lib/visitor-source-graph.ts", "utf8");
const routeSource = readFileSync("src/app/api/visitor/[visitorKey]/sources/import/route.ts", "utf8");
const serverSource = readFileSync("src/lib/classscout-source-import-server.ts", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

for (const token of ["coverageGoalIds", "geography", "neighborhoods", "importBatchId"]) {
  assert.match(graphSource, new RegExp(token), `Visitor source graph must persist ${token}.`);
}

assert.match(routeSource, /verifyMembership\(request, companyId, "ADMIN"\)/, "Bulk source import route must require admin membership.");
assert.match(routeSource, /dryRun = body\.dryRun !== false/, "Bulk source import route must default to dry-run.");
assert.match(routeSource, /at most 500 leads/, "Bulk source import route must cap batch size.");
assert.match(serverSource, /createVisitorSourceDatacard/, "Server import must write through existing datacard upsert path.");
assert.match(serverSource, /importedCount/, "Server import must report imported count.");
assert.match(docs, /ClassScout Manhattan Source Import/, "Docs must describe the ClassScout source import workflow.");

console.log("ClassScout source import contract passed.");
