import { prisma } from "@/lib/db";
import {
  publishApprovedClassScoutRevisionPackets,
  readClassScoutMaintenanceDefaults,
  sweepStaleClassScoutListings,
} from "@/lib/destination-classscout-maintenance";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

export type DestinationMaintenanceLimits = {
  maxRevisionIntakes: number;
  maxApprovedPublishes: number;
};

export type DestinationMaintenanceAdapterResult = {
  supported: boolean;
  approvedPublishes?: Record<string, unknown>;
  staleRevisionSweep?: Record<string, unknown>;
  reason?: string;
};

type DestinationMaintenanceAdapterInput = {
  companyId: string;
  actorId: string;
  limits: DestinationMaintenanceLimits;
};

const REVIEW_PRESSURE_PACKET_STATES = new Set(["AWAITING_REVIEW", "REVIEW_REQUIRED", "APPROVED"]);

function clampLimit(limit: number | undefined, fallback: number, min: number, max: number) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return fallback;
  return Math.max(min, Math.min(Math.round(limit), max));
}

function readCompareReviewStaleHours() {
  const raw = Number(process.env.COMPARE_REVIEW_STALE_HOURS ?? 24);
  if (!Number.isFinite(raw)) return 24;
  return Math.max(1, Math.min(Math.round(raw), 240));
}

function isFinalPublishOutcome(outcome: { eventType: string; reasonCode?: string | null; payload?: unknown }) {
  if (outcome.eventType === "publish_completed" || outcome.eventType === "publish_blocked" || outcome.eventType === "publish_failed") {
    return true;
  }

  if (outcome.eventType !== "publish_bridge_failed") {
    return false;
  }

  const payload = outcome.payload && typeof outcome.payload === "object" && !Array.isArray(outcome.payload)
    ? outcome.payload as Record<string, unknown>
    : null;

  return outcome.reasonCode === "HTTP_422" || payload?.status === "blocked" || payload?.retryable === false;
}

export function readDestinationMaintenanceDefaults(): DestinationMaintenanceLimits {
  const defaults = readClassScoutMaintenanceDefaults();
  return {
    maxRevisionIntakes: defaults.maxRevisionIntakes,
    maxApprovedPublishes: defaults.maxApprovedPublishes,
  };
}

async function publishApprovedPacketsForDestination(input: {
  companyId: string;
  destinationKey: DestinationKey;
  actorId: string;
  limit?: number;
}) {
  const defaults = readDestinationMaintenanceDefaults();
  const limit = clampLimit(input.limit, defaults.maxApprovedPublishes, 1, 20);
  const packets = await prisma.destinationReviewPacket.findMany({
    where: {
      companyId: input.companyId,
      packetState: "APPROVED",
      destinationInstance: {
        destinationKey: input.destinationKey,
      },
    },
    include: {
      outcomeMemories: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit * 4,
  });

  const selected = packets
    .filter((packet) => !packet.outcomeMemories.some((item) => isFinalPublishOutcome(item)))
    .slice(0, limit);

  const results = [];
  for (const packet of selected) {
    const publishResult = await publishDestinationReviewPacket({
      companyId: input.companyId,
      reviewPacketId: packet.id,
      reviewedBy: input.actorId,
    });
    results.push({
      reviewPacketId: packet.id,
      ...publishResult,
    });
  }

  return {
    processed: selected.length,
    results,
  };
}

async function scanReviewPressureForDestination(input: {
  companyId: string;
  destinationKey: DestinationKey;
}) {
  const counts = await prisma.destinationReviewPacket.groupBy({
    by: ["packetState"],
    where: {
      companyId: input.companyId,
      destinationInstance: {
        destinationKey: input.destinationKey,
      },
    },
    _count: {
      _all: true,
    },
  });

  const byState = counts.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.packetState] = Number(entry._count._all || 0);
    return acc;
  }, {});
  const reviewPressureCount = counts.reduce((sum, entry) => {
    if (!REVIEW_PRESSURE_PACKET_STATES.has(entry.packetState)) return sum;
    return sum + Number(entry._count._all || 0);
  }, 0);

  const staleHours = readCompareReviewStaleHours();
  const staleCutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);
  const staleApproved = await prisma.destinationReviewPacket.count({
    where: {
      companyId: input.companyId,
      packetState: "APPROVED",
      destinationInstance: {
        destinationKey: input.destinationKey,
      },
      updatedAt: {
        lte: staleCutoff,
      },
      outcomeMemories: {
        none: {
          eventType: "publish_completed",
        },
      },
    },
  });

  return {
    ok: true as const,
    mode: "review_pressure_scan",
    reviewPressureCount,
    staleApprovedCount: staleApproved,
    staleThresholdHours: staleHours,
    byState,
  };
}

