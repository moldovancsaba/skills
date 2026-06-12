import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const healthSource = readFileSync(join(ROOT, "src/lib/miniapp-intelligence-health.ts"), "utf8");
const routeSource = readFileSync(join(ROOT, "src/app/api/companies/[companyId]/miniapp-health/route.ts"), "utf8");
const observabilitySource = readFileSync(join(ROOT, "src/lib/observability.ts"), "utf8");
const proofGateSource = readFileSync(join(ROOT, "scripts/verify-ui-alignment-proof-gate.mjs"), "utf8");
const classScoutVerifier = readFileSync(join(ROOT, "scripts/verify-compare-golden-path.mjs"), "utf8");
const compareVerifier = readFileSync(join(ROOT, "scripts/verify-compare-golden-path.mjs"), "utf8");

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function contains(source, pattern, message) {
  assert(pattern.test(source), message);
}

contains(healthSource, /export type MiniappIntelligenceHealth/, "health contract type must be exported");
contains(healthSource, /localConnected/, "health contract must expose localConnected");
contains(healthSource, /freshnessState/, "health contract must expose freshnessState");
contains(healthSource, /missionState/, "health contract must expose missionState");
contains(healthSource, /reviewState/, "health contract must expose reviewState");
contains(healthSource, /publishState/, "health contract must expose publishState");
contains(healthSource, /failureState/, "health contract must expose failureState");
contains(healthSource, /retryState/, "health contract must expose retryState");
contains(healthSource, /blockers/, "health contract must expose blockers");
contains(healthSource, /recoveryActions/, "health contract must expose recoveryActions");
contains(healthSource, /evidenceRefs/, "health contract must expose evidenceRefs");
contains(healthSource, /getAllMiniappIntelligenceHealth/, "health contract must expose all-destination resolver");

contains(routeSource, /verifyMembership/, "miniapp health route must enforce membership");
contains(routeSource, /destinationKey must be supported by checklist/, "miniapp health route must validate destinationKey");
contains(routeSource, /getAllMiniappIntelligenceHealth/, "miniapp health route must return all health when no destinationKey is provided");

contains(observabilitySource, /miniappIntelligenceHealth/, "observability snapshot must include miniapp health");
contains(proofGateSource, /local-compare-intelligence-flow/, "proof gate must require Compare Local scenario");
contains(proofGateSource, /local-compare-intelligence-flow/, "proof gate must require Compare Local scenario");
contains(proofGateSource, /localConnected must be true/, "proof gate must validate localConnected");
contains(proofGateSource, /intelligenceFreshnessVerified must be true/, "proof gate must validate intelligence freshness");
contains(proofGateSource, /miniappContentFlowVerified must be true/, "proof gate must validate miniapp content flow");

contains(classScoutVerifier, /local-compare-intelligence-flow\.json/, "Compare verifier must write proof-gate evidence");
contains(classScoutVerifier, /localConnected/, "Compare verifier must check Local connectivity");
contains(compareVerifier, /local-compare-intelligence-flow\.json/, "Compare verifier must write proof-gate evidence");
contains(compareVerifier, /localConnected/, "Compare verifier must check Local connectivity");

if (failures.length > 0) {
  console.error("miniapp health contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("miniapp health contract passed.");
