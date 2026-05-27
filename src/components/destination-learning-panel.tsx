'use client';

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Group, Loader, SimpleGrid, Stack } from "@mantine/core";
import { IconBrain as Brain, IconRefresh as Refresh, IconRepeat as Repeat } from "@tabler/icons-react";
import { MetricCard } from "@/components/ui/app-shell";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";

type LearningSummary = {
  generatedAt: string;
  quality: {
    firstPassApprovalRate: number;
    rejectionRate: number;
    reworkRate: number;
    draftCorrectionRate: number;
    factCorrectionRate: number;
    publishSuccessRate: number;
    publishFailureRate: number;
    workflowCompletionRate: number;
    workflowFailureRate: number;
  };
  topDecisionReasons: Array<{ key: string; count: number }>;
  topOutcomeReasons: Array<{ key: string; count: number }>;
  topFailureStages: Array<{ key: string; count: number }>;
};

type ReplayCandidate = {
  kind: "review-packet" | "workflow-run";
  id: string;
  workflowRunId: string;
  currentState: string;
  latestReasonCode: string | null;
  recommendedAction: string;
  rationale: string;
  updatedAt: string;
};

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function DestinationLearningPanel({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [candidates, setCandidates] = useState<ReplayCandidate[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResponse, candidatesResponse] = await Promise.all([
        fetch(`/api/destination-learning/summary?companyId=${companyId}&destinationKey=classscout`),
        fetch(`/api/destination-learning/replay-candidates?companyId=${companyId}&destinationKey=classscout`),
      ]);
      const summaryPayload = summaryResponse.ok ? await summaryResponse.json() : null;
      const candidatesPayload = candidatesResponse.ok ? await candidatesResponse.json() : null;
      setSummary(summaryPayload?.summary ?? null);
      setCandidates(Array.isArray(candidatesPayload?.items) ? candidatesPayload.items : []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const executeReplay = useCallback(
    async (candidate: ReplayCandidate) => {
      setActingId(candidate.id);
      try {
        await fetch("/api/destination-learning/replay-candidates/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            candidateKind: candidate.kind,
            reviewPacketId: candidate.kind === "review-packet" ? candidate.id : undefined,
            workflowRunId: candidate.kind === "workflow-run" ? candidate.workflowRunId : undefined,
            reason: "operator-replay-from-learning-panel",
          }),
        });
        await load();
      } finally {
        setActingId(null);
      }
    },
    [companyId, load],
  );

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader />
      </Stack>
    );
  }

  if (!summary) return null;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <SectionTitle>Destination Learning Loop</SectionTitle>
        <Button variant="light" color="review" leftSection={<Refresh size={16} />} onClick={() => void load()}>
          Refresh
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={Brain} color="review" label="First-Pass Approval" value={pct(summary.quality.firstPassApprovalRate)} detail="approved without rejection" />
        <MetricCard icon={Brain} color="strategy" label="Publish Success" value={pct(summary.quality.publishSuccessRate)} detail="approved packets that published" />
        <MetricCard icon={Brain} color="checklist" label="Rework Rate" value={pct(summary.quality.reworkRate)} detail="packets sent back for fixes" />
        <MetricCard icon={Brain} color="knowmore" label="Workflow Failure" value={pct(summary.quality.workflowFailureRate)} detail="runs ending in failed state" />
        <MetricCard icon={Brain} color="strategy" label="Draft Corrections" value={pct(summary.quality.draftCorrectionRate)} detail="decisions with payload edits" />
        <MetricCard icon={Brain} color="checklist" label="Fact Corrections" value={pct(summary.quality.factCorrectionRate)} detail="decisions with fact edits" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="lg">
        <UnifiedCard tone="review">
          <UnifiedCardHeader title="Top Decision Reasons" />
          <UnifiedCardBody>
            <Stack gap="sm">
              {summary.topDecisionReasons.length === 0 ? (
                <BodyText>No decision data yet.</BodyText>
              ) : (
                summary.topDecisionReasons.map((item) => (
                  <UnifiedCardSection key={item.key} tone="review">
                    <Group justify="space-between">
                      <Text fw={600}>{item.key}</Text>
                      <Badge variant="light" color="review">{item.count}</Badge>
                    </Group>
                  </UnifiedCardSection>
                ))
              )}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="strategy">
          <UnifiedCardHeader title="Top Outcome Reasons" />
          <UnifiedCardBody>
            <Stack gap="sm">
              {summary.topOutcomeReasons.length === 0 ? (
                <BodyText>No destination outcome reasons yet.</BodyText>
              ) : (
                summary.topOutcomeReasons.map((item) => (
                  <UnifiedCardSection key={item.key} tone="strategy">
                    <Group justify="space-between">
                      <Text fw={600}>{item.key}</Text>
                      <Badge variant="light" color="strategy">{item.count}</Badge>
                    </Group>
                  </UnifiedCardSection>
                ))
              )}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="checklist">
          <UnifiedCardHeader title="Top Failure Stages" />
          <UnifiedCardBody>
            <Stack gap="sm">
              {summary.topFailureStages.length === 0 ? (
                <BodyText>No failure stages recorded.</BodyText>
              ) : (
                summary.topFailureStages.map((item) => (
                  <UnifiedCardSection key={item.key} tone="checklist">
                    <Group justify="space-between">
                      <Text fw={600}>{item.key}</Text>
                      <Badge variant="light" color="checklist">{item.count}</Badge>
                    </Group>
                  </UnifiedCardSection>
                ))
              )}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      </SimpleGrid>

      <UnifiedCard tone="review">
        <UnifiedCardHeader
          title="Replay Queue"
          supporting={<Badge variant="light" color="review">{candidates.length}</Badge>}
        />
        <UnifiedCardBody>
          <Stack gap="sm">
            {candidates.length === 0 ? (
              <BodyText>No replay candidates right now.</BodyText>
            ) : (
              candidates.slice(0, 12).map((candidate) => (
                <UnifiedCardSection key={`${candidate.kind}-${candidate.id}`} tone="review">
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={2}>
                        <Text fw={600}>{candidate.recommendedAction}</Text>
                        <MetaText>{candidate.currentState} · {candidate.kind}</MetaText>
                      </Stack>
                      <MetaText>{new Date(candidate.updatedAt).toLocaleString()}</MetaText>
                    </Group>
                    <BodyText>{candidate.rationale}</BodyText>
                    <MetaText>{candidate.latestReasonCode ?? "No reason code recorded"}</MetaText>
                    <Group justify="space-between" align="center">
                      <MetaText>{candidate.workflowRunId}</MetaText>
                      <Button
                        size="xs"
                        variant="light"
                        color="review"
                        leftSection={<Repeat size={14} />}
                        loading={actingId === candidate.id}
                        onClick={() => void executeReplay(candidate)}
                      >
                        Execute
                      </Button>
                    </Group>
                  </Stack>
                </UnifiedCardSection>
              ))
            )}
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>
    </Stack>
  );
}
