import assert from "node:assert/strict";
import {
  assertHumanApprovedBurstRequest,
  assertPlaylistMutationAuthority,
  assertSystemHealthAction,
  splitBurstIntoShardCounts,
} from "../src/lib/local-execution-lanes.ts";

assert.doesNotThrow(() =>
  assertSystemHealthAction({
    action: "MEMORY_GUARD",
    humanName: "CHECK Local Memory Guard",
    reason: "critical memory pressure",
    requestedBy: "system",
    mutatesBusinessContent: false,
    timeoutMs: 30000,
  }),
);

assert.throws(
  () =>
    assertSystemHealthAction({
      action: "MEMORY_GUARD",
      humanName: "Bad health content mutation",
      reason: "test",
      requestedBy: "system",
      mutatesBusinessContent: true,
    }),
  (error) => error?.code === "SYSTEM_HEALTH_CONTENT_MUTATION_FORBIDDEN",
);

assert.doesNotThrow(() =>
  assertPlaylistMutationAuthority({
    lane: "PLAYLIST",
    jobId: "job_123",
    actor: "local-worker",
  }),
);

assert.throws(() => assertPlaylistMutationAuthority(undefined), (error) => error?.code === "MUTATION_AUTHORITY_REQUIRED");

assert.doesNotThrow(() =>
  assertHumanApprovedBurstRequest({
    approvedBy: "operator",
    reason: "Stress test Compare Visitor content generation",
    requestedOutputCount: 30,
    shardSize: 5,
    maxConcurrency: 2,
    minFreeMemoryMb: 4096,
    timeoutSeconds: 3600,
    target: { destinationKey: "compare" },
    rollbackMode: "REWORK_CHILD_OUTPUTS",
  }),
);

assert.deepEqual(splitBurstIntoShardCounts(12, 5), [5, 5, 2]);

console.log("Local execution lane contract tests passed.");
