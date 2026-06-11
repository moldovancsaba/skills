import { prisma } from "@/lib/db";

type TrainersListingType = "provider" | "meetupGroup";

export type TrainersNormalizedListingInput = {
  title: string;
  listingKindHint?: "provider" | "meetupGroup";
  categoryHint?: string;
  boroughRaw?: string;
  neighborhoodRaw?: string;
  addressRaw?: string;
  ageRangesRaw?: string[];
  activityTypesRaw?: string[];
  descriptionFacts?: string[];
  scheduleBlocks?: Array<{
    daysOfWeek: string[];
    startTime?: string;
    timeText?: string;
  }>;
  contactFacts?: {
    website?: string;
    email?: string;
    phone?: string;
  };
  imageCandidates?: Array<{
    sourceUrl?: string;
    uploadedUrl?: string;
  }>;
};

export type TrainersDiscoveryArtifact = {
  artifactId: string;
  targetId: string;
  searchQuery: string;
  sourceUrl: string;
  sourceHost: string;
  title: string;
  snippet: string;
  authorityGrade: "official" | "authoritative" | "weak" | "reject";
  listingKindHint: "provider" | "meetupGroup";
  categoryHint: string;
  boroughGuess: string;
  neighborhoodGuess: string;
  activityTypesRaw: string[];
  ageRangesRaw: string[];
  ogImageUrl?: string;
  rawText: string;
  officialnessScore: number;
  kidsRelevanceScore: number;
  prefilterReasons: string[];
  scarcityTargets: string[];
  rationale: string[];
  scoreResult: Record<string, unknown>;
};

export type TrainersLiveListingSummary = {
  id: string;
  type: TrainersListingType;
  title: string;
  borough: string;
  neighborhood: string;
  categoryOrGroupType: string;
  imageUrl: string | null;
  websiteUrl: string | null;
  updatedAt: string | null;
  revisionStatus: {
    packetId: string | null;
    packetState: string | null;
    latestOutcomeEvent: string | null;
    latestDecision: string | null;
    lastSubmittedAt: string | null;
  };
};

function getTrainersBridgeConfig() {
  const baseUrl = process.env.TRAINERS_BASE_URL?.trim();
  const ingestKey = process.env.TRAINERS_INGEST_API_KEY?.trim();
  if (!baseUrl || !ingestKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), ingestKey };
}

export function isTrainersBridgeConfigured() {
  return Boolean(getTrainersBridgeConfig());
}

