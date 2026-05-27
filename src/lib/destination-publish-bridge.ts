import { prisma } from "@/lib/db";
import { recordDestinationOutcomeMemory } from "@/lib/destination-review-bridge";

function getClassScoutBridgeConfig() {
  const baseUrl = process.env.CLASSSCOUT_BASE_URL?.trim();
  const ingestKey = process.env.CLASSSCOUT_INGEST_API_KEY?.trim();
  if (!baseUrl || !ingestKey) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), ingestKey };
}

function inferEntityKind(packet: {
  draftPayload: Record<string, unknown>;
  metadata: unknown;
}) {
  const metadata =
    packet.metadata && typeof packet.metadata === "object" && !Array.isArray(packet.metadata)
      ? (packet.metadata as Record<string, unknown>)
      : null;
  if (metadata?.entityKind === "provider" || metadata?.entityKind === "meetupGroup") {
    return metadata.entityKind;
  }
  if (typeof packet.draftPayload.category === "string") return "provider";
  if (typeof packet.draftPayload.groupType === "string") return "meetupGroup";
  return null;
}

function inferAdapterVersion(packet: { metadata: unknown; bridgeVersion: string }) {
  const metadata =
    packet.metadata && typeof packet.metadata === "object" && !Array.isArray(packet.metadata)
      ? (packet.metadata as Record<string, unknown>)
      : null;
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
    return { ok: false, status: 404, error: "Review packet not found" };
  }

  if (packet.destinationInstance.destinationKey !== "classscout") {
    return { ok: false, status: 400, error: "Only ClassScout publish bridge is supported right now" };
  }

  if (packet.packetState !== "APPROVED") {
    return { ok: false, status: 409, error: `Packet must be APPROVED before publish, got ${packet.packetState}` };
  }

  const config = getClassScoutBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "ClassScout publish bridge is not configured" };
  }

  const entityKind = inferEntityKind({
    draftPayload: resolvePublishDraftPayload({
      draftPayload: packet.draftPayload as Record<string, unknown>,
      reviewDecisions: packet.reviewDecisions,
    }),
    metadata: packet.metadata,
  });
  if (!entityKind) {
    return { ok: false, status: 422, error: "Could not infer destination entity kind from review packet" };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const publishDraftPayload = resolvePublishDraftPayload({
    draftPayload: packet.draftPayload as Record<string, unknown>,
    reviewDecisions: packet.reviewDecisions,
  });
  const response = await fetchImpl(`${config.baseUrl}/api/content-intelligence/publish-reviewed`, {
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
      destinationKey: "classscout",
      workflowRunId: packet.workflowRunId,
      candidateId: packet.candidateId,
      draftId: packet.draftId,
      reviewPacketId: packet.id,
      bridgeVersion: packet.bridgeVersion,
      eventType: "publish_bridge_failed",
      reasonCode: typeof data.error === "string" ? data.error : `HTTP_${response.status}`,
      notes: `Checklist publish bridge failed for review packet ${packet.id}`,
      actorType: "SYSTEM",
      actorId: input.reviewedBy,
      payload: data,
    });
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}
