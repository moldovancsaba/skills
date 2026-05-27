'use client';

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Group, Loader, SimpleGrid, Stack } from "@mantine/core";
import { IconActivity, IconRefresh as Refresh, IconRotateClockwise2, IconStethoscope } from "@tabler/icons-react";
import { MetricCard, Notice } from "@/components/ui/app-shell";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";

type MissionSummary = {
  activeRuns: number;
  staleRuns: Array<{ runId: string; currentStage: string; state: string; updatedAt: string }>;
  retryBacklog: number;
  reviewQueueAging: { openPackets: number; oldestPacketAgeMs: number };
  callbackFailureCount: number;
  topFailureCodes: Array<{ code: string; count: number }>;
  generatedAt: string;
};

export function DestinationMissionControl({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [actingRunId, setActingRunId] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/destination-workflows/mission-control/summary?companyId=${companyId}`);
      const data = response.ok ? await response.json() : null;
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSummary();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSummary]);

  const runRecovery = useCallback(
    async (runId: string, actionType: "RETRY" | "REPLAY") => {
      setActingRunId(runId);
      try {
        await fetch("/api/destination-workflows/mission-control/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            runId,
            actionType,
            ...(actionType === "REPLAY" ? { fromStage: "FETCH_SOURCE" } : {}),
            reason: "operator-recovery",
          }),
        });
        await loadSummary();
      } finally {
        setActingRunId(null);
      }
    },
    [companyId, loadSummary],
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
        <SectionTitle>Destination Mission Control</SectionTitle>
        <Button variant="light" color="review" leftSection={<Refresh size={16} />} onClick={() => void loadSummary()}>
          Refresh
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={IconActivity} color="review" label="Active Runs" value={summary.activeRuns} detail="workflow runs still in motion" />
        <MetricCard icon={IconStethoscope} color="strategy" label="Stale Runs" value={summary.staleRuns.length} detail="past timeout threshold" />
        <MetricCard icon={IconRotateClockwise2} color="checklist" label="Retry Backlog" value={summary.retryBacklog} detail="failed runs awaiting recovery" />
        <MetricCard icon={Refresh} color="knowmore" label="Open Review Packets" value={summary.reviewQueueAging.openPackets} detail={`${Math.round(summary.reviewQueueAging.oldestPacketAgeMs / 60000)} min oldest`} />
      </SimpleGrid>

      {summary.callbackFailureCount > 0 ? (
        <Notice title="Destination callbacks have recent failures" icon={IconStethoscope} variant="destructive">
          {summary.callbackFailureCount} callback-related failure event{summary.callbackFailureCount === 1 ? "" : "s"} were recorded recently.
        </Notice>
      ) : null}

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <UnifiedCard tone="review">
          <UnifiedCardHeader title="Stale Runs" supporting={<Badge variant="light" color="review">{summary.staleRuns.length}</Badge>} />
          <UnifiedCardBody>
            <Stack gap="sm">
              {summary.staleRuns.length === 0 ? (
                <BodyText>No stale destination workflow runs right now.</BodyText>
              ) : (
                summary.staleRuns.map((run) => (
                  <UnifiedCardSection key={run.runId} tone="review">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text fw={600}>{run.runId}</Text>
                          <MetaText>{run.currentStage} · {run.state}</MetaText>
                        </Stack>
                        <MetaText>{new Date(run.updatedAt).toLocaleString()}</MetaText>
                      </Group>
                      <Group gap="sm">
                        <Button
                          size="xs"
                          variant="light"
                          color="checklist"
                          loading={actingRunId === run.runId}
                          onClick={() => void runRecovery(run.runId, "RETRY")}
                        >
                          Retry
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="strategy"
                          loading={actingRunId === run.runId}
                          onClick={() => void runRecovery(run.runId, "REPLAY")}
                        >
                          Replay
                        </Button>
                      </Group>
                    </Stack>
                  </UnifiedCardSection>
                ))
              )}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="strategy">
          <UnifiedCardHeader title="Top Failure Codes" />
          <UnifiedCardBody>
            <Stack gap="sm">
              {summary.topFailureCodes.length === 0 ? (
                <BodyText>No recent failure codes recorded.</BodyText>
              ) : (
                summary.topFailureCodes.map((item) => (
                  <UnifiedCardSection key={item.code} tone="strategy">
                    <Group justify="space-between">
                      <Text fw={600}>{item.code}</Text>
                      <Badge variant="light" color="strategy">{item.count}</Badge>
                    </Group>
                  </UnifiedCardSection>
                ))
              )}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      </SimpleGrid>
    </Stack>
  );
}
