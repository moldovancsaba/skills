import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const daemonRoute = readFileSync("src/app/api/destination-missions/daemon/route.ts", "utf8");
const cronRoute = readFileSync("src/app/api/cron/destination-missions/route.ts", "utf8");
const commandsRoute = readFileSync("src/app/api/commands/route.ts", "utf8");
const systemCommands = readFileSync("scripts/lib/system-commands.js", "utf8");
const pipelineJobs = readFileSync("scripts/lib/pipeline-jobs.js", "utf8");
const burstRoute = readFileSync("src/app/api/local-ai/bursts/route.ts", "utf8");
const laneEventsRoute = readFileSync("src/app/api/local-ai/lane-events/route.ts", "utf8");
const localAiPage = readFileSync("src/app/local-ai/page.tsx", "utf8");
const miniappOpsActionsRoute = readFileSync("src/app/api/miniapps/[miniappKey]/ops/actions/route.ts", "utf8");
const miniappIntelligenceContractRoute = readFileSync("src/app/api/miniapps/[miniappKey]/intelligence-contract/route.ts", "utf8");
const destinationMissionQueueHelper = readFileSync("src/lib/destination-mission-queue.ts", "utf8");
const destinationMissionActionRoutes = [
  "src/app/api/destination-missions/runs/[id]/discover-candidates/route.ts",
  "src/app/api/destination-missions/runs/[id]/extract-candidate/route.ts",
  "src/app/api/destination-missions/runs/[id]/score-candidate/route.ts",
  "src/app/api/destination-missions/runs/[id]/prepare-candidate/route.ts",
  "src/app/api/destination-missions/runs/[id]/execute-next-attempt/route.ts",
  "src/app/api/destination-missions/runs/[id]/execute-until-blocked/route.ts",
].map((file) => [file, readFileSync(file, "utf8")]);

assert.match(daemonRoute, /escalateCompanyPipelineJob/, "destination daemon route must enqueue/escalate pipeline work");
assert.doesNotMatch(daemonRoute, /assertPlaylistMutationAuthority/, "destination daemon route must not execute Playlist work in Webapp");
assert.doesNotMatch(daemonRoute, /executeDestinationMissionDaemonForCompany/, "destination daemon route must queue Local daemon work instead of executing directly");
assert.match(daemonRoute, /lane:\s*"PLAYLIST"/, "destination daemon route must report Playlist lane");
assert.match(daemonRoute, /queued:\s*true/, "destination daemon route must return a queued receipt");

assert.match(cronRoute, /escalateCompanyPipelineJob/, "cron destination route must enqueue/escalate pipeline work");
assert.doesNotMatch(cronRoute, /executeDestinationMissionDaemonForCompany/, "cron destination route must not execute daemon work directly");
assert.match(cronRoute, /lane:\s*"PLAYLIST"/, "cron destination route must report Playlist lane");

assert.match(commandsRoute, /QUEUE_CONTROL_COMMANDS/, "system command route must use explicit command allowlist");
assert.match(commandsRoute, /assertSystemHealthAction/, "system command route must validate System Health commands");
assert.match(commandsRoute, /Unsupported command/, "system command route must reject unsupported commands");
assert.match(systemCommands, /safeRecordLocalLaneEvent/, "system command worker must emit local lane events");
assert.match(systemCommands, new RegExp("recordCommandLaneEvent\\(prisma, context, cmd\\.command, \"STARTED\""), "system command worker must emit started lane event");
assert.match(systemCommands, new RegExp("recordCommandLaneEvent\\(prisma, context, cmd\\.command, \"COMPLETED\""), "system command worker must emit completed lane event");
assert.match(systemCommands, new RegExp("recordCommandLaneEvent\\(prisma, context, cmd\\.command, \"FAILED\""), "system command worker must emit failed lane event");

assert.match(pipelineJobs, /buildPlaylistMutationAuthority/, "pipeline worker must build Playlist mutation authority");
assert.match(pipelineJobs, /assertPipelineMutationAuthority/, "pipeline worker must assert mutation authority before job execution");
assert.match(pipelineJobs, /mutationAuthority:\s*buildPlaylistMutationAuthority/, "execution options must carry mutation authority");

