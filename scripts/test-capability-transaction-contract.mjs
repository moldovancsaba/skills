import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const routePath = join(ROOT, "src/app/api/companies/[companyId]/capabilities/transaction/route.ts");
const docPath = join(ROOT, "docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md");

const routeSource = readFileSync(routePath, "utf8");
const docSource = readFileSync(docPath, "utf8");

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function expectRouteContains(pattern, message) {
  assert(pattern.test(routeSource), message);
}

function expectDocContains(pattern, message) {
  assert(pattern.test(docSource), message);
}

expectRouteContains(/type\s+MutationMode\s*=\s*"preview"\s*\|\s*"apply"/, "route contract must declare preview/apply modes");
expectRouteContains(/status:\s*422/, "route must return 422 for validation failures");
expectRouteContains(/status:\s*409/, "route must return 409 for version/idempotency conflicts");
expectRouteContains(/expectedVersion/, "route must require or handle expectedVersion");
expectRouteContains(/idempotencyKey/, "route must accept idempotencyKey");
expectRouteContains(/hiddenRoutes/, "route response must include impact.hiddenRoutes");
expectRouteContains(/blockedOperations/, "route response must include impact.blockedOperations");
expectRouteContains(/affectedMiniapps/, "route response must include impact.affectedMiniapps");
expectRouteContains(/CAPABILITY_TRANSACTION_PREVIEW/, "route must record preview interaction telemetry");
expectRouteContains(/CAPABILITY_TRANSACTION_CONFLICT/, "route must record conflict interaction telemetry");
expectRouteContains(/CAPABILITY_TRANSACTION_VALIDATION_FAILED/, "route must record validation interaction telemetry");
expectRouteContains(/CAPABILITY_TRANSACTION_APPLY/, "route must record apply interaction telemetry");
expectRouteContains(/UNIT_CAPABILITIES_UPDATED/, "route must record capability update outcome telemetry");

expectDocContains(/\/api\/companies\/\[companyId\]\/capabilities\/transaction/, "control-plane LLD must document the capability transaction endpoint");
expectDocContains(/Validation response:\s*[\s\S]*422/, "control-plane LLD must document 422 validation behavior");
expectDocContains(/Conflict responses:\s*[\s\S]*409/, "control-plane LLD must document 409 conflict behavior");

if (failures.length > 0) {
  console.error("capability transaction contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("capability transaction contract passed.");
