import { prisma } from "@/lib/db";
import {
  createClassScoutLiveRevision,
  listClassScoutLiveListings,
  type ClassScoutLiveListingSummary,
} from "@/lib/destination-classscout";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";

type MaintenanceDefaults = {
  maxRevisionIntakes: number;
  maxApprovedPublishes: number;
  providerStaleDays: number;
  meetupStaleDays: number;
};

export type ClassScoutRefreshCandidate = {
  id: string;
  targetType: "provider" | "meetupGroup";
  targetId: string;
  title: string;
  reason: "stale" | "feedback-declined" | "image-dup" | "low-confidence" | "schema-drift";
  freshnessScore: number;
  refreshAttempts: number;
  nextEligibleAt: string;
  idempotencyKey: string;
};

const ACTIVE_PACKET_STATES = new Set([
  "AWAITING_REVIEW",
  "REVIEW_REQUIRED",
  "APPROVED",
  "REWORK_REQUESTED",
  "DRAFTED",
  "VALIDATED",
]);

function readInt(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

export function readClassScoutMaintenanceDefaults(): MaintenanceDefaults {
  return {
    maxRevisionIntakes: readInt("CLASSSCOUT_MAINTENANCE_MAX_REVISIONS", 3, 1, 20),
    maxApprovedPublishes: readInt("CLASSSCOUT_MAINTENANCE_MAX_PUBLISHES", 5, 1, 20),
    providerStaleDays: readInt("CLASSSCOUT_PROVIDER_REFRESH_DAYS", 21, 1, 365),
    meetupStaleDays: readInt("CLASSSCOUT_MEETUP_REFRESH_DAYS", 30, 1, 365),
  };
}

function parseIso(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function hasActiveRevision(item: ClassScoutLiveListingSummary) {
  return item.revisionStatus.packetState ? ACTIVE_PACKET_STATES.has(item.revisionStatus.packetState) : false;
}

function ageDaysSince(value: string | null | undefined, nowMs: number) {
  const parsed = parseIso(value);
  if (parsed === null) return null;
  return Math.floor((nowMs - parsed) / 86_400_000);
}

function isStaleListing(item: ClassScoutLiveListingSummary, defaults: MaintenanceDefaults, nowMs: number) {
  if (hasActiveRevision(item)) return false;

  const threshold = item.type === "meetupGroup" ? defaults.meetupStaleDays : defaults.providerStaleDays;
  const freshnessReference = item.revisionStatus.lastSubmittedAt ?? item.updatedAt ?? null;
  const ageDays = ageDaysSince(freshnessReference, nowMs);
  if (ageDays === null) return true;
  return ageDays >= threshold;
}

function stalePriority(item: ClassScoutLiveListingSummary, nowMs: number) {
  const freshnessReference = item.revisionStatus.lastSubmittedAt ?? item.updatedAt ?? null;
  const parsed = parseIso(freshnessReference);
  if (parsed === null) return Number.NEGATIVE_INFINITY;
  return parsed - nowMs;
}

function buildRefreshCandidate(
  item: ClassScoutLiveListingSummary,
  defaults: MaintenanceDefaults,
  nowMs: number,
): ClassScoutRefreshCandidate {
  const freshnessReference = item.revisionStatus.lastSubmittedAt ?? item.updatedAt ?? null;
  const ageDays = ageDaysSince(freshnessReference, nowMs);
  const threshold = item.type === "meetupGroup" ? defaults.meetupStaleDays : defaults.providerStaleDays;
  const normalizedAge = ageDays === null ? threshold * 2 : Math.max(0, ageDays);
  const freshnessScore = Math.max(0, Math.min(100, Math.round(100 - (normalizedAge / Math.max(1, threshold)) * 100)));
  const nextEligibleAt = new Date(nowMs).toISOString();
  return {
    id: `classscout-refresh:${item.type}:${item.id}`,
    targetType: item.type,
    targetId: item.id,
    title: item.title,
    reason: "stale",
    freshnessScore,
    refreshAttempts: item.revisionStatus.packetId ? 1 : 0,
    nextEligibleAt,
    idempotencyKey: `classscout-refresh:${item.type}:${item.id}:${freshnessReference ?? "missing"}`,
  };
}

export async function selectClassScoutRefreshCandidates(input: {
  companyId: string;
  limit?: number;
}) {
  const defaults = readClassScoutMaintenanceDefaults();
  const limit = Math.max(1, Math.min(input.limit ?? defaults.maxRevisionIntakes, 50));
  const listingResult = await listClassScoutLiveListings({
    companyId: input.companyId,
    listingType: "all",
  });
  if (!listingResult.ok) {
    return {
      ok: false as const,
      status: listingResult.status,
      error: listingResult.error ?? "Failed to list ClassScout live listings.",
      candidates: [] as ClassScoutRefreshCandidate[],
      reasonBreakdown: {} as Record<ClassScoutRefreshCandidate["reason"], number>,
    };
  }

  const nowMs = Date.now();
  const candidates = (Array.isArray(listingResult.items) ? listingResult.items : [])
    .filter((item) => isStaleListing(item, defaults, nowMs))
    .sort((left, right) => stalePriority(left, nowMs) - stalePriority(right, nowMs) || left.title.localeCompare(right.title))
    .slice(0, limit)
    .map((item) => buildRefreshCandidate(item, defaults, nowMs));

  return {
    ok: true as const,
    candidates,
    reasonBreakdown: candidates.reduce<Record<ClassScoutRefreshCandidate["reason"], number>>((acc, candidate) => {
      acc[candidate.reason] += 1;
      return acc;
    }, {
      stale: 0,
      "feedback-declined": 0,
      "image-dup": 0,
      "low-confidence": 0,
      "schema-drift": 0,
    }),
  };
}

export async function publishApprovedClassScoutRevisionPackets(input: {
  companyId: string;
  actorId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(input.limit ?? readClassScoutMaintenanceDefaults().maxApprovedPublishes, 20));
  const packets = await prisma.destinationReviewPacket.findMany({
    where: {
      companyId: input.companyId,
      packetState: "APPROVED",
      destinationInstance: {
        destinationKey: "classscout",
      },
    },
    include: {
      outcomeMemories: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      reviewDecisions: {
        orderBy: { reviewedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit * 4,
  });

  const selected = packets.filter((packet) => {
    const metadata =
      packet.metadata && typeof packet.metadata === "object" && !Array.isArray(packet.metadata)
        ? (packet.metadata as Record<string, unknown>)
        : null;
    return metadata?.source === "classscout-live-listing-revision"
      && !packet.outcomeMemories.some((item) => item.eventType === "publish_completed");
  }).slice(0, limit);

  const results = [];
  for (const packet of selected) {
    results.push(await publishDestinationReviewPacket({
      companyId: input.companyId,
      reviewPacketId: packet.id,
      reviewedBy: input.actorId,
    }));
  }

  return {
    processed: selected.length,
    results,
  };
}

export async function sweepStaleClassScoutListings(input: {
  companyId: string;
  limit?: number;
}) {
  const candidateResult = await selectClassScoutRefreshCandidates(input);
  if (!candidateResult.ok) {
    return {
      ok: false as const,
      status: candidateResult.status,
      error: candidateResult.error,
      processed: 0,
      created: 0,
      skipped: 0,
      items: [],
    };
  }

  const items = [];
  for (const item of candidateResult.candidates) {
    const result = await createClassScoutLiveRevision({
      companyId: input.companyId,
      listingId: item.targetId,
      listingType: item.targetType,
    });
    items.push({
      candidateId: item.id,
      idempotencyKey: item.idempotencyKey,
      listingId: item.targetId,
      listingType: item.targetType,
      title: item.title,
      result,
    });
  }

  return {
    ok: true as const,
    processed: candidateResult.candidates.length,
    created: items.filter((item) => item.result.ok).length,
    skipped: items.filter((item) => !item.result.ok).length,
    items,
  };
}

export async function runClassScoutRefreshLaneTick(input: {
  companyId: string;
  actorId: string;
  limit?: number;
}) {
  const [publishResult, refreshResult] = await Promise.all([
    publishApprovedClassScoutRevisionPackets({
      companyId: input.companyId,
      actorId: input.actorId,
    }),
    sweepStaleClassScoutListings({
      companyId: input.companyId,
      limit: input.limit,
    }),
  ]);

  return {
    ok: refreshResult.ok,
    publishedApprovedPackets: publishResult.processed,
    refresh: refreshResult,
    generatedAt: new Date().toISOString(),
  };
}
