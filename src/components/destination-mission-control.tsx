'use client';

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Group, Loader, SimpleGrid, Stack } from "@mantine/core";
import { IconActivity, IconRefresh as Refresh, IconRotateClockwise2, IconStethoscope } from "@tabler/icons-react";
import { MetricCard, Notice } from "@/components/ui/app-shell";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

type MissionSummary = {
  activeRuns: number;
  staleRuns: Array<{ runId: string; currentStage: string; state: string; updatedAt: string }>;
  retryBacklog: number;
  reviewQueueAging: { openPackets: number; oldestPacketAgeMs: number };
  callbackFailureCount: number;
  topFailureCodes: Array<{ code: string; count: number }>;
  verificationHealth: {
    total: number;
    verified: number;
    retrying: number;
    failed: number;
    counts: Record<string, number>;
    recent: Array<{
      runId: string;
      state: string;
      destinationKey: string;
      failureCode: string | null;
      recoveryHint: string | null;
      nextAction: string | null;
      verificationStatus: string | null;
      verificationAttempt: number | null;
      verificationAttemptMax: number | null;
      checkedAt: string;
    }>;
  };
  trackHealth: {
    missionRuns: number;
    blocked: number;
    terminal: number;
  };
  nextRetryAction: {
    runId: string;
    state: string;
    failureCode: string | null;
    recoveryHint: string | null;
    nextAction: string | null;
    updatedAt: string;
  } | null;
  generatedAt: string;
};

type OperationAction = "retry" | "cancel" | "replay" | "rollback" | "acknowledge";

type OperationalItem = {
  id: string;
  source: "local_job" | "miniapp_publish" | "read_model" | "content_refresh";
  severity: "info" | "warning" | "critical";
  status: "running" | "retrying" | "failed" | "dead_lettered" | "stale" | "blocked" | "resolved";
  summary: string;
  safeActions: OperationAction[];
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
  meta?: {
    actionBasePath?: string;
    destinationKey?: string;
  };
};

type DestinationDaemonLane = {
  destinationKey: string;
  status: "inactive" | "healthy" | "warning" | "critical";
  summary: string;
  activeDefinitionCount: number;
  activeRunCount: number;
  failedRecoverableCount: number;
  pausedCount: number;
  runCounts: Record<string, number>;
  lastRunUpdatedAt: string | null;
};

function laneStatusColor(status: DestinationDaemonLane["status"]) {
  if (status === "critical") return "review";
  if (status === "warning") return "tactical";
  if (status === "healthy") return "strategy";
  return "gray";
}

