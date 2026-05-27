'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Code, Group, Loader, SimpleGrid, Stack, Textarea } from "@mantine/core";
import { IconPlayerPause, IconPlayerPlay, IconRefresh, IconRosetteDiscountCheck, IconSend } from "@tabler/icons-react";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";

type MissionAttempt = {
  id: string;
  ordinal: number;
  state: string;
  rejectionCode: string | null;
  completedAt: string | null;
};

type MissionRun = {
  id: string;
  state: string;
  attemptCount: number;
  failureCode: string | null;
  updatedAt: string;
  policySnapshot?: {
    version: string;
  } | null;
  attempts?: MissionAttempt[];
};

type ScoreResponse = {
  ok: boolean;
  eligible?: boolean;
  candidateFingerprint?: string;
  scoreResult?: Record<string, unknown>;
  run?: MissionRun | null;
  error?: string;
};

type PrepareResponse = {
  ok: boolean;
  prepared?: boolean;
  candidateId?: string;
  draftId?: string;
  result?: Record<string, unknown>;
  run?: MissionRun | null;
  error?: string;
};

type DiscoveryArtifact = {
  artifactId: string;
  title: string;
  sourceUrl: string;
  authorityGrade: string;
  categoryHint: string;
  boroughGuess: string;
  neighborhoodGuess: string;
  prefilterReasons: string[];
  scoreResult: { score?: number; blockingReasons?: string[] } | Record<string, unknown>;
};

type PersistedDiscoveryCandidate = {
  artifact: DiscoveryArtifact;
  candidate: {
    id: string;
  };
  sourceDocument: {
    id: string;
  };
};

type DiscoverResponse = {
  ok: boolean;
  persisted?: PersistedDiscoveryCandidate[];
  error?: string;
};

type ExtractResponse = {
  ok: boolean;
  result?: {
    result?: {
      normalizedListing?: Record<string, unknown>;
      evidenceMap?: Record<string, unknown>;
      mediaRequest?: Record<string, unknown> | null;
      extractorVersion?: string;
    };
  } | Record<string, unknown>;
  factSnapshot?: { id: string };
  error?: string;
};

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

const DEFAULT_NORMALIZED_LISTING = pretty({
  title: "",
  categoryHint: "Classes",
  listingKindHint: "provider",
  boroughRaw: "",
  neighborhoodRaw: "",
  addressRaw: "",
  ageRangesRaw: [],
  activityTypesRaw: [],
  descriptionFacts: [],
  scheduleBlocks: [],
  contactFacts: { website: "" },
  imageCandidates: [],
});

