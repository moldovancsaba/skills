import { prisma } from "@/lib/db";
import { recordDestinationOutcomeMemory } from "@/lib/destination-review-bridge";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

type DestinationBridgeDefinition = {
  label: string;
  baseUrlEnv: string;
  ingestKeyEnv: string;
  publishPath: string;
};

const DESTINATION_BRIDGE_DEFINITIONS: Record<DestinationKey, DestinationBridgeDefinition> = {
  classscout: {
    label: "ClassScout",
    baseUrlEnv: "CLASSSCOUT_BASE_URL",
    ingestKeyEnv: "CLASSSCOUT_INGEST_API_KEY",
    publishPath: "/api/content-intelligence/publish-reviewed",
  },
  compare: {
    label: "Compare",
    baseUrlEnv: "COMPARE_BASE_URL",
    ingestKeyEnv: "COMPARE_INGEST_API_KEY",
    publishPath: "/api/content-intelligence/publish-reviewed",
  },
  trainers: {
    label: "Trainers",
    baseUrlEnv: "TRAINERS_BASE_URL",
    ingestKeyEnv: "TRAINERS_INGEST_API_KEY",
    publishPath: "/api/content-intelligence/publish-reviewed",
  },
  athleteiq: {
    label: "AthleteIQ",
    baseUrlEnv: "ATHLETEIQ_BASE_URL",
    ingestKeyEnv: "ATHLETEIQ_INGEST_API_KEY",
    publishPath: "/api/content-intelligence/publish-reviewed",
  },
};

function asMetadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  return metadata as Record<string, unknown>;
}

function getDestinationBridgeConfig(destinationKey: DestinationKey) {
  const definition = DESTINATION_BRIDGE_DEFINITIONS[destinationKey];
  const env = process.env as Record<string, string | undefined>;
  const baseUrl = env[definition.baseUrlEnv]?.trim();
  const ingestKey = env[definition.ingestKeyEnv]?.trim();
  if (!baseUrl || !ingestKey) {
    return null;
  }
  return {
    ...definition,
    baseUrl: baseUrl.replace(/\/$/, ""),
    ingestKey,
  };
}

function inferEntityKind(packet: {
  destinationKey: DestinationKey;
  draftPayload: Record<string, unknown>;
  metadata: unknown;
}) {
  const metadata = asMetadataRecord(packet.metadata);
  const metadataEntityKind =
    typeof metadata?.entityKind === "string" && metadata.entityKind.trim()
      ? metadata.entityKind.trim()
      : null;

  if (packet.destinationKey === "classscout") {
    if (metadataEntityKind === "provider" || metadataEntityKind === "meetupGroup") {
      return metadataEntityKind;
    }
    if (typeof packet.draftPayload.category === "string") return "provider";
    if (typeof packet.draftPayload.groupType === "string") return "meetupGroup";
    return null;
  }

  if (metadataEntityKind) {
    return metadataEntityKind;
  }
  if (typeof packet.draftPayload.entityKind === "string" && packet.draftPayload.entityKind.trim()) {
    return packet.draftPayload.entityKind.trim();
  }
  if (typeof packet.draftPayload.type === "string" && packet.draftPayload.type.trim()) {
    return packet.draftPayload.type.trim();
  }
  if (typeof packet.draftPayload.category === "string" && packet.draftPayload.category.trim()) {
    return "activity";
  }
  return "activity";
}

function inferAdapterVersion(packet: { metadata: unknown; bridgeVersion: string }) {
  const metadata = asMetadataRecord(packet.metadata);
  return typeof metadata?.adapterVersion === "string" ? metadata.adapterVersion : packet.bridgeVersion;
}

function resolvePublishDraftPayload(packet: {
  draftPayload: Record<string, unknown>;
  reviewDecisions: Array<{ correctedDraftPayload: unknown }>;
}) {
  const latestCorrection = packet.reviewDecisions.find((decision) => {
    return decision.correctedDraftPayload && typeof decision.correctedDraftPayload === "object" && !Array.isArray(decision.correctedDraftPayload);
  });
  if (latestCorrection?.correctedDraftPayload && typeof latestCorrection.correctedDraftPayload === "object" && !Array.isArray(latestCorrection.correctedDraftPayload)) {
    return latestCorrection.correctedDraftPayload as Record<string, unknown>;
  }
  return packet.draftPayload;
}

export async function publishDestinationReviewPacket(input: {
  companyId: string;
  reviewPacketId: string;
  reviewedBy: string;
  fetchImpl?: typeof fetch;
}) {
  const packet = await prisma.destinationReviewPacket.findFirst({
    where: {
      id: input.reviewPacketId,
      companyId: input.companyId,
    },
    include: {
      destinationInstance: true,
      reviewDecisions: {
        orderBy: { reviewedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!packet) {
    return { ok: false, status: 404, error: "Review card not found" };
  }

  const rawDestinationKey = String(packet.destinationInstance.destinationKey || "").trim();
  const destinationKey = normalizeDestinationKey(rawDestinationKey);
  if (!destinationKey) {
    return { ok: false, status: 400, error: `Destination key "${rawDestinationKey || "unknown"}" is not supported by publish bridge` };
  }

  if (packet.packetState !== "APPROVED") {
    return { ok: false, status: 409, error: `Review card must be APPROVED before publish, got ${packet.packetState}` };
  }

  const config = getDestinationBridgeConfig(destinationKey);
  if (!config) {
    return { ok: false, status: 503, error: `${DESTINATION_BRIDGE_DEFINITIONS[destinationKey].label} publish bridge is not configured` };
  }

  const publishDraftPayload = resolvePublishDraftPayload({
    draftPayload: packet.draftPayload as Record<string, unknown>,
    reviewDecisions: packet.reviewDecisions,
  });
  const entityKind = inferEntityKind({
    destinationKey,
    draftPayload: publishDraftPayload,
    metadata: packet.metadata,
  });
  if (!entityKind) {
    return { ok: false, status: 422, error: `Could not infer ${config.label} entity kind from review card` };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${config.baseUrl}${config.publishPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      draftId: packet.draftId,
      entityKind,
      draftPayload: publishDraftPayload,
      adapterVersion: inferAdapterVersion(packet),
      workflowMetadata: {
        companyId: input.companyId,
        checklistCompanyId: input.companyId,
        destinationKey,
        workflowRunId: packet.workflowRunId,
        candidateId: packet.candidateId,
        reviewPacketId: packet.id,
        bridgeVersion: packet.bridgeVersion,
      },
      idempotencyKey: `review-packet:${packet.id}`,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    await recordDestinationOutcomeMemory({
      companyId: input.companyId,
      destinationKey,
      workflowRunId: packet.workflowRunId,
      candidateId: packet.candidateId,
      draftId: packet.draftId,
      reviewPacketId: packet.id,
      bridgeVersion: packet.bridgeVersion,
      eventType: "publish_bridge_failed",
      reasonCode: typeof data.error === "string" ? data.error : `HTTP_${response.status}`,
      notes: `${config.label} publish bridge failed for review card ${packet.id}`,
      actorType: "SYSTEM",
      actorId: input.reviewedBy,
      payload: data,
    });
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    publicUrl: typeof data.publicUrl === "string" ? data.publicUrl : null,
  };
}
