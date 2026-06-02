import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const missionContract = read("src/lib/destination-mission-contract.ts");
const missionState = read("src/lib/destination-missions.ts");
const missionRunner = read("src/lib/destination-mission-runner.ts");
const missionSummary = read("src/lib/destination-workflow-runtime.ts");
const missionControl = read("src/components/destination-mission-control.tsx");
const learning = read("src/lib/destination-learning.ts");
const learningPanel = read("src/components/destination-learning-panel.tsx");
const docs = read("docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md");

for (const token of [
  "DESTINATION_MISSION_TERMINAL_STATES",
  "DESTINATION_MISSION_RECOVERABLE_STATES",
  "DESTINATION_MISSION_ATTEMPT_OUTCOME_CODES",
  "verify_failed",
  "publish_partial",
]) {
  assert.match(missionContract, new RegExp(token), `mission contract must expose ${token}`);
}

for (const token of [
  "DESTINATION_MISSION_TRANSITION_MAP",
  "missionTransitionAudit",
  "recoveryHint",
  "nextAction",
  "publish_recovery_required",
]) {
  assert.match(missionState, new RegExp(token), `mission state hardening must include ${token}`);
}

assert.match(missionRunner, /DESTINATION_MISSION_SOFT_TIMEOUT_MS\s*=\s*45_000/, "runner must define the 45 second soft timeout");
assert.match(missionRunner, /DESTINATION_MISSION_HARD_TIMEOUT_MS\s*=\s*90_000/, "runner must define the 90 second hard timeout");
assert.match(missionRunner, /withMissionStepTimeout/, "runner must wrap remote steps in bounded timeouts");
assert.match(missionRunner, /status:\s*504/, "runner timeout failures must be classified as timeout errors");

for (const token of ["verificationHealth", "trackHealth", "nextRetryAction"]) {
  assert.match(missionSummary, new RegExp(token), `mission control summary must expose ${token}`);
  assert.match(missionControl, new RegExp(token), `mission control UI must render ${token}`);
}

assert.match(missionControl, /aria-live="polite"/, "mission control must announce refreshed verification/recovery state accessibly");
assert.match(missionControl, /Publish verification health/, "mission control must expose publish verification health");

assert.match(learning, /policySuggestionForReason/, "learning loop must build policy suggestions from reasons");
for (const token of ["policySuggestions", "requiresApproval"]) {
  assert.match(learning, new RegExp(token), `learning loop must include ${token}`);
  assert.match(learningPanel, new RegExp(token), `learning UI must render ${token}`);
}

assert.match(learningPanel, /Policy Suggestions/, "learning panel must expose the policy suggestion queue");
assert.match(docs, /Mission State Hardening/, "docs must describe mission state hardening");
assert.match(docs, /Publish Verification And Catalog Orchestration/, "docs must describe verification orchestration");
assert.match(docs, /Correction-To-Policy Loop/, "docs must describe policy learning loop");

console.log("ClassScout runtime quality contract passed.");