assert.match(burstRoute, /verifyMembership\(request,\s*companyId,\s*"ADMIN"\)/, "burst route must require admin membership");
assert.match(burstRoute, /assertHumanApprovedBurstRequest/, "burst route must validate human-approved burst request contract");
assert.match(burstRoute, /createHumanApprovedBurstChildJobs/, "burst route must create queue child shards");
assert.match(burstRoute, /lane:\s*"HUMAN_APPROVED_BURST"/, "burst route must report Human-Approved Burst lane");
assert.match(burstRoute, /safeRecordLocalLaneEvent/, "burst route must emit best-effort lane events");
assert.match(burstRoute, /eventType:\s*"APPROVED"/, "burst route must record approval event");
assert.match(burstRoute, /eventType:\s*"CHILDREN_CREATED"/, "burst route must record child shard creation event");
assert.match(burstRoute, /export async function PATCH/, "burst route must expose recovery actions");
assert.match(burstRoute, /STOP_REQUESTED/, "burst route must support operator stop requests");
assert.match(burstRoute, /ROLLBACK_PARK_CHILD_JOBS/, "burst route must support parking rollback");
assert.match(burstRoute, /ROLLBACK_REWORK_CHILD_OUTPUTS/, "burst route must support rework rollback");
assert.match(burstRoute, /eventType\s*=\s*action === "STOP_REQUESTED" \? "STOP_REQUESTED" : "ROLLBACK"/, "burst route must emit stop and rollback lane events");

assert.match(pipelineJobs, /safeRecordLocalLaneEvent/, "pipeline worker must emit best-effort lane events");
assert.match(laneEventsRoute, /isLocalOperatorRequest/, "lane events API must allow local operator mission control reads");
assert.match(laneEventsRoute, /verifySuperAdmin/, "lane events API must be operator-protected outside local hosts");
assert.match(laneEventsRoute, /listLocalLaneEvents/, "lane events API must read compact lane event history");
assert.match(localAiPage, /LANE_EVENTS_URL/, "local mission control must request lane events");
assert.match(localAiPage, /Execution Lane History/, "local mission control must render lane event history");

assert.match(miniappOpsActionsRoute, /enqueueMiniappOpsAction/, "miniapp ops actions route must queue operator mutation intents");
assert.match(miniappOpsActionsRoute, /canQueueMiniappOpsAction/, "miniapp ops actions route must explicitly gate queueable actions");
assert.match(miniappOpsActionsRoute, /workerAuthorized/, "miniapp ops actions route must separate worker-authorized execution from operator enqueue");
assert.match(miniappOpsActionsRoute, /verifyBackgroundJobSecret/, "miniapp ops actions route must require worker secret for direct execution fallback");
assert.match(miniappOpsActionsRoute, /executeMiniappOpsAction/, "miniapp ops actions route may only execute through worker-authorized path");
assert.match(miniappIntelligenceContractRoute, /export async function GET/, "miniapp intelligence contract route must expose read-only GET");
assert.doesNotMatch(miniappIntelligenceContractRoute, /export async function POST/, "miniapp intelligence contract route must not expose mutation verbs");
assert.doesNotMatch(miniappIntelligenceContractRoute, /prisma\./, "miniapp intelligence contract route must not perform live database fan-out");

assert.match(destinationMissionQueueHelper, /escalateCompanyPipelineJob/, "destination mission queue helper must escalate persisted Playlist work");
assert.match(destinationMissionQueueHelper, /jobType:\s*"DESTINATION_MISSION_DAEMON"/, "destination mission queue helper must target daemon worker jobs");
assert.match(destinationMissionQueueHelper, /lane:\s*"PLAYLIST"/, "destination mission queue helper must report Playlist lane");
for (const [file, source] of destinationMissionActionRoutes) {
  assert.match(source, /queueDestinationMissionRunAction/, `${file} must enqueue destination mission work`);
  assert.match(source, /verifyMembership\(request,\s*companyId,\s*"ADMIN"\)/, `${file} must require admin membership`);
  assert.match(source, /status:\s*202/, `${file} must return a queued response`);
  assert.doesNotMatch(source, /discoverClassScoutCandidates|discoverCompareCandidates|extractClassScoutCandidate|extractCompareCandidate|scoreClassScoutCandidate|scoreCompareCandidate|prepareClassScoutCandidateReview|prepareCompareCandidateReview/, `${file} must not execute destination intelligence helpers in Webapp`);
}

console.log("Three-lane route contract tests passed.");
