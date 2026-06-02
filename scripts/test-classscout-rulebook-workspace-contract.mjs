import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

const missionContract = read("src/lib/destination-mission-contract.ts");
const missionState = read("src/lib/destination-missions.ts");
const missionRunner = read("src/lib/destination-mission-runner.ts");
const workspace = read("src/components/destination-content-ops-workspace.tsx");
const runnerUi = read("src/components/destination-rulebook-runner.tsx");

for (const state of [
  "QUEUED",
  "DISCOVERING",
  "CANDIDATE_IN_REVIEW",
  "PUBLISHING",
  "PUBLISHED_VERIFIED",
  "FAILED_RECOVERABLE",
  "FAILED_TERMINAL",
  "EXHAUSTED",
  "PAUSED",
]) {
  assertHas(missionContract, new RegExp(`"${state}"`), `Mission contract must expose ${state}.`);
}

assertHas(
  missionContract,
  /stopCondition: "one_live_verified_listing"/,
  "Rulebook policy must preserve the one-live-verified-listing stop condition.",
);
assertHas(
  missionState,
  /PUBLISHED_VERIFIED:\s*\[\]/,
  "Published-verified mission state must be terminal.",
);
assertHas(
  missionState,
  /EXHAUSTED:\s*\[\]/,
  "Exhausted mission state must be terminal.",
);
assertHas(
  missionState,
  /FAILED_RECOVERABLE:\s*\["DISCOVERING", "PAUSED", "FAILED_TERMINAL"\]/,
  "Recoverable failure must have explicit safe recovery transitions.",
);
assertHas(
  missionState,
  /advanceDestinationMissionAttempt/,
  "Mission state contract must expose candidate-attempt advancement.",
);
assertHas(
  missionState,
  /markDestinationMissionTerminal/,
  "Mission state contract must expose terminal outcome marking.",
);

for (const functionName of [
  "executeDestinationMissionNextAttempt",
  "executeDestinationMissionUntilBlocked",
]) {
  assertHas(missionRunner, new RegExp(functionName), `Mission runner must expose ${functionName}.`);
}
assertHas(
  missionRunner,
  /DestinationMissionState\.PUBLISHED_VERIFIED/,
  "Mission runner must stop after published verification.",
);
assertHas(
  missionRunner,
  /DestinationMissionState\.EXHAUSTED/,
  "Mission runner must handle exhausted missions.",
);
assertHas(
  missionRunner,
  /FAILED_RECOVERABLE/,
  "Mission runner must produce recoverable failure state.",
);

for (const route of [
  "discover-candidates",
  "extract-candidate",
  "score-candidate",
  "prepare-candidate",
  "execute-next-attempt",
  "execute-until-blocked",
  "advance-attempt",
  "mark-terminal",
]) {
  const routeSource = read(`src/app/api/destination-missions/runs/[id]/${route}/route.ts`);
  assertHas(routeSource, /companyId/, `${route} route must be Unit scoped.`);
  assertHas(routeSource, /destinationKey/, `${route} route must be destination scoped.`);
}

for (const tab of ["Mission setup", "Review packets", "Mission control"]) {
  assertHas(workspace, new RegExp(tab), `ClassScout workspace must expose ${tab}.`);
}
assertHas(
  workspace,
  /DestinationRulebookRunner/,
  "ClassScout workspace must include the rulebook runner.",
);
assertHas(
  workspace,
  /DestinationMissionControl/,
  "ClassScout workspace must include mission control.",
);
assertHas(
  workspace,
  /DestinationLearningPanel/,
  "ClassScout workspace must include learning feedback loop.",
);
assertHas(
  runnerUi,
  /destinationKey = "classscout"/,
  "Rulebook runner must default to ClassScout while accepting destination scope.",
);
assertHas(
  runnerUi,
  /setExecutionMode/,
  "Rulebook runner UI must expose execution mode state.",
);
assertHas(
  runnerUi,
  /loadMissionCandidates/,
  "Rulebook runner UI must expose candidate lab loading.",
);
assertHas(
  runnerUi,
  /execute-next-attempt/,
  "Rulebook runner UI must expose next-attempt execution.",
);
assertHas(
  runnerUi,
  /execute-until-blocked/,
  "Rulebook runner UI must expose bounded continuous execution.",
);

console.log("ClassScout rulebook workspace contract passed.");
