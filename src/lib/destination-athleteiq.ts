import { prisma } from "@/lib/db";

export type AthleteIQListingKind = "academy" | "club" | "coachingService" | "performanceCentre";

export type AthleteIQNormalizedListingInput = {
  name: string;
  listingKindHint?: AthleteIQListingKind;
  sportFocus?: string[];
  ageGroupsFocus?: string[];
  locationRaw?: string;
  cityRaw?: string;
  countryRaw?: string;
  descriptionFacts?: string[];
  websiteUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  imageCandidates?: Array<{
    sourceUrl?: string;
    uploadedUrl?: string;
  }>;
  certifications?: string[];
  coachProfiles?: Array<{
    name?: string;
    role?: string;
    licenceLevel?: string;
  }>;
};

export type AthleteIQDiscoveryArtifact = {
  artifactId: string;
  targetId: string;
  searchQuery: string;
  sourceUrl: string;
  sourceHost: string;
  title: string;
  snippet: string;
  authorityGrade: "official" | "authoritative" | "weak" | "reject";
  listingKindHint: AthleteIQListingKind;
  categoryHint: string;
  sportFocus: string[];
  ageGroupsFocus: string[];
  rawText: string;
  officialnessScore: number;
  kidsRelevanceScore: number;
  prefilterReasons: string[];
  scarcityTargets: string[];
  rationale: string[];
  scoreResult: Record<string, unknown>;
};

export type AthleteIQLiveListingSummary = {
  id: string;
  type: AthleteIQListingKind;
  name: string;
  sportFocus: string[];
  location: string;
  city: string;
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

function getAthleteIQBridgeConfig() {
  const baseUrl = process.env.ATHLETEIQ_BASE_URL?.trim();
  const ingestKey = process.env.ATHLETEIQ_INGEST_API_KEY?.trim();
  if (!baseUrl || !ingestKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), ingestKey };
}

export function isAthleteIQBridgeConfigured() {
  return Boolean(getAthleteIQBridgeConfig());
}

export async function discoverAthleteIQCandidates(input: {
  maxTargets?: number;
  maxCandidates?: number;
}) {
  const config = getAthleteIQBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "AthleteIQ bridge is not configured" };
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

export async function extractAthleteIQCandidate(input: {
  discoveryArtifact: AthleteIQDiscoveryArtifact;
}) {
  const config = getAthleteIQBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "AthleteIQ bridge is not configured" };
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

export async function scoreAthleteIQCandidate(input: {
  normalizedListing: AthleteIQNormalizedListingInput;
}) {
  const config = getAthleteIQBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "AthleteIQ bridge is not configured" };
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

export async function prepareAthleteIQCandidateReview(input: {
  normalizedListing: AthleteIQNormalizedListingInput;
  draftId: string;
  evidenceSummary?: Record<string, unknown>;
  workflowMetadata: Record<string, unknown>;
  mediaRequest?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const config = getAthleteIQBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "AthleteIQ bridge is not configured" };
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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function listAthleteIQLiveListings(input: {
  companyId: string;
  listingType?: AthleteIQListingKind | "all";
  query?: string;
}) {
  const config = getAthleteIQBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "AthleteIQ bridge is not configured" };
  }

  const [profilesResponse, packets] = await Promise.all([
    fetch(`${config.baseUrl}/api/content-intelligence/live-listings`, { cache: "no-store" }),
    prisma.destinationReviewPacket.findMany({
      where: {
        companyId: input.companyId,
        destinationInstance: {
          destinationKey: "athleteiq",
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

  const profiles = profilesResponse.ok
    ? ((await profilesResponse.json()) as Array<Record<string, unknown>>)
    : [];

  const latestStatusByListing = new Map<string, ReturnType<typeof mapRevisionStatus>>();
  for (const packet of packets) {
    const metadata = asRecord(packet.metadata);
    const liveListing = asRecord(metadata?.liveListing);
    const listingId = typeof liveListing?.id === "string" ? liveListing.id : null;
    const listingType = typeof liveListing?.type === "string" ? liveListing.type : null;
    if (!listingId || !listingType) continue;
    const key = `${listingType}:${listingId}`;
    if (!latestStatusByListing.has(key)) {
      latestStatusByListing.set(key, mapRevisionStatus(packet));
    }
  }

  const normalizedQuery = (input.query ?? "").trim().toLowerCase();
  const items: AthleteIQLiveListingSummary[] = [];

  for (const profile of profiles) {
    const id = typeof profile.id === "string" ? profile.id : null;
    const name = typeof profile.name === "string" ? profile.name : null;
    const type = (typeof profile.type === "string" ? profile.type : "academy") as AthleteIQListingKind;
    if (!id || !name) continue;
    if (input.listingType && input.listingType !== "all" && type !== input.listingType) continue;
    if (
      normalizedQuery &&
      !`${name} ${String(profile.city ?? "")} ${String(profile.location ?? "")}`.toLowerCase().includes(normalizedQuery)
    ) {
      continue;
    }

    items.push({
      id,
      type,
      name,
      sportFocus: Array.isArray(profile.sportFocus) ? (profile.sportFocus as string[]) : [],
      location: typeof profile.location === "string" ? profile.location : "",
      city: typeof profile.city === "string" ? profile.city : "",
      imageUrl: typeof profile.imageUrl === "string" ? profile.imageUrl : null,
      websiteUrl: typeof profile.websiteUrl === "string" ? profile.websiteUrl : null,
      updatedAt: typeof profile.updatedAt === "string" ? profile.updatedAt : null,
      revisionStatus:
        latestStatusByListing.get(`${type}:${id}`) ?? {
          packetId: null,
          packetState: null,
          latestOutcomeEvent: null,
          latestDecision: null,
          lastSubmittedAt: null,
        },
    });
  }

  items.sort((left, right) => {
    const leftTouched = left.revisionStatus.lastSubmittedAt ?? left.updatedAt ?? "";
    const rightTouched = right.revisionStatus.lastSubmittedAt ?? right.updatedAt ?? "";
    return rightTouched.localeCompare(leftTouched) || left.name.localeCompare(right.name);
  });

  return { ok: true, items };
}
