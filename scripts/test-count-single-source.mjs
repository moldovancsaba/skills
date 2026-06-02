import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readModel = readFileSync("src/lib/company-read-model.ts", "utf8");
const salesClient = readFileSync("src/app/[companyId]/sales/sales-client.tsx", "utf8");
const knowmoreClient = readFileSync("src/app/[companyId]/knowmore/knowmore-client.tsx", "utf8");
const dataPage = readFileSync("src/app/data/page.tsx", "utf8");
const salesSummary = readFileSync("src/app/api/companies/[companyId]/sales-summary/route.ts", "utf8");
const navRoute = readFileSync("src/app/api/companies/[companyId]/nav/route.ts", "utf8");
const planningRoute = readFileSync("src/app/api/companies/[companyId]/planning-summary/route.ts", "utf8");
const blocksRoute = readFileSync("src/app/api/companies/[companyId]/blocks/summary/route.ts", "utf8");
const operationsRoute = readFileSync("src/app/api/companies/[companyId]/operations/route.ts", "utf8");

assert.doesNotMatch(readModel, /buildCountsFromSnapshot|dataIngressCount|topicSynthesisCount|knowmoreCount|strategicGoalsCount|reviewGatewayCount/, "company read model must not use legacy fallback count fields");
assert.doesNotMatch(readModel, /observabilitySummary|readQueueTotal/, "company read model must not override projection counts from observability");
assert.doesNotMatch(salesClient, /opportunitycards\.filter\([^)]*\)\.length/, "sales UI must not derive counts from loaded opportunitycards");
assert.doesNotMatch(knowmoreClient, /\.reduce\s*\(/, "knowmore UI must not derive summary counts with reducers");
assert.doesNotMatch(dataPage, /items\.filter\([^)]*\)\.length|sources\.length/, "data UI must not derive business counts from loaded arrays");
assert.doesNotMatch(salesSummary, /opportunitycard\.count|ProjectionSalesSummary/, "sales summary route must not recalculate fallback counts");
for (const [name, source] of [
  ["nav", navRoute],
  ["planning-summary", planningRoute],
  ["blocks-summary", blocksRoute],
]) {
  assert.doesNotMatch(source, /dataIngressCount|topicSynthesisCount|knowmoreCount|strategicGoalsCount|checklistCount:\s*true|tacticalBoardCount|reviewGatewayCount|observabilitySummary/, `${name} route must not select legacy count fallback fields`);
}
assert.doesNotMatch(operationsRoute, /readMiniappReviewPressureCount|observabilitySummary|readProjectionCount/, "operations route must not use observability fallback for miniapp review pressure counts");

console.log("count single-source guard OK");
