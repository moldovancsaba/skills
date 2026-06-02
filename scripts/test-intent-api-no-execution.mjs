import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const intentFiles = [
  "src/app/api/visitor/[visitorKey]/candidates/[id]/classify/route.ts",
  "src/app/api/visitor/[visitorKey]/candidates/[id]/extract/route.ts",
  "src/app/api/visitor/[visitorKey]/candidates/[id]/prepare-review/route.ts",
  "src/app/api/visitor/[visitorKey]/candidates/[id]/score/route.ts",
  "src/app/api/visitor/[visitorKey]/discover/route.ts",
  "src/app/api/visitor/[visitorKey]/research/burst/run/route.ts",
  "src/app/api/visitor/[visitorKey]/research/gates/evaluate/route.ts",
  "src/app/api/visitor/[visitorKey]/research/opportunities/promote/route.ts",
  "src/app/api/visitor/[visitorKey]/research/tasks/plan/route.ts",
];

const forbidden = [
  "visitor-candidate-pipeline",
  "miniapp-burst-controller",
  "miniapp-promotion-gates",
  "miniapp-opportunity-lifecycle",
  "miniapp-research-planner",
  "destination-mission-runner",
  "destination-mission-daemon",
];

for (const file of intentFiles) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /queueVisitorLocalIntent/, `${file} must queue Local AI intent`);
  for (const token of forbidden) {
    assert.doesNotMatch(source, new RegExp(token), `${file} must not import or execute ${token}`);
  }
}

const daemonRoute = readFileSync("src/app/api/destination-missions/daemon/route.ts", "utf8");
assert.match(daemonRoute, /escalateCompanyPipelineJob/, "destination daemon route must queue local work");
assert.doesNotMatch(daemonRoute, /executeDestinationMissionDaemonForCompany|assertPlaylistMutationAuthority/, "destination daemon route must not execute local daemon work in Webapp");

console.log("intent API no-execution guard OK");
