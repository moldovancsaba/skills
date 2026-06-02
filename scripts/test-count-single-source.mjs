import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readModel = readFileSync("src/lib/company-read-model.ts", "utf8");
const salesClient = readFileSync("src/app/[companyId]/sales/sales-client.tsx", "utf8");
const knowmoreClient = readFileSync("src/app/[companyId]/knowmore/knowmore-client.tsx", "utf8");
const dataPage = readFileSync("src/app/data/page.tsx", "utf8");
const salesSummary = readFileSync("src/app/api/companies/[companyId]/sales-summary/route.ts", "utf8");

assert.doesNotMatch(readModel, /buildCountsFromSnapshot|dataIngressCount|topicSynthesisCount|knowmoreCount|strategicGoalsCount|reviewGatewayCount/, "company read model must not use legacy fallback count fields");
assert.doesNotMatch(salesClient, /opportunitycards\.filter\([^)]*\)\.length/, "sales UI must not derive counts from loaded opportunitycards");
assert.doesNotMatch(knowmoreClient, /\.reduce\s*\(/, "knowmore UI must not derive summary counts with reducers");
assert.doesNotMatch(dataPage, /items\.filter\([^)]*\)\.length|sources\.length/, "data UI must not derive business counts from loaded arrays");
assert.doesNotMatch(salesSummary, /opportunitycard\.count|ProjectionSalesSummary/, "sales summary route must not recalculate fallback counts");

console.log("count single-source guard OK");
