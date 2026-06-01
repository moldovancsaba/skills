import assert from "node:assert/strict";
import { listLocalLaneEvents, recordLocalLaneEvent, safeRecordLocalLaneEvent } from "../src/lib/local-lane-events.ts";

function createPrismaStub() {
  let setting = null;
  return {
    get value() {
      return setting?.value;
    },
    systemSetting: {
      async findUnique({ where }) {
        assert.equal(where.key, "local_ai_lane_events");
        return setting;
      },
      async upsert({ where, create, update }) {
        assert.equal(where.key, "local_ai_lane_events");
        setting = setting ? { ...setting, ...update } : { ...create };
        return setting;
      },
    },
  };
}

const prisma = createPrismaStub();
await recordLocalLaneEvent(prisma, {
  lane: "PLAYLIST",
  eventType: "STARTED",
  actor: "local-worker",
  summary: "Started with token=abc123 and Bearer abc.def.ghi",
  jobId: "job-1",
  destinationKey: "compare",
  metadata: {
    nested: {
      apiKey: "api_key=super-secret",
      childJobIds: ["child-1", "child-2"],
    },
  },
});

await recordLocalLaneEvent(prisma, {
  lane: "HUMAN_APPROVED_BURST",
  eventType: "APPROVED",
  actor: "operator",
  summary: "Approved Compare burst",
  burstId: "burst-1",
});

const allEvents = await listLocalLaneEvents(prisma, { limit: 10 });
assert.equal(allEvents.length, 2, "lane event store should return recent events");
assert.equal(allEvents[0].eventType, "APPROVED", "newest event should be first");
assert.equal(allEvents[1].destinationKey, "compare", "destination key should be persisted");
assert.doesNotMatch(allEvents[1].summary, /abc123|abc\.def\.ghi/, "event summaries must redact obvious secrets");
assert.doesNotMatch(JSON.stringify(allEvents[1].metadata), /super-secret/, "event metadata must redact obvious secrets");

const playlistEvents = await listLocalLaneEvents(prisma, { lane: "PLAYLIST", limit: 10 });
assert.equal(playlistEvents.length, 1, "lane filter should only return matching events");
assert.equal(playlistEvents[0].jobId, "job-1");

for (let index = 0; index < 260; index += 1) {
  await recordLocalLaneEvent(prisma, {
    lane: "SYSTEM_HEALTH",
    eventType: "PROGRESS",
    actor: "system",
    summary: `health event ${index}`,
  });
}

const cappedEvents = await listLocalLaneEvents(prisma, { limit: 300 });
assert.equal(cappedEvents.length, 250, "lane event store must cap the ring buffer");

const brokenPrisma = {
  systemSetting: {
    async findUnique() {
      throw new Error("temporary database conflict");
    },
  },
};
const safeResult = await safeRecordLocalLaneEvent(brokenPrisma, {
  lane: "PLAYLIST",
  eventType: "FAILED",
  actor: "local-worker",
  summary: "this should not throw",
});
assert.equal(safeResult, null, "safe lane event writer must not throw");

console.log("Local lane event contract tests passed.");