export async function scoreTrainersCandidate(input: {
  normalizedListing: TrainersNormalizedListingInput;
}) {
  const config = getTrainersBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Trainers bridge is not configured" };
  }

  const response = await fetch(`${config.baseUrl}/api/content-intelligence/score-candidate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      normalizedListing: input.normalizedListing,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

export async function discoverTrainersCandidates(input: {
  maxTargets?: number;
  maxCandidates?: number;
}) {
  const config = getTrainersBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Trainers bridge is not configured" };
  }

  const response = await fetch(`${config.baseUrl}/api/content-intelligence/discover-candidates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      maxTargets: input.maxTargets,
      maxCandidates: input.maxCandidates,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

export async function extractTrainersCandidate(input: {
  discoveryArtifact: TrainersDiscoveryArtifact;
}) {
  const config = getTrainersBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Trainers bridge is not configured" };
  }

  const response = await fetch(`${config.baseUrl}/api/content-intelligence/extract-candidate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      discoveryArtifact: input.discoveryArtifact,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

export async function prepareTrainersCandidateReview(input: {
  normalizedListing: TrainersNormalizedListingInput;
  draftId: string;
  evidenceSummary?: Record<string, unknown>;
  workflowMetadata: Record<string, unknown>;
  mediaRequest?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const config = getTrainersBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Trainers bridge is not configured" };
  }

  const response = await fetch(`${config.baseUrl}/api/content-intelligence/prepare-review`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      normalizedListing: input.normalizedListing,
      draftId: input.draftId,
      evidenceSummary: input.evidenceSummary ?? {},
      workflowMetadata: input.workflowMetadata,
      mediaRequest: input.mediaRequest ?? null,
      metadata: input.metadata ?? null,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function mapRevisionStatus(packet: {
  id: string;
  packetState: string;
  submittedAt: Date;
  reviewDecisions: Array<{ decision: string }>;
  outcomeMemories: Array<{ eventType: string }>;
}) {
  return {
    packetId: packet.id,
    packetState: packet.packetState,
    latestOutcomeEvent: packet.outcomeMemories[0]?.eventType ?? null,
    latestDecision: packet.reviewDecisions[0]?.decision ?? null,
    lastSubmittedAt: packet.submittedAt.toISOString(),
  };
}

export async function listTrainersLiveListings(input: {
  companyId: string;
  listingType?: "provider" | "meetupGroup" | "all";
  borough?: string;
  query?: string;
}) {
  const config = getTrainersBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Trainers bridge is not configured" };
  }

  const [providersResponse, meetupsResponse, packets] = await Promise.all([
    fetch(`${config.baseUrl}/api/public/providers`, { cache: "no-store" }),
    fetch(`${config.baseUrl}/api/public/meetup-groups`, { cache: "no-store" }),
    prisma.destinationReviewPacket.findMany({
      where: {
        companyId: input.companyId,
        destinationInstance: {
          destinationKey: "trainers",
        },
      },
      orderBy: { submittedAt: "desc" },
      include: {
        reviewDecisions: {
          orderBy: { reviewedAt: "desc" },
          take: 1,
        },
        outcomeMemories: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  const providers = providersResponse.ok ? ((await providersResponse.json()) as Array<Record<string, unknown>>) : [];
  const meetups = meetupsResponse.ok ? ((await meetupsResponse.json()) as Array<Record<string, unknown>>) : [];

  const latestStatusByListing = new Map<string, ReturnType<typeof mapRevisionStatus>>();
  for (const packet of packets) {
    const metadata = asRecord(packet.metadata);
    const liveListing = asRecord(metadata?.liveListing);
    const listingId = typeof liveListing?.id === "string" ? liveListing.id : null;
    const listingType = liveListing?.type === "provider" || liveListing?.type === "meetupGroup" ? liveListing.type : null;
    if (!listingId || !listingType) continue;
    const key = `${listingType}:${listingId}`;
    if (!latestStatusByListing.has(key)) {
      latestStatusByListing.set(key, mapRevisionStatus(packet));
    }
  }

  const normalizedQuery = (input.query ?? "").trim().toLowerCase();
  const normalizedBorough = (input.borough ?? "").trim().toLowerCase();
  const includeProviders = !input.listingType || input.listingType === "all" || input.listingType === "provider";
  const includeMeetups = !input.listingType || input.listingType === "all" || input.listingType === "meetupGroup";

  const items: TrainersLiveListingSummary[] = [];

  if (includeProviders) {
    for (const provider of providers) {
      const id = typeof provider.id === "string" ? provider.id : null;
      const title = typeof provider.name === "string" ? provider.name : null;
      const borough = typeof provider.borough === "string" ? provider.borough : "";
      const neighborhood = typeof provider.neighborhood === "string" ? provider.neighborhood : "";
      if (!id || !title) continue;
      if (normalizedBorough && borough.toLowerCase() !== normalizedBorough) continue;
      if (
        normalizedQuery &&
        !`${title} ${borough} ${neighborhood} ${String(provider.category ?? "")}`.toLowerCase().includes(normalizedQuery)
      ) {
        continue;
      }

      items.push({
        id,
        type: "provider",
        title,
        borough,
        neighborhood,
        categoryOrGroupType: typeof provider.category === "string" ? provider.category : "Provider",
        imageUrl: typeof provider.image === "string" ? provider.image : null,
        websiteUrl: typeof provider.website === "string" ? provider.website : null,
        updatedAt: typeof provider.updatedAt === "string" ? provider.updatedAt : null,
        revisionStatus:
          latestStatusByListing.get(`provider:${id}`) ?? {
            packetId: null,
            packetState: null,
            latestOutcomeEvent: null,
            latestDecision: null,
            lastSubmittedAt: null,
          },
      });
    }
  }

  if (includeMeetups) {
    for (const meetup of meetups) {
      const id = typeof meetup.id === "string" ? meetup.id : null;
      const title = typeof meetup.name === "string" ? meetup.name : null;
      const borough = typeof meetup.borough === "string" ? meetup.borough : "";
      const neighborhood = typeof meetup.neighborhood === "string" ? meetup.neighborhood : "";
      if (!id || !title) continue;
      if (normalizedBorough && borough.toLowerCase() !== normalizedBorough) continue;
      if (
        normalizedQuery &&
        !`${title} ${borough} ${neighborhood} ${String(meetup.groupType ?? "")}`.toLowerCase().includes(normalizedQuery)
      ) {
        continue;
      }

      items.push({
        id,
        type: "meetupGroup",
        title,
        borough,
        neighborhood,
        categoryOrGroupType: typeof meetup.groupType === "string" ? meetup.groupType : "Meetup Group",
        imageUrl: typeof meetup.coverImageUrl === "string" ? meetup.coverImageUrl : null,
        websiteUrl: typeof meetup.website === "string" ? meetup.website : null,
        updatedAt: null,
        revisionStatus:
          latestStatusByListing.get(`meetupGroup:${id}`) ?? {
            packetId: null,
            packetState: null,
            latestOutcomeEvent: null,
            latestDecision: null,
            lastSubmittedAt: null,
          },
      });
    }
  }

  items.sort((left, right) => {
    const leftTouched = left.revisionStatus.lastSubmittedAt ?? left.updatedAt ?? "";
    const rightTouched = right.revisionStatus.lastSubmittedAt ?? right.updatedAt ?? "";
    return rightTouched.localeCompare(leftTouched) || left.title.localeCompare(right.title);
  });

  return { ok: true, items };
}

export async function createTrainersLiveRevision(input: {
  companyId: string;
  listingId: string;
  listingType: TrainersListingType;
}) {
  const config = getTrainersBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Trainers bridge is not configured" };
  }

  const response = await fetch(`${config.baseUrl}/api/content-intelligence/live-listings/revision`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      checklistCompanyId: input.companyId,
      listingId: input.listingId,
      listingType: input.listingType,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}
