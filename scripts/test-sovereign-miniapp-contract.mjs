import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const contractSource = readFileSync(join(root, "src/lib/miniapp-intelligence-contracts.ts"), "utf8");
const visitorRouteSource = readFileSync(join(root, "src/app/api/visitor/[visitorKey]/intelligence-contract/route.ts"), "utf8");
const miniappRouteSource = readFileSync(join(root, "src/app/api/miniapps/[miniappKey]/intelligence-contract/route.ts"), "utf8");
const missionSource = readFileSync(join(root, "src/lib/destination-missions.ts"), "utf8");
const publishBridgeSource = readFileSync(join(root, "src/lib/destination-publish-bridge.ts"), "utf8");
const visitorRunnerSource = readFileSync(join(root, "src/lib/visitor-pipeline-runner.ts"), "utf8");

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function contains(source, pattern, message) {
  assert(pattern.test(source), message);
}

contains(contractSource, /export type MiniappIntelligenceContract/, "contract type must be exported");
contains(contractSource, /successMetric:\s*"verified_public_visible_cards"/, "contract must define public visible-card success metric");
contains(contractSource, /sourceCardInventoryIsSuccess:\s*false/, "source-card inventory must never be a success metric");
contains(contractSource, /minimumContentQualityScore:\s*number/, "contract must define a publish content-quality threshold");
contains(contractSource, /MINIAPP_DEFAULT_MINIMUM_CONTENT_QUALITY_SCORE/, "contracts must use the shared 500-point content-quality floor");
contains(contractSource, /validateContentQualityThreshold/, "contract validator must validate content-quality thresholds");
contains(contractSource, /countDuplicateUpdatesAsNewCards:\s*false/, "duplicate updates must not count as new cards");
contains(contractSource, /compare\.visitor\.sovereign@v1/, "Compare sovereign contract must exist");
contains(contractSource, /compare\.visitor\.sovereign@v1/, "Compare sovereign contract must exist");
contains(contractSource, /allowedSearchProviders:\s*\["duckduckgo",\s*"bing-html",\s*"seed-fallback"\]/, "free search provider policy must be explicit");
contains(contractSource, /validateMiniappIntelligenceContract/, "contract validator must be exported");
contains(contractSource, /failurePolicy retryable\/terminal overlap/, "validator must reject retryable/terminal overlap");
contains(contractSource, /No sovereign miniapp intelligence contract registered/, "unknown miniapps must fail closed");

contains(visitorRouteSource, /verifyMembership/, "visitor contract route must enforce membership");
contains(visitorRouteSource, /companyId is required/, "visitor contract route must require companyId");
contains(visitorRouteSource, /resolveMiniappIntelligenceContract/, "visitor route must resolve contract");
contains(visitorRouteSource, /status:\s*resolved\.validation\.valid\s*\?\s*200\s*:\s*422/, "visitor route must fail closed on invalid contract");

contains(miniappRouteSource, /verifyMembership/, "miniapp contract route must enforce membership");
contains(miniappRouteSource, /companyId is required/, "miniapp contract route must require companyId");
contains(miniappRouteSource, /resolveMiniappIntelligenceContract/, "miniapp route must resolve contract");
contains(miniappRouteSource, /status:\s*resolved\.validation\.valid\s*\?\s*200\s*:\s*422/, "miniapp route must fail closed on invalid contract");

contains(missionSource, /miniappIntelligenceContractKey/, "mission runs must store miniapp contract key");
contains(missionSource, /miniappIntelligenceContractValid/, "mission runs must store contract validity");
contains(missionSource, /miniappIntelligenceContractErrors/, "mission runs must store contract errors");

contains(publishBridgeSource, /readContentQualityScore/, "publish bridge must read content quality score");
contains(publishBridgeSource, /content_quality_below_contract/, "publish bridge must fail closed below the quality threshold");
contains(publishBridgeSource, /status:\s*422/, "publish bridge must return an operator-actionable validation status for low quality");
contains(visitorRunnerSource, /score\?\.state === "NEEDS_REVIEW"/, "visitor runner must only prepare review cards after passing score gates");

if (failures.length > 0) {
  console.error("sovereign miniapp contract tests failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Sovereign miniapp contract tests passed.");
