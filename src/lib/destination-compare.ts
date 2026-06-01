function getCompareBridgeConfig() {
  const baseUrl = process.env.COMPARE_BASE_URL?.trim();
  const ingestKey = process.env.COMPARE_INGEST_API_KEY?.trim();
  if (!baseUrl || !ingestKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), ingestKey };
}

export function isCompareBridgeConfigured() {
  return Boolean(getCompareBridgeConfig());
}

export async function patchCompareSite(input: {
  patch: Record<string, unknown>;
}) {
  const config = getCompareBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Compare bridge is not configured" };
  }

  const response = await fetch(`${config.baseUrl}/api/ingest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ingestKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resource: "site",
      action: "patch",
      patch: input.patch,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

export async function scoreCompareCandidate(input: {
  normalizedListing: Record<string, unknown>;
}) {
  const config = getCompareBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Compare bridge is not configured" };
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

export async function discoverCompareCandidates(input: {
  maxTargets?: number;
  maxCandidates?: number;
}) {
  const config = getCompareBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Compare bridge is not configured" };
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

export async function extractCompareCandidate(input: {
  discoveryArtifact: Record<string, unknown>;
}) {
  const config = getCompareBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Compare bridge is not configured" };
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

export async function prepareCompareCandidateReview(input: {
  normalizedListing: Record<string, unknown>;
  draftId: string;
  evidenceSummary?: Record<string, unknown>;
  workflowMetadata: Record<string, unknown>;
  mediaRequest?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const config = getCompareBridgeConfig();
  if (!config) {
    return { ok: false, status: 503, error: "Compare bridge is not configured" };
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