export function DestinationMissionControl({
  companyId,
  destinationKey,
}: {
  companyId: string;
  destinationKey?: DestinationKey;
}) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MissionSummary | null>(null);
  const [daemonLanes, setDaemonLanes] = useState<DestinationDaemonLane[]>([]);
  const [operationalItems, setOperationalItems] = useState<OperationalItem[]>([]);
  const [actingRunId, setActingRunId] = useState<string | null>(null);
  const [actingOperationId, setActingOperationId] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const destinationQuery = destinationKey ? `&destinationKey=${encodeURIComponent(destinationKey)}` : "";
      const operationsScopeQuery = destinationKey ? `?destinationKey=${encodeURIComponent(destinationKey)}` : "";
      const [summaryResponse, operationsResponse] = await Promise.all([
        fetch(`/api/destination-workflows/mission-control/summary?companyId=${encodeURIComponent(companyId)}${destinationQuery}`),
        fetch(`/api/companies/${encodeURIComponent(companyId)}/operations${operationsScopeQuery}`),
      ]);
      const summaryData = summaryResponse.ok ? await summaryResponse.json() : null;
      setSummary(summaryData);

      if (operationsResponse.ok) {
        const operationsData = await operationsResponse.json();
        const lanesRaw = Array.isArray(operationsData?.destinationDaemon?.byDestination)
          ? operationsData.destinationDaemon.byDestination
          : [];
        const itemsRaw = Array.isArray(operationsData?.items)
          ? operationsData.items
          : [];
        const lanes = destinationKey
          ? lanesRaw.filter((lane: DestinationDaemonLane) => lane.destinationKey === destinationKey)
          : lanesRaw;
        const items = destinationKey
          ? itemsRaw.filter((item: OperationalItem) => {
              if (item.source !== "miniapp_publish") return true;
              return item.meta?.destinationKey === destinationKey;
            })
          : itemsRaw;
        setDaemonLanes(lanes);
        setOperationalItems(items);
      } else {
        setDaemonLanes([]);
        setOperationalItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, destinationKey]);

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
            destinationKey,
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
    [companyId, destinationKey, loadSummary],
  );

  const runOperationAction = useCallback(
    async (item: OperationalItem, action: OperationAction) => {
      setActingOperationId(`${item.id}:${action}`);
      try {
        const fallbackBasePath = `/api/companies/${companyId}/operations/${encodeURIComponent(item.id)}`;
        const actionBasePath = typeof item.meta?.actionBasePath === "string" && item.meta.actionBasePath
          ? item.meta.actionBasePath
          : fallbackBasePath;
        await fetch(
          `${actionBasePath}/${action}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reason: "operator-action-from-observability",
            }),
          },
        );
        await loadSummary();
      } finally {
        setActingOperationId(null);
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
        <MetricCard icon={Refresh} color="knowmore" label="Open Review Cards" value={summary.reviewQueueAging.openPackets} detail={`${Math.round(summary.reviewQueueAging.oldestPacketAgeMs / 60000)} min oldest`} />
        <MetricCard icon={IconStethoscope} color="strategy" label="Verified Publishes" value={summary.verificationHealth.verified} detail={`${summary.verificationHealth.retrying} retrying · ${summary.verificationHealth.failed} failed`} />
        <MetricCard icon={IconActivity} color="tactical" label="Blocked Tracks" value={summary.trackHealth.blocked} detail={`${summary.trackHealth.terminal} terminal mission runs`} />
      </SimpleGrid>

      {summary.callbackFailureCount > 0 ? (
        <Notice title="Destination callbacks have recent failures" icon={IconStethoscope} variant="destructive">
          {summary.callbackFailureCount} callback-related failure event{summary.callbackFailureCount === 1 ? "" : "s"} were recorded recently.
        </Notice>
      ) : null}

      {summary.nextRetryAction ? (
        <Notice title="Next mission recovery action" icon={IconRotateClockwise2}>
          {summary.nextRetryAction.nextAction ?? "retry"} for run {summary.nextRetryAction.runId}
          {summary.nextRetryAction.failureCode ? ` after ${summary.nextRetryAction.failureCode}` : ""}.
        </Notice>
      ) : null}

      <UnifiedCard tone="strategy">
        <UnifiedCardHeader
          title="Publish verification health"
          supporting={<Badge variant="light" color="strategy">{summary.verificationHealth.total}</Badge>}
        />
        <UnifiedCardBody>
          <Stack gap="sm" aria-live="polite">
            {summary.verificationHealth.recent.length === 0 ? (
              <BodyText>No publish verification records are available yet.</BodyText>
            ) : (
              summary.verificationHealth.recent.map((item) => (
                <UnifiedCardSection key={item.runId} tone="strategy">
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <Text fw={600}>{item.runId}</Text>
                        <Badge variant="light" color={item.verificationStatus === "verified" ? "strategy" : item.verificationStatus === "schema_mismatch" || item.verificationStatus === "image_invalid" ? "review" : "tactical"}>
                          {item.verificationStatus ?? "pending"}
                        </Badge>
                      </Group>
                      <MetaText>{new Date(item.checkedAt).toLocaleString()}</MetaText>
                    </Group>
                    <MetaText>
                      {item.destinationKey} · {item.state}
                      {item.verificationAttempt ? ` · attempt ${item.verificationAttempt}/${item.verificationAttemptMax ?? "?"}` : ""}
                    </MetaText>
                    <MetaText>
                      {item.nextAction ?? "continue"}
                      {item.failureCode ? ` · ${item.failureCode}` : ""}
                    </MetaText>
                  </Stack>
                </UnifiedCardSection>
              ))
            )}
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

      <UnifiedCard tone="tactical">
        <UnifiedCardHeader
          title="Destination daemon lanes"
          supporting={<Badge variant="light" color="tactical">{daemonLanes.length}</Badge>}
        />
        <UnifiedCardBody>
          <Stack gap="sm">
            {daemonLanes.length === 0 ? (
              <BodyText>No destination daemon lane health data is available.</BodyText>
            ) : (
              daemonLanes.map((lane) => (
                <UnifiedCardSection key={lane.destinationKey} tone="tactical">
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <Text fw={600}>{lane.destinationKey}</Text>
                        <Badge variant="light" color={laneStatusColor(lane.status)}>
                          {lane.status}
                        </Badge>
                      </Group>
                      <MetaText>
                        defs {lane.activeDefinitionCount} · runs {lane.activeRunCount}
                      </MetaText>
                    </Group>
                    <MetaText>{lane.summary}</MetaText>
                    <Group gap="sm">
                      <MetaText>recoverable: {lane.failedRecoverableCount}</MetaText>
                      <MetaText>paused: {lane.pausedCount}</MetaText>
                      <MetaText>
                        updated: {lane.lastRunUpdatedAt ? new Date(lane.lastRunUpdatedAt).toLocaleString() : "—"}
                      </MetaText>
                    </Group>
                  </Stack>
                </UnifiedCardSection>
              ))
            )}
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

      <UnifiedCard tone="review">
        <UnifiedCardHeader
          title="Operations recovery items"
          supporting={<Badge variant="light" color="review">{operationalItems.length}</Badge>}
        />
        <UnifiedCardBody>
          <Stack gap="sm">
            {operationalItems.length === 0 ? (
              <BodyText>No active operational recovery items right now.</BodyText>
            ) : (
              operationalItems.slice(0, 12).map((item) => (
                <UnifiedCardSection key={item.id} tone="review">
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <Badge variant="light" color={item.severity === "critical" ? "review" : item.severity === "warning" ? "tactical" : "strategy"}>
                          {item.severity}
                        </Badge>
                        <Badge variant="outline" color="gray">
                          {item.status}
                        </Badge>
                      </Group>
                      <MetaText>{item.source}</MetaText>
                    </Group>
                    <BodyText>{item.summary}</BodyText>
                    <MetaText>{item.id}</MetaText>
                    <Group gap="xs">
                      {item.safeActions.map((action) => (
                        <Button
                          key={`${item.id}:${action}`}
                          size="xs"
                          variant="light"
                          color={action === "rollback" ? "review" : action === "cancel" ? "tactical" : "strategy"}
                          loading={actingOperationId === `${item.id}:${action}`}
                          onClick={() => void runOperationAction(item, action)}
                        >
                          {action}
                        </Button>
                      ))}
                    </Group>
                  </Stack>
                </UnifiedCardSection>
              ))
            )}
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

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
