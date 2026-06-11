import miniappRegistryData from "./miniapp-registry-data.json";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";

export const CHECK_FOUNDATION_MINIAPP_REGISTRY_SCHEMA_VERSION = 1 as const;
export const MINIAPP_IDS = ["classscout", "compare", "trainers", "athleteiq"] as const;
export type MiniappId = (typeof MINIAPP_IDS)[number];

export type MiniappDefinition = {
  id: MiniappId;
  name: string;
  blockId: "miniapp";
  supportedContentTypes: string[];
  defaultLocale: "en" | "hu" | "it";
  availableLocales: ("en" | "hu" | "it")[];
  adapterKey: string;
  defaultOpsRoute: string;
  publicBaseUrlEnv: string;
  description: string;
};

export type MiniappContentCard = {
  cardId: string;
  unitId: string;
  miniappId: MiniappId;
  contentType: string;
  payload: Record<string, unknown>;
  evidenceRefs: string[];
  status: "draft" | "ready_for_review" | "approved" | "publishing" | "published" | "failed" | "archived";
  version: number;
};

export type MiniappPublishResult = {
  cardId: string;
  externalId?: string;
  status: "published" | "failed" | "retryable_failed";
  message?: string;
};

export type MiniappAdapterStatus = {
  miniappId: MiniappId;
  configured: boolean;
  ready: boolean;
  reason?: string;
};

export type MiniappAdapter = {
  key: string;
  miniappId: MiniappId;
  publishCard(input: {
    unitId: string;
    actorId: string;
    card: MiniappContentCard;
  }): Promise<MiniappPublishResult>;
  getStatus(input: { unitId: string }): Promise<MiniappAdapterStatus>;
};

type MiniappRegistryData = {
  schemaVersion: typeof CHECK_FOUNDATION_MINIAPP_REGISTRY_SCHEMA_VERSION;
  miniapps: MiniappDefinition[];
};

const typedMiniappRegistry = miniappRegistryData as MiniappRegistryData;
const knownMiniappIds = new Set<string>(MINIAPP_IDS);
const miniappDefinitionById = new Map<MiniappId, MiniappDefinition>(
  typedMiniappRegistry.miniapps.map((definition) => [definition.id, definition]),
);

function classScoutBridgeConfigured() {
  const baseUrl = process.env.CLASSSCOUT_BASE_URL?.trim();
  const ingestKey = process.env.CLASSSCOUT_INGEST_API_KEY?.trim();
  return Boolean(baseUrl && ingestKey);
}

function compareBridgeConfigured() {
  const baseUrl = process.env.COMPARE_BASE_URL?.trim();
  const ingestKey = process.env.COMPARE_INGEST_API_KEY?.trim();
  return Boolean(baseUrl && ingestKey);
}

function trainersBridgeConfigured() {
  const baseUrl = process.env.TRAINERS_BASE_URL?.trim();
  const ingestKey = process.env.TRAINERS_INGEST_API_KEY?.trim();
  return Boolean(baseUrl && ingestKey);
}

function athleteiqBridgeConfigured() {
  const baseUrl = process.env.ATHLETEIQ_BASE_URL?.trim();
  const ingestKey = process.env.ATHLETEIQ_INGEST_API_KEY?.trim();
  return Boolean(baseUrl && ingestKey);
}

const classScoutAdapter: MiniappAdapter = {
  key: "classscout",
  miniappId: "classscout",
  async getStatus() {
    const configured = classScoutBridgeConfigured();
    return {
      miniappId: "classscout",
      configured,
      ready: configured,
      reason: configured ? undefined : "ClassScout bridge credentials are missing.",
    };
  },
  async publishCard(input) {
    const reviewPacketId = String(input.card.payload.reviewPacketId || "").trim();
    if (!reviewPacketId) {
      return {
        cardId: input.card.cardId,
        status: "failed",
        message: "reviewPacketId is required for ClassScout publishing.",
      };
    }

    const result = await publishDestinationReviewPacket({
      companyId: input.unitId,
      reviewPacketId,
      reviewedBy: input.actorId,
    });

    if (!result.ok) {
      return {
        cardId: input.card.cardId,
        status: result.status >= 500 ? "retryable_failed" : "failed",
        message: typeof result.error === "string" ? result.error : `ClassScout publish failed with status ${result.status}`,
      };
    }

    return {
      cardId: input.card.cardId,
      status: "published",
      externalId: reviewPacketId,
      message: "Published through ClassScout review-publish bridge.",
    };
  },
};

const compareAdapter: MiniappAdapter = {
  key: "compare",
  miniappId: "compare",
  async getStatus() {
    const configured = compareBridgeConfigured();
    return {
      miniappId: "compare",
      configured,
      ready: configured,
      reason: configured ? undefined : "Compare bridge credentials are missing.",
    };
  },
  async publishCard(input) {
    const reviewPacketId = String(input.card.payload.reviewPacketId || "").trim();
    if (!reviewPacketId) {
      return {
        cardId: input.card.cardId,
        status: "failed",
        message: "reviewPacketId is required for Compare publishing.",
      };
    }

    const result = await publishDestinationReviewPacket({
      companyId: input.unitId,
      reviewPacketId,
      reviewedBy: input.actorId,
    });

    if (!result.ok) {
      return {
        cardId: input.card.cardId,
        status: result.status >= 500 ? "retryable_failed" : "failed",
        message: typeof result.error === "string" ? result.error : `Compare publish failed with status ${result.status}`,
      };
    }

    return {
      cardId: input.card.cardId,
      status: "published",
      externalId: reviewPacketId,
      message: "Published through Compare review-publish bridge.",
    };
  },
};