async function executeClassScoutMaintenance(
  input: DestinationMaintenanceAdapterInput,
): Promise<DestinationMaintenanceAdapterResult> {
  const approvedPublishes = await publishApprovedClassScoutRevisionPackets({
    companyId: input.companyId,
    actorId: input.actorId,
    limit: input.limits.maxApprovedPublishes,
  });
  const staleRevisionSweep = await sweepStaleClassScoutListings({
    companyId: input.companyId,
    limit: input.limits.maxRevisionIntakes,
  });

  return {
    supported: true,
    approvedPublishes: approvedPublishes as Record<string, unknown>,
    staleRevisionSweep: staleRevisionSweep as Record<string, unknown>,
  };
}

async function executeCompareMaintenance(
  input: DestinationMaintenanceAdapterInput,
): Promise<DestinationMaintenanceAdapterResult> {
  const approvedPublishes = await publishApprovedPacketsForDestination({
    companyId: input.companyId,
    destinationKey: "compare",
    actorId: input.actorId,
    limit: input.limits.maxApprovedPublishes,
  });
  const staleRevisionSweep = await scanReviewPressureForDestination({
    companyId: input.companyId,
    destinationKey: "compare",
  });

  return {
    supported: true,
    approvedPublishes: approvedPublishes as Record<string, unknown>,
    staleRevisionSweep: staleRevisionSweep as Record<string, unknown>,
  };
}

async function executeTrainersMaintenance(
  input: DestinationMaintenanceAdapterInput,
): Promise<DestinationMaintenanceAdapterResult> {
  const approvedPublishes = await publishApprovedPacketsForDestination({
    companyId: input.companyId,
    destinationKey: "trainers",
    actorId: input.actorId,
    limit: input.limits.maxApprovedPublishes,
  });
  const staleRevisionSweep = await scanReviewPressureForDestination({
    companyId: input.companyId,
    destinationKey: "trainers",
  });

  return {
    supported: true,
    approvedPublishes: approvedPublishes as Record<string, unknown>,
    staleRevisionSweep: staleRevisionSweep as Record<string, unknown>,
  };
}

async function executeAthleteIQMaintenance(
  input: DestinationMaintenanceAdapterInput,
): Promise<DestinationMaintenanceAdapterResult> {
  const approvedPublishes = await publishApprovedPacketsForDestination({
    companyId: input.companyId,
    destinationKey: "athleteiq",
    actorId: input.actorId,
    limit: input.limits.maxApprovedPublishes,
  });
  const staleRevisionSweep = await scanReviewPressureForDestination({
    companyId: input.companyId,
    destinationKey: "athleteiq",
  });

  return {
    supported: true,
    approvedPublishes: approvedPublishes as Record<string, unknown>,
    staleRevisionSweep: staleRevisionSweep as Record<string, unknown>,
  };
}

const DESTINATION_MAINTENANCE_ADAPTERS: Record<
  DestinationKey,
  (input: DestinationMaintenanceAdapterInput) => Promise<DestinationMaintenanceAdapterResult>
> = {
  classscout: executeClassScoutMaintenance,
  compare: executeCompareMaintenance,
  trainers: executeTrainersMaintenance,
  athleteiq: executeAthleteIQMaintenance,
};

export async function executeDestinationMaintenanceAdapters(input: {
  companyId: string;
  actorId: string;
  byDestinationLimits: Record<DestinationKey, DestinationMaintenanceLimits>;
}) {
  const byDestination: Record<string, DestinationMaintenanceAdapterResult> = {};
  const destinationKeys = Object.keys(input.byDestinationLimits)
    .map((destinationKey) => normalizeDestinationKey(destinationKey))
    .filter((destinationKey): destinationKey is DestinationKey => Boolean(destinationKey));

  for (const destinationKey of destinationKeys) {
    const adapter = DESTINATION_MAINTENANCE_ADAPTERS[destinationKey];
    const defaults = readDestinationMaintenanceDefaults();
    const limits = input.byDestinationLimits[destinationKey] ?? defaults;
    byDestination[destinationKey] = await adapter({
      companyId: input.companyId,
      actorId: input.actorId,
      limits: {
        maxRevisionIntakes: clampLimit(limits.maxRevisionIntakes, defaults.maxRevisionIntakes, 1, 20),
        maxApprovedPublishes: clampLimit(limits.maxApprovedPublishes, defaults.maxApprovedPublishes, 1, 20),
      },
    });
  }

  const classScout = byDestination.classscout;
  return {
    byDestination,
    classscout: classScout,
    approvedPublishes: classScout?.approvedPublishes ?? null,
    staleRevisionSweep: classScout?.staleRevisionSweep ?? null,
  };
}
