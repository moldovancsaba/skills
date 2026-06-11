import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  readLocalAiFocusPolicy,
  getLocalAiJobDestinationKeys,
  isPipelineJobAllowedByLocalAiFocus,
  filterDestinationKeysForLocalAiFocus,
} = require("../src/lib/local-ai-focus.js");

const focusPolicy = readLocalAiFocusPolicy({
  CHECK_LOCAL_FOCUS_ENABLED: "true",
  CHECK_LOCAL_FOCUS_DESTINATION_KEYS: "classscout",
  CHECK_LOCAL_FOCUS_REASON: "test focus",
});

assert.equal(focusPolicy.enabled, true, "focus policy must enable when the flag and destination scope are present");
assert.deepEqual(focusPolicy.destinationKeys, ["classscout"], "focus policy must normalize destination keys");

const classScoutJob = {
  jobType: "DESTINATION_MISSION_DAEMON",
  metadata: {
    destinationKey: "classscout",
    playlist: { miniappKey: "classscout" },
  },
};
const multiClassScoutJob = {
  jobType: "DESTINATION_MISSION_DAEMON",
  metadata: {
    destinationKey: "multi",
    activeDestinationKeys: ["classscout", "compare"],
  },
};
const compareJob = {
  jobType: "DESTINATION_MISSION_DAEMON",
  metadata: {
    destinationKey: "compare",
    playlist: { miniappKey: "compare" },
  },
};
const unscopedChecklistJob = {
  jobType: "SEARCH_OPPORTUNITYCARDS",
  metadata: {
    playlist: { blockId: "sales", moduleId: "sales" },
  },
};

assert.deepEqual(getLocalAiJobDestinationKeys(classScoutJob), ["classscout"], "ClassScout scope must be detected from job metadata");
assert.equal(isPipelineJobAllowedByLocalAiFocus(classScoutJob, focusPolicy), true, "ClassScout jobs must remain runnable");
assert.equal(isPipelineJobAllowedByLocalAiFocus(multiClassScoutJob, focusPolicy), true, "multi jobs that include ClassScout must remain runnable");
assert.equal(isPipelineJobAllowedByLocalAiFocus(compareJob, focusPolicy), false, "Compare jobs must be blocked in ClassScout focus mode");
assert.equal(isPipelineJobAllowedByLocalAiFocus(unscopedChecklistJob, focusPolicy), false, "unscoped Checklist jobs must be blocked in ClassScout focus mode");
assert.deepEqual(
  filterDestinationKeysForLocalAiFocus(["classscout", "compare", "trainers"], focusPolicy),
  ["classscout"],
  "destination daemon iteration must be reduced to ClassScout",
);

const pipelineQueueSource = readFileSync("src/lib/pipeline-queue.js", "utf8");
const pipelineJobsSource = readFileSync("scripts/lib/pipeline-jobs.js", "utf8");
const destinationDaemonSource = readFileSync("src/lib/destination-mission-daemon.ts", "utf8");

assert.match(pipelineQueueSource, /isPipelineJobAllowedByLocalAiFocus/, "queue claimer must filter runnable jobs by focus mode");
assert.match(pipelineJobsSource, /buildLocalAiFocusBlockMessage/, "pipeline execution must refuse non-focus jobs before mutation");
assert.match(destinationDaemonSource, /filterDestinationKeysForLocalAiFocus/, "destination daemon must restrict internal destination iteration");

console.log("local AI focus mode contracts passed");