const trainersAdapter: MiniappAdapter = {
  key: "trainers",
  miniappId: "trainers",
  async getStatus() {
    const configured = trainersBridgeConfigured();
    return {
      miniappId: "trainers",
      configured,
      ready: configured,
      reason: configured ? undefined : "Trainers bridge credentials are missing.",
    };
  },
  async publishCard(input) {
    const reviewPacketId = String(input.card.payload.reviewPacketId || "").trim();
    if (!reviewPacketId) {
      return {
        cardId: input.card.cardId,
        status: "failed",
        message: "reviewPacketId is required for Trainers publishing.",
      };
    }

    const result = await publishDestinationReviewPacket({
      companyId: input.unitId,
      reviewPacketId,
      reviewedBy: input.actorId,
    });

    if (!result.ok) {
      return {
        cardId: input.card.cardId,
        status: result.status >= 500 ? "retryable_failed" : "failed",
        message: typeof result.error === "string" ? result.error : `Trainers publish failed with status ${result.status}`,
      };
    }

    return {
      cardId: input.card.cardId,
      status: "published",
      externalId: reviewPacketId,
      message: "Published through Trainers review-publish bridge.",
    };
  },
};

const athleteiqAdapter: MiniappAdapter = {
  key: "athleteiq",
  miniappId: "athleteiq",
  async getStatus() {
    const configured = athleteiqBridgeConfigured();
    return {
      miniappId: "athleteiq",
      configured,
      ready: configured,
      reason: configured ? undefined : "AthleteIQ bridge credentials are missing.",
    };
  },
  async publishCard(input) {
    const reviewPacketId = String(input.card.payload.reviewPacketId || "").trim();
    if (!reviewPacketId) {
      return {
        cardId: input.card.cardId,
        status: "failed",
        message: "reviewPacketId is required for AthleteIQ publishing.",
      };
    }

    const result = await publishDestinationReviewPacket({
      companyId: input.unitId,
      reviewPacketId,
      reviewedBy: input.actorId,
    });

    if (!result.ok) {
      return {
        cardId: input.card.cardId,
        status: result.status >= 500 ? "retryable_failed" : "failed",
        message: typeof result.error === "string" ? result.error : `AthleteIQ publish failed with status ${result.status}`,
      };
    }

    return {
      cardId: input.card.cardId,
      status: "published",
      externalId: reviewPacketId,
      message: "Published through AthleteIQ review-publish bridge.",
    };
  },
};

const miniappAdapterById: Record<MiniappId, MiniappAdapter> = {
  classscout: classScoutAdapter,
  compare: compareAdapter,
  trainers: trainersAdapter,
  athleteiq: athleteiqAdapter,
};

export function isMiniappId(value: string): value is MiniappId {
  return knownMiniappIds.has(value);
}

export function assertKnownMiniappId(value: string): asserts value is MiniappId {
  if (!isMiniappId(value)) {
    throw new Error(`Unknown Miniapp id: ${value}`);
  }
}

export function listMiniappDefinitions(): MiniappDefinition[] {
  return [...typedMiniappRegistry.miniapps];
}

export function getMiniappDefinition(miniappId: MiniappId): MiniappDefinition {
  const definition = miniappDefinitionById.get(miniappId);
  if (!definition) {
    throw new Error(`Missing Miniapp definition for id: ${miniappId}`);
  }
  return definition;
}

export function getMiniappAdapter(miniappId: MiniappId): MiniappAdapter {
  const adapter = miniappAdapterById[miniappId];
  if (!adapter) {
    throw new Error(`Missing Miniapp adapter for id: ${miniappId}`);
  }
  return adapter;
}

export async function publishMiniappCard(input: {
  unitId: string;
  actorId: string;
  card: MiniappContentCard;
}): Promise<MiniappPublishResult> {
  const adapter = getMiniappAdapter(input.card.miniappId);
  return adapter.publishCard(input);
}

export async function getMiniappStatus(input: {
  unitId: string;
  miniappId: MiniappId;
}): Promise<MiniappAdapterStatus> {
  const adapter = getMiniappAdapter(input.miniappId);
  return adapter.getStatus({ unitId: input.unitId });
}

export function assertMiniappRegistryIntegrity(): void {
  if (typedMiniappRegistry.schemaVersion !== CHECK_FOUNDATION_MINIAPP_REGISTRY_SCHEMA_VERSION) {
    throw new Error(`Unsupported miniapp registry schema version: ${typedMiniappRegistry.schemaVersion}`);
  }

  const seen = new Set<string>();
  for (const definition of typedMiniappRegistry.miniapps) {
    if (seen.has(definition.id)) {
      throw new Error(`Duplicate miniapp definition: ${definition.id}`);
    }
    seen.add(definition.id);

    if (!isMiniappId(definition.id)) {
      throw new Error(`Unknown miniapp id in registry: ${definition.id}`);
    }
    if (definition.blockId !== "miniapp") {
      throw new Error(`Miniapp ${definition.id} must map to blockId=miniapp`);
    }
    if (!definition.name.trim()) {
      throw new Error(`Miniapp ${definition.id} is missing name`);
    }
    if (!Array.isArray(definition.supportedContentTypes) || definition.supportedContentTypes.length === 0) {
      throw new Error(`Miniapp ${definition.id} is missing supportedContentTypes`);
    }
    if (!definition.adapterKey.trim()) {
      throw new Error(`Miniapp ${definition.id} is missing adapterKey`);
    }
    if (!definition.defaultOpsRoute.trim()) {
      throw new Error(`Miniapp ${definition.id} is missing defaultOpsRoute`);
    }
  }
}
