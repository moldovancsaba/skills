'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Code, Group, Loader, NativeSelect, SimpleGrid, Stack, Textarea } from "@mantine/core";
import { IconPlayerPause, IconPlayerPlay, IconRefresh, IconRosetteDiscountCheck, IconSend } from "@tabler/icons-react";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { resolveDestinationLabel } from "@/lib/destination-scope";

type MissionAttempt = {
  id: string;
  ordinal: number;
  state: string;
  rejectionCode: string | null;
  rejectionDetail?: string | null;
  completedAt: string | null;
};

type MissionRun = {
  id: string;
  state: string;
  attemptCount: number;
  failureCode: string | null;
  failureDetail?: string | null;
  updatedAt: string;
  missionDefinition?: {
    id: string;
    name: string;
    status: string;
  } | null;
  policySnapshot?: {
    version: string;
    policyJson?: {
      executionMode?: string;
      maxCandidatesPerMission?: number;
      maxDomainRetries?: number;
      maxContinuousPasses?: number;
    } | null;
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

type ExecuteNextAttemptResponse = {
  ok: boolean;
  reviewReady?: boolean;
  terminal?: boolean;
  candidateId?: string;
  draftId?: string;
  mission?: MissionRun | null;
  trail?: Record<string, unknown>[];
  result?: Record<string, unknown>;
  error?: string;
};

type MissionPass = {
  pass: number;
  ok: boolean;
  reviewReady: boolean;
  terminal: boolean;
  candidateId: string | null;
  draftId: string | null;
  trail: Record<string, unknown>[];
  error: string | null;
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

type MissionCandidateSummary = {
  id: string;
  status: string;
  canonicalSourceUrl: string;
  proposedType: string | null;
  metadata?: {
    title?: string;
    authorityGrade?: string;
    boroughGuess?: string;
    neighborhoodGuess?: string;
    searchQuery?: string;
    scoreResult?: { score?: number } | Record<string, unknown>;
    discoveryArtifact?: { sourceHost?: string } | Record<string, unknown>;
  } | null;
  reviewPackets?: Array<{
    packetState: string;
    reviewDecisions?: Array<{ decision: string }>;
    outcomeMemories?: Array<{ eventType: string }>;
  }>;
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

export function DestinationRulebookRunner({
  companyId,
  destinationKey = "classscout",
}: {
  companyId: string;
  destinationKey?: DestinationKey;
}) {
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<MissionRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [normalizedListingJson, setNormalizedListingJson] = useState(DEFAULT_NORMALIZED_LISTING);
  const [evidenceSummaryJson, setEvidenceSummaryJson] = useState(pretty({ sourceUrls: [] }));
  const [mediaRequestJson, setMediaRequestJson] = useState(pretty({ imageUrl: "", sourcePageUrl: "" }));
  const [scoreResponse, setScoreResponse] = useState<ScoreResponse | null>(null);
  const [prepareResponse, setPrepareResponse] = useState<PrepareResponse | null>(null);
  const [executionResponse, setExecutionResponse] = useState<ExecuteNextAttemptResponse | null>(null);
  const [cycleResponse, setCycleResponse] = useState<ExecuteNextAttemptResponse | null>(null);
  const [discoverResponse, setDiscoverResponse] = useState<DiscoverResponse | null>(null);
  const [extractResponse, setExtractResponse] = useState<ExtractResponse | null>(null);
  const [missionCandidates, setMissionCandidates] = useState<MissionCandidateSummary[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<"manual" | "guarded" | "autopilot">("manual");
  const [starting, setStarting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [cycleRunning, setCycleRunning] = useState(false);
  const [daemonRunning, setDaemonRunning] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
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
  const executionSelectionStep = useMemo(
    () => executionResponse?.trail?.find((step) => step.step === "selection") ?? null,
    [executionResponse],
  );
  const cycleSelectionSteps = useMemo(
    () =>
      ((cycleResponse as Record<string, unknown> | null)?.passes as MissionPass[] | undefined)?.flatMap((pass) =>
        pass.trail.filter((step) => step.step === "selection").map((step) => ({ pass: pass.pass, step })),
      ) ?? [],
    [cycleResponse],
  );
  const selectedCandidateSummary = useMemo(
    () => missionCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? null,
    [missionCandidates, selectedCandidateId],
  );

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        companyId,
        destinationKey,
        missionKind: "rulebook_new_listing",
      });
      const response = await fetch(`/api/destination-missions/runs?${params.toString()}`);
      const payload = response.ok ? await response.json() : null;
      const nextRuns = Array.isArray(payload?.runs) ? (payload.runs as MissionRun[]) : [];
      setRuns(nextRuns);
      setSelectedRunId((current) => current ?? nextRuns[0]?.id ?? null);
      const activeRun = nextRuns.find((run) => run.id === (selectedRunId ?? nextRuns[0]?.id)) ?? nextRuns[0];
      const mode = activeRun?.policySnapshot?.policyJson?.executionMode;
      if (mode === "manual" || mode === "guarded" || mode === "autopilot") {
        setExecutionMode(mode);
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, destinationKey, selectedRunId]);

  const loadMissionCandidates = useCallback(async (runId: string | null) => {
    if (!runId) {
      setMissionCandidates([]);
      return;
    }

    const params = new URLSearchParams({ companyId, destinationKey });
    const response = await fetch(`/api/destination-missions/runs/${runId}/candidates?${params.toString()}`);
    const payload = response.ok ? await response.json() : null;
    const candidates = Array.isArray(payload?.candidates) ? (payload.candidates as MissionCandidateSummary[]) : [];
    setMissionCandidates(candidates);
    if (candidates.length && !selectedCandidateId) {
      setSelectedCandidateId(candidates[0]?.id ?? null);
    }
  }, [companyId, destinationKey, selectedCandidateId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMissionCandidates(selectedRunId ?? runs[0]?.id ?? null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMissionCandidates, runs, selectedRunId]);

  const startMission = useCallback(async () => {
    setStarting(true);
    try {
      const response = await fetch("/api/destination-missions/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
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
  }, [companyId, destinationKey, loadRuns]);

  const toggleMission = useCallback(async () => {
    if (!selectedRun) return;
    setToggling(true);
    try {
      const route = selectedRun.state === "PAUSED" ? "resume" : "pause";
      await fetch(`/api/destination-missions/runs/${selectedRun.id}/${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, destinationKey }),
      });
      await loadRuns();
    } finally {
      setToggling(false);
    }
  }, [companyId, destinationKey, loadRuns, selectedRun]);

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
          destinationKey,
          maxTargets: 4,
          maxCandidates: 6,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as DiscoverResponse;
      setDiscoverResponse(payload);
      const firstCandidateId = payload.persisted?.[0]?.candidate.id ?? null;
      setSelectedCandidateId(firstCandidateId);
      await loadRuns();
      await loadMissionCandidates(selectedRun.id);
    } finally {
      setDiscovering(false);
    }
  }, [companyId, destinationKey, loadMissionCandidates, loadRuns, selectedRun]);

  const extractCandidate = useCallback(async () => {
    if (!selectedRun || !selectedDiscoveredCandidate) return;
    setExtracting(true);
    try {
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}/extract-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
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
      await loadMissionCandidates(selectedRun.id);
    } finally {
      setExtracting(false);
    }
  }, [companyId, destinationKey, loadMissionCandidates, loadRuns, selectedDiscoveredCandidate, selectedRun]);

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
          destinationKey,
          normalizedListing,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as ScoreResponse;
      setScoreResponse(payload);
      await loadRuns();
      await loadMissionCandidates(selectedRun.id);
    } finally {
      setScoring(false);
    }
  }, [companyId, destinationKey, loadMissionCandidates, loadRuns, parseEditors, selectedRun]);

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
          destinationKey,
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
      await loadMissionCandidates(selectedRun.id);
    } finally {
      setPreparing(false);
    }
  }, [companyId, destinationKey, loadMissionCandidates, loadRuns, parseEditors, selectedCandidateId, selectedRun]);

  const executeNextAttempt = useCallback(async () => {
    if (!selectedRun) return;
    setAutoRunning(true);
    try {
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}/execute-next-attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
          maxAutoRejections: 5,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as ExecuteNextAttemptResponse;
      setExecutionResponse(payload);
      if (payload.candidateId) {
        setSelectedCandidateId(payload.candidateId);
      }
      await loadRuns();
      await loadMissionCandidates(selectedRun.id);
    } finally {
      setAutoRunning(false);
    }
  }, [companyId, destinationKey, loadMissionCandidates, loadRuns, selectedRun]);

  const executeUntilBlocked = useCallback(async () => {
    if (!selectedRun) return;
    setCycleRunning(true);
    try {
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}/execute-until-blocked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
          maxPasses: 3,
          maxAutoRejections: 5,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as ExecuteNextAttemptResponse;
      setCycleResponse(payload);
      if (payload.candidateId) {
        setSelectedCandidateId(payload.candidateId);
      }
      await loadRuns();
      await loadMissionCandidates(selectedRun.id);
    } finally {
      setCycleRunning(false);
    }
  }, [companyId, destinationKey, loadMissionCandidates, loadRuns, selectedRun]);

  const runDaemonTick = useCallback(async () => {
    setDaemonRunning(true);
    try {
      const response = await fetch("/api/destination-missions/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
          maxRuns: 5,
          maxPasses: 3,
          maxAutoRejections: 5,
        }),
      });
      const payload = (await response.json().catch(() => ({ ok: false, error: "Invalid response" }))) as ExecuteNextAttemptResponse;
      setCycleResponse(payload);
      await loadRuns();
      await loadMissionCandidates(selectedRun?.id ?? selectedRunId ?? null);
    } finally {
      setDaemonRunning(false);
    }
  }, [companyId, destinationKey, loadMissionCandidates, loadRuns, selectedRun?.id, selectedRunId]);

  const saveExecutionMode = useCallback(async () => {
    if (!selectedRun) return;
    setSavingPolicy(true);
    try {
      const response = await fetch(`/api/destination-missions/runs/${selectedRun.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
          policySnapshot: {
            executionMode,
          },
        }),
      });
      const payload = response.ok ? await response.json() : null;
      const updatedMode = payload?.run?.policySnapshot?.policyJson?.executionMode;
      if (updatedMode === "manual" || updatedMode === "guarded" || updatedMode === "autopilot") {
        setExecutionMode(updatedMode);
      }
      await loadRuns();
    } finally {
      setSavingPolicy(false);
    }
  }, [companyId, destinationKey, executionMode, loadRuns, selectedRun]);

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
                Run the active {resolveDestinationLabel(destinationKey)} mission definition from this unit, then move candidates into the review queue.
              </BodyText>
            </Stack>
            <Group gap="sm">
              <NativeSelect
                value={executionMode}
                onChange={(event) => setExecutionMode(event.currentTarget.value as "manual" | "guarded" | "autopilot")}
                data={[
                  { value: "manual", label: "Manual" },
                  { value: "guarded", label: "Guarded" },
                  { value: "autopilot", label: "Autopilot" },
                ]}
              />
              <Button
                variant="light"
                color="dark"
                loading={savingPolicy}
                disabled={!selectedRun}
                onClick={() => void saveExecutionMode()}
              >
                Save mode
              </Button>
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
                    {selectedRun.missionDefinition ? (
                      <MetaText>Definition: {selectedRun.missionDefinition.name}</MetaText>
                    ) : null}
                    <MetaText>Policy: {selectedRun.policySnapshot?.version ?? "unknown"}</MetaText>
                    <MetaText>Mode: {selectedRun.policySnapshot?.policyJson?.executionMode ?? "manual"}</MetaText>
                    {selectedRun.failureCode ? (
                      <MetaText>Failure: {selectedRun.failureCode}</MetaText>
                    ) : null}
                    {selectedRun.failureDetail ? (
                      <BodyText>{selectedRun.failureDetail}</BodyText>
                    ) : null}
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
                    <Group justify="space-between" w="100%">
                      <MetaText>{run.id.slice(0, 12)}</MetaText>
                      <MetaText>{run.state}</MetaText>
                    </Group>
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
                    {selectedRun.attempts[selectedRun.attempts.length - 1]?.rejectionDetail ? (
                      <BodyText>{selectedRun.attempts[selectedRun.attempts.length - 1]?.rejectionDetail}</BodyText>
                    ) : null}
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
              variant="light"
              leftSection={<IconPlayerPlay size={16} />}
              loading={autoRunning}
              disabled={!selectedRun}
              onClick={() => void executeNextAttempt()}
            >
              Auto-run next candidate
            </Button>
            <Button
              color="review"
              leftSection={<IconSend size={16} />}
              loading={cycleRunning}
              disabled={!selectedRun}
              onClick={() => void executeUntilBlocked()}
            >
              Run until blocked
            </Button>
              <Button
                color="strategy"
                variant="light"
                leftSection={<IconRefresh size={16} />}
                loading={daemonRunning}
                onClick={() => void runDaemonTick()}
              >
                Run background tick
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
            <UnifiedCardSection tone="checklist">
              <Stack gap="xs">
                <SectionTitle>Mission Candidate Queue</SectionTitle>
                {missionCandidates.length ? (
                  missionCandidates.map((candidate) => {
                    const score =
                      typeof candidate.metadata?.scoreResult === "object" && candidate.metadata?.scoreResult && "score" in candidate.metadata.scoreResult
                        ? Number((candidate.metadata.scoreResult as { score?: number }).score ?? 0)
                        : null;
                    const sourceHost =
                      typeof candidate.metadata?.discoveryArtifact === "object" &&
                      candidate.metadata?.discoveryArtifact &&
                      "sourceHost" in candidate.metadata.discoveryArtifact
                        ? String((candidate.metadata.discoveryArtifact as { sourceHost?: string }).sourceHost ?? "")
                        : "";
                    return (
                      <UnifiedCardSection key={candidate.id} tone={candidate.id === selectedCandidateSummary?.id ? "review" : "neutral"}>
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start">
                            <Stack gap={2}>
                              <Text fw={600}>{candidate.metadata?.title ?? candidate.id}</Text>
                              <MetaText>{candidate.proposedType ?? "unknown"} · {candidate.status}</MetaText>
                            </Stack>
                            {score !== null ? (
                              <Badge variant="light" color="strategy">Score {score}</Badge>
                            ) : null}
                          </Group>
                          <MetaText>{candidate.metadata?.boroughGuess ?? ""} {candidate.metadata?.neighborhoodGuess ? `· ${candidate.metadata.neighborhoodGuess}` : ""}</MetaText>
                          <MetaText>{sourceHost || candidate.canonicalSourceUrl}</MetaText>
                          <MetaText>
                            Review: {candidate.reviewPackets?.[0]?.packetState ?? "none"} · Decision: {candidate.reviewPackets?.[0]?.reviewDecisions?.[0]?.decision ?? "none"} · Outcome: {candidate.reviewPackets?.[0]?.outcomeMemories?.[0]?.eventType ?? "none"}
                          </MetaText>
                          <Button
                            size="xs"
                            variant={candidate.id === selectedCandidateSummary?.id ? "light" : "subtle"}
                            color="review"
                            onClick={() => setSelectedCandidateId(candidate.id)}
                          >
                            {candidate.id === selectedCandidateSummary?.id ? "Selected" : "Select"}
                          </Button>
                        </Stack>
                      </UnifiedCardSection>
                    );
                  })
                ) : (
                  <BodyText>No mission candidate queue yet.</BodyText>
                )}
              </Stack>
            </UnifiedCardSection>

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

          <UnifiedCardSection tone="review">
            <Stack gap="xs">
              <SectionTitle>Auto-run Result</SectionTitle>
              {executionResponse ? (
                <>
                  <Group gap="xs">
                    <Badge variant="light" color={executionResponse.reviewReady ? "teal" : executionResponse.terminal ? "gray" : "yellow"}>
                      {executionResponse.reviewReady
                        ? "Review ready"
                        : executionResponse.terminal
                          ? "Terminal"
                          : "Needs another attempt"}
                    </Badge>
                    {executionResponse.candidateId ? (
                      <MetaText>Candidate {executionResponse.candidateId}</MetaText>
                    ) : null}
                  </Group>
                  <Code block>{pretty(executionResponse)}</Code>
                </>
              ) : (
                <BodyText>No auto-run result yet.</BodyText>
              )}
            </Stack>
          </UnifiedCardSection>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
            <UnifiedCardSection tone="strategy">
              <Stack gap="xs">
                <SectionTitle>Auto-run Telemetry</SectionTitle>
                {executionSelectionStep ? (
                  <>
                    <MetaText>
                      Available candidates: {String(executionSelectionStep.availableCandidates ?? 0)}
                    </MetaText>
                    <MetaText>
                      Domain attempts: {pretty(executionSelectionStep.domainAttempts ?? {})}
                    </MetaText>
                    <Code block>{pretty(executionSelectionStep.skipped ?? [])}</Code>
                  </>
                ) : (
                  <BodyText>No selection telemetry yet.</BodyText>
                )}
              </Stack>
            </UnifiedCardSection>

            <UnifiedCardSection tone="review">
              <Stack gap="xs">
                <SectionTitle>Continuous Run Result</SectionTitle>
                {cycleResponse ? (
                  <>
                    <Group gap="xs">
                      <Badge variant="light" color={cycleResponse.reviewReady ? "teal" : cycleResponse.terminal ? "gray" : "yellow"}>
                        {cycleResponse.reviewReady
                          ? "Review ready"
                          : cycleResponse.terminal
                            ? "Terminal"
                            : "Paused by control budget"}
                      </Badge>
                      {Array.isArray((cycleResponse as Record<string, unknown>).passes) ? (
                        <MetaText>{((cycleResponse as Record<string, unknown>).passes as MissionPass[]).length} pass(es)</MetaText>
                      ) : null}
                    </Group>
                    <Code block>{pretty(cycleResponse)}</Code>
                  </>
                ) : (
                  <BodyText>No continuous run result yet.</BodyText>
                )}
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>

          <UnifiedCardSection tone="checklist">
            <Stack gap="xs">
              <SectionTitle>Continuous Run Telemetry</SectionTitle>
              {cycleSelectionSteps.length ? (
                cycleSelectionSteps.map((entry) => (
                  <UnifiedCardSection key={`pass-${entry.pass}`} tone="neutral">
                    <Stack gap="xs">
                      <Text fw={600}>Pass {entry.pass}</Text>
                      <MetaText>
                        Available candidates: {String((entry.step as Record<string, unknown>).availableCandidates ?? 0)}
                      </MetaText>
                      <Code block>{pretty((entry.step as Record<string, unknown>).domainAttempts ?? {})}</Code>
                      <Code block>{pretty((entry.step as Record<string, unknown>).skipped ?? [])}</Code>
                    </Stack>
                  </UnifiedCardSection>
                ))
              ) : (
                <BodyText>No continuous run telemetry yet.</BodyText>
              )}
            </Stack>
          </UnifiedCardSection>
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
