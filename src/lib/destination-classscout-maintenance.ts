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
  const defaults = readClassScoutMaintenanceDefaults();
  const limit = Math.max(1, Math.min(input.limit ?? defaults.maxRevisionIntakes, 20));
  const listingResult = await listClassScoutLiveListings({
    companyId: input.companyId,
    listingType: "all",
  });
  if (!listingResult.ok) {
    return {
      ok: false as const,
      status: listingResult.status,
      error: listingResult.error ?? "Failed to list ClassScout live listings.",
      processed: 0,
      created: 0,
      skipped: 0,
      items: [],
    };
  }

  const nowMs = Date.now();
  const liveItems = Array.isArray(listingResult.items) ? listingResult.items : [];
  const staleItems = liveItems
    .filter((item) => isStaleListing(item, defaults, nowMs))
    .sort((left, right) => stalePriority(left, nowMs) - stalePriority(right, nowMs) || left.title.localeCompare(right.title))
    .slice(0, limit);

  const items = [];
  for (const item of staleItems) {
    const result = await createClassScoutLiveRevision({
      companyId: input.companyId,
      listingId: item.id,
      listingType: item.type,
    });
    items.push({
      listingId: item.id,
      listingType: item.type,
      title: item.title,
      result,
    });
  }

  return {
    ok: true as const,
    processed: staleItems.length,
    created: items.filter((item) => item.result.ok).length,
    skipped: items.filter((item) => !item.result.ok).length,
    items,
  };
}