export function DestinationRulebookRunner({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<MissionRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [normalizedListingJson, setNormalizedListingJson] = useState(DEFAULT_NORMALIZED_LISTING);
  const [evidenceSummaryJson, setEvidenceSummaryJson] = useState(pretty({ sourceUrls: [] }));
  const [mediaRequestJson, setMediaRequestJson] = useState(pretty({ imageUrl: "", sourcePageUrl: "" }));
  const [scoreResponse, setScoreResponse] = useState<ScoreResponse | null>(null);
  const [prepareResponse, setPrepareResponse] = useState<PrepareResponse | null>(null);
  const [discoverResponse, setDiscoverResponse] = useState<DiscoverResponse | null>(null);
  const [extractResponse, setExtractResponse] = useState<ExtractResponse | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null,
    [runs, selectedRunId],
  );
  const discoveredCandidates = useMemo(() => discoverResponse?.persisted ?? [], [discoverResponse]);
  const selectedDiscoveredCandidate = useMemo(
    () => discoveredCandidates.find((item) => item.candidate.id === selectedCandidateId) ?? discoveredCandidates[0] ?? null,
    [discoveredCandidates, selectedCandidateId],
  );

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companyId,
        destinationKey: "classscout",
        missionKind: "rulebook_new_listing",
      });
      const response = await fetch(`/api/destination-missions/runs?${params.toString()}`);
      const payload = response.ok ? await response.json() : null;
      const nextRuns = Array.isArray(payload?.runs) ? (payload.runs as MissionRun[]) : [];
      setRuns(nextRuns);
      setSelectedRunId((current) => current ?? nextRuns[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns]);

  const startMission = useCallback(async () => {
    setStarting(true);
    try {
      const response = await fetch("/api/destination-missions/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey: "classscout",
          missionKind: "rulebook_new_listing",
          metadata: { startedFrom: "destination-rulebook-runner" },
        }),
      });
      const payload = response.ok ? await response.json() : null;
      const newRun = payload?.run as MissionRun | undefined;
      await loadRuns();
      if (newRun?.id) {
        setSelectedRunId(newRun.id);
      }
    } finally {
      setStarting(false);
    }
  }, [companyId, loadRuns]);

  const toggleMission = useCallback(async () => {
    if (!selectedRun) return;
    setToggling(true);
    try {
      const route = selectedRun.state === "PAUSED" ? "resume" : "pause";
      await fetch(`/api/destination-missions/runs/${selectedRun.id}/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      await loadRuns();
    } finally {
      setToggling(false);
    }
  }, [companyId, loadRuns, selectedRun]);

  const parseEditors = useCallback(() => {
    const normalizedListing = JSON.parse(normalizedListingJson) as Record<string, unknown>;
    const evidenceSummary = JSON.parse(evidenceSummaryJson) as Record<string, unknown>;
    const mediaRequest = JSON.parse(mediaRequestJson) as Record<string, unknown>;
    return { normalizedListing, evidenceSummary, mediaRequest };
  }, [evidenceSummaryJson, mediaRequestJson, normalizedListingJson]);

  const discoverCandidates = useCallback(async () => {
    if (!selectedRun) return;
    setDiscovering(true);
    try {
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}/discover-candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          maxTargets: 4,
          maxCandidates: 6,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as DiscoverResponse;
      setDiscoverResponse(payload);
      const firstCandidateId = payload.persisted?.[0]?.candidate.id ?? null;
      setSelectedCandidateId(firstCandidateId);
      await loadRuns();
    } finally {
      setDiscovering(false);
    }
  }, [companyId, loadRuns, selectedRun]);

  const extractCandidate = useCallback(async () => {
    if (!selectedRun || !selectedDiscoveredCandidate) return;
    setExtracting(true);
    try {
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}/extract-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          candidateId: selectedDiscoveredCandidate.candidate.id,
          discoveryArtifact: selectedDiscoveredCandidate.artifact,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as ExtractResponse;
      setExtractResponse(payload);
      const result = (payload.result as { result?: { normalizedListing?: Record<string, unknown>; evidenceMap?: Record<string, unknown>; mediaRequest?: Record<string, unknown> | null } } | undefined)?.result;
      if (result?.normalizedListing) {
        setNormalizedListingJson(pretty(result.normalizedListing));
      }
      if (result?.evidenceMap) {
        setEvidenceSummaryJson(
          pretty({
            sourceUrl: selectedDiscoveredCandidate.artifact.sourceUrl,
            evidenceMap: result.evidenceMap,
            scarcityTargets: selectedDiscoveredCandidate.artifact.prefilterReasons,
          }),
        );
      }
      if (result?.mediaRequest) {
        setMediaRequestJson(pretty(result.mediaRequest));
      }
      await loadRuns();
    } finally {
      setExtracting(false);
    }
  }, [companyId, loadRuns, selectedDiscoveredCandidate, selectedRun]);

  const scoreCandidate = useCallback(async () => {
    if (!selectedRun) return;
    setScoring(true);
    try {
      const { normalizedListing } = parseEditors();
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}/score-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          normalizedListing,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as ScoreResponse;
      setScoreResponse(payload);
      await loadRuns();
    } finally {
      setScoring(false);
    }
  }, [companyId, loadRuns, parseEditors, selectedRun]);

  const prepareCandidate = useCallback(async () => {
    if (!selectedRun) return;
    setPreparing(true);
    try {
      const { normalizedListing, evidenceSummary, mediaRequest } = parseEditors();
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}/prepare-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          candidateId: selectedCandidateId,
          normalizedListing,
          evidenceSummary,
          mediaRequest,
          metadata: { preparedFrom: "destination-rulebook-runner" },
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as PrepareResponse;
      setPrepareResponse(payload);
      await loadRuns();
    } finally {
      setPreparing(false);
    }
  }, [companyId, loadRuns, parseEditors, selectedCandidateId, selectedRun]);

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader />
      </Stack>
    );
  }

  return (
    <UnifiedCard tone="review">
      <UnifiedCardHeader
        title="Rulebook Runner"
        supporting={
          <Group gap="xs">
            <Badge variant="light" color="review">
              {runs.length} mission{runs.length === 1 ? "" : "s"}
            </Badge>
            <Button variant="subtle" color="review" leftSection={<IconRefresh size={14} />} onClick={() => void loadRuns()}>
              Refresh
            </Button>
          </Group>
        }
      />
      <UnifiedCardBody>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <SectionTitle>Run a new-listing mission from this unit</SectionTitle>
              <BodyText>
                Score a candidate against the ClassScout scarcity rulebook, then prepare it directly into the review queue.
              </BodyText>
            </Stack>
            <Group gap="sm">
              <Button leftSection={<IconPlayerPlay size={16} />} color="review" loading={starting} onClick={() => void startMission()}>
                Start mission
              </Button>
              <Button
                variant="light"
                color="strategy"
                leftSection={selectedRun?.state === "PAUSED" ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
                disabled={!selectedRun}
                loading={toggling}
                onClick={() => void toggleMission()}
              >
                {selectedRun?.state === "PAUSED" ? "Resume" : "Pause"}
              </Button>
            </Group>
          </Group>

          <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="md">
            <UnifiedCardSection tone="review">
              <Stack gap="xs">
                <MetaText>Selected Mission</MetaText>
                {selectedRun ? (
                  <>
                    <Text fw={600}>{selectedRun.id}</Text>
                    <Badge variant="light" color="review">{selectedRun.state}</Badge>
                    <MetaText>Attempts: {selectedRun.attemptCount}</MetaText>
                    <MetaText>Policy: {selectedRun.policySnapshot?.version ?? "unknown"}</MetaText>
                    <MetaText>Updated: {new Date(selectedRun.updatedAt).toLocaleString()}</MetaText>
                  </>
                ) : (
                  <BodyText>No mission run yet. Start one to begin.</BodyText>
                )}
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="strategy">
              <Stack gap="xs">
                <MetaText>Recent Runs</MetaText>
                {runs.slice(0, 4).map((run) => (
                  <Button
                    key={run.id}
                    variant={selectedRun?.id === run.id ? "light" : "subtle"}
                    color={selectedRun?.id === run.id ? "review" : "gray"}
                    justify="space-between"
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <span>{run.id.slice(0, 12)}</span>
                    <span>{run.state}</span>
                  </Button>
                ))}
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="checklist">
              <Stack gap="xs">
                <MetaText>Latest Attempt Outcome</MetaText>
                {selectedRun?.attempts?.length ? (
                  <>
                    <Text fw={600}>Attempt {selectedRun.attempts[selectedRun.attempts.length - 1]?.ordinal}</Text>
                    <MetaText>{selectedRun.attempts[selectedRun.attempts.length - 1]?.state}</MetaText>
                    <MetaText>{selectedRun.attempts[selectedRun.attempts.length - 1]?.rejectionCode ?? "No rejection code"}</MetaText>
                  </>
                ) : (
                  <BodyText>No attempt history recorded yet.</BodyText>
                )}
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="md">
            <Textarea
              label="Normalized listing JSON"
              minRows={18}
              autosize
              value={normalizedListingJson}
              onChange={(event) => setNormalizedListingJson(event.currentTarget.value)}
            />
            <Textarea
              label="Evidence summary JSON"
              minRows={18}
              autosize
              value={evidenceSummaryJson}
              onChange={(event) => setEvidenceSummaryJson(event.currentTarget.value)}
            />
            <Textarea
              label="Media request JSON"
              minRows={18}
              autosize
              value={mediaRequestJson}
              onChange={(event) => setMediaRequestJson(event.currentTarget.value)}
            />
          </SimpleGrid>

          <Group gap="sm">
            <Button
              color="checklist"
              leftSection={<IconRefresh size={16} />}
              loading={discovering}
              disabled={!selectedRun}
              onClick={() => void discoverCandidates()}
            >
              Discover candidates
            </Button>
            <Button
              color="strategy"
              leftSection={<IconSend size={16} />}
              loading={extracting}
              disabled={!selectedRun || !selectedDiscoveredCandidate}
              onClick={() => void extractCandidate()}
            >
              Extract selected candidate
            </Button>
            <Button
              color="strategy"
              leftSection={<IconRosetteDiscountCheck size={16} />}
              loading={scoring}
              disabled={!selectedRun}
              onClick={() => void scoreCandidate()}
            >
              Score candidate
            </Button>
            <Button
              color="review"
              leftSection={<IconSend size={16} />}
              loading={preparing}
              disabled={!selectedRun}
              onClick={() => void prepareCandidate()}
            >
              Prepare review packet
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
            <UnifiedCardSection tone="checklist">
              <Stack gap="xs">
                <SectionTitle>Discovered Candidates</SectionTitle>
                {discoveredCandidates.length === 0 ? (
                  <BodyText>No discovery candidates loaded yet.</BodyText>
                ) : (
                  discoveredCandidates.map((item) => {
                    const isSelected = item.candidate.id === selectedDiscoveredCandidate?.candidate.id;
                    const score =
                      typeof item.artifact.scoreResult === "object" && item.artifact.scoreResult && "score" in item.artifact.scoreResult
                        ? Number(item.artifact.scoreResult.score ?? 0)
                        : 0;
                    return (
                      <UnifiedCardSection key={item.candidate.id} tone={isSelected ? "review" : "neutral"}>
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start">
                            <Stack gap={2}>
                              <Text fw={600}>{item.artifact.title}</Text>
                              <MetaText>
                                {item.artifact.categoryHint} · {item.artifact.boroughGuess} · {item.artifact.neighborhoodGuess}
                              </MetaText>
                            </Stack>
                            <Badge variant="light" color={isSelected ? "review" : "gray"}>
                              Score {score}
                            </Badge>
                          </Group>
                          <MetaText>{item.artifact.authorityGrade} · {item.artifact.sourceUrl}</MetaText>
                          <Group gap="xs" wrap="wrap">
                            {(item.artifact.prefilterReasons ?? []).slice(0, 3).map((reason) => (
                              <Badge key={reason} size="xs" variant="light" color="strategy">
                                {reason}
                              </Badge>
                            ))}
                          </Group>
                          <Button
                            size="xs"
                            variant={isSelected ? "light" : "subtle"}
                            color="review"
                            onClick={() => setSelectedCandidateId(item.candidate.id)}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </Button>
                        </Stack>
                      </UnifiedCardSection>
                    );
                  })
                )}
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="strategy">
              <Stack gap="xs">
                <SectionTitle>Extraction Result</SectionTitle>
                {extractResponse ? <Code block>{pretty(extractResponse)}</Code> : <BodyText>No extraction result yet.</BodyText>}
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
            <UnifiedCardSection tone="strategy">
              <Stack gap="xs">
                <SectionTitle>Score Result</SectionTitle>
                {scoreResponse ? <Code block>{pretty(scoreResponse)}</Code> : <BodyText>No score result yet.</BodyText>}
              </Stack>
            </UnifiedCardSection>
            <UnifiedCardSection tone="review">
              <Stack gap="xs">
                <SectionTitle>Preparation Result</SectionTitle>
                {prepareResponse ? <Code block>{pretty(prepareResponse)}</Code> : <BodyText>No preparation result yet.</BodyText>}
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
