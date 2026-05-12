'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button, Group, Loader, SimpleGrid, Stack, Table } from "@mantine/core";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCoins as Coins, IconGauge as Gauge, IconHeartbeat as Heartbeat, IconListCheck as ListCheck, IconRefresh as RefreshIcon, IconStethoscope as Stethoscope } from "@tabler/icons-react";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";

export default function ObservabilityPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/observability?companyId=${companyId}`);
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const runAction = useCallback(async (action: string) => {
    setActionLoading(action);
    try {
      const response = await fetch("/api/observability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, action }),
      });
      setData(await response.json());
    } finally {
      setActionLoading(null);
    }
  }, [companyId]);

  if (loading) {
    return (
      <PageShell width="full">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </PageShell>
    );
  }

  const heartbeat = data?.guardianHeartbeat || {};
  const queue = data?.queue || { jobs: [] };
  const scoreHealth = data?.scoreHealth || null;
  const budget = data?.budget || { pressure: "UNKNOWN", usageByFeature: [], openEvents: [], recommendations: [] };

  return (
    <PageShell width="full">
      <PageHeader
        title="Observability"
        description="Mission control for worker health, queue pressure, scoring integrity, and recent system outcomes."
        actions={
          <Button
            size="xs"
            variant="light"
            color="review"
            leftSection={<Stethoscope size={14} />}
            onClick={() => router.push(`/${companyId}/evaluations`)}
          >
            Internal Evaluation Bench
          </Button>
        }
      />

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={Heartbeat} color="review" label="Guardian State" value={String(heartbeat.healthState || "unknown")} detail={String(heartbeat.healthStage || "—")} />
        <MetricCard icon={Activity} color="checklist" label="Worker Alive" value={heartbeat.workerAlive ? "Yes" : "No"} detail={heartbeat.lastProgressAt || "—"} />
        <MetricCard icon={ListCheck} color="strategy" label="Active Queue Jobs" value={queue.totalActiveJobs ?? 0} detail={`${queue.runningJobs ?? 0} running`} />
        <MetricCard icon={AlertTriangle} color="knowmore" label="Score Health" value={scoreHealth?.overallBand || "UNKNOWN"} detail={`${scoreHealth?.alerts?.length ?? 0} active alerts`} />
        <MetricCard icon={Coins} color="tactical" label="Budget Pressure" value={budget.pressure || "UNKNOWN"} detail={`$${budget.totalEstimatedCost ?? 0} est · ${budget.totalWorkloadUnits ?? 0} units`} />
      </SimpleGrid>

      {scoreHealth?.alerts?.length ? (
        <Notice title="Top active score-health alert" icon={AlertTriangle} variant="destructive">
          {scoreHealth.alerts[0].message}
        </Notice>
      ) : null}

      <UnifiedCard tone="review">
        <UnifiedCardHeader title="Repair Actions" />
        <UnifiedCardBody>
          <Group gap="sm">
            <Button
              leftSection={<RefreshIcon size={16} />}
              variant="light"
              color="review"
              loading={actionLoading === "SYNC_QUEUE"}
              onClick={() => void runAction("SYNC_QUEUE")}
            >
              Sync Queue
            </Button>
            <Button
              leftSection={<Stethoscope size={16} />}
              variant="light"
              color="strategy"
              disabled={!data?.recommendedActions?.escalateScoreRepair}
              loading={actionLoading === "ESCALATE_SCORE_REPAIR"}
              onClick={() => void runAction("ESCALATE_SCORE_REPAIR")}
            >
              Escalate Score Repair
            </Button>
            <Button
              leftSection={<AlertTriangle size={16} />}
              variant="light"
              color="checklist"
              disabled={!data?.recommendedActions?.recoverFailedJobs}
              loading={actionLoading === "RECOVER_FAILED_JOBS"}
              onClick={() => void runAction("RECOVER_FAILED_JOBS")}
            >
              Recover Failed Jobs
            </Button>
          </Group>
        </UnifiedCardBody>
      </UnifiedCard>

      <UnifiedCard tone="tactical">
        <UnifiedCardHeader
          title="Budget Governor"
          supporting={<Badge variant="light" color="tactical">{budget.windowHours || 24}h window</Badge>}
        />
        <UnifiedCardBody>
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
              <Button
                leftSection={<Gauge size={16} />}
                variant="light"
                color="tactical"
                loading={actionLoading === "BUDGET_THROTTLE_QUEUE"}
                onClick={() => void runAction("BUDGET_THROTTLE_QUEUE")}
              >
                Throttle Queue
              </Button>
              <Button
                leftSection={<RefreshIcon size={16} />}
                variant="light"
                color="strategy"
                loading={actionLoading === "BUDGET_BATCH_EVALUATIONS"}
                onClick={() => void runAction("BUDGET_BATCH_EVALUATIONS")}
              >
                Batch Evaluations
              </Button>
              <Button
                leftSection={<Coins size={16} />}
                variant="light"
                color="knowmore"
                loading={actionLoading === "BUDGET_CACHE_REUSE"}
                onClick={() => void runAction("BUDGET_CACHE_REUSE")}
              >
                Cache / Reuse Ops
              </Button>
            </SimpleGrid>

            {(budget.recommendations || []).length ? (
              <Stack gap="xs">
                {(budget.recommendations || []).slice(0, 4).map((event: any, index: number) => (
                  <Group key={`${event.eventType}-${index}`} justify="space-between" align="flex-start">
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Group gap="xs">
                        <Badge variant="light" color={event.severity === "CRITICAL" ? "review" : "tactical"}>{event.severity}</Badge>
                        <Badge variant="outline" color="gray">{event.feature}</Badge>
                        <Badge variant="outline" color="gray">{event.valueAssessment}</Badge>
                      </Group>
                      <BodyText>{event.recommendation}</BodyText>
                    </Stack>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Notice title="Budget pressure normal">No budget anomalies detected for the current 24-hour window.</Notice>
            )}
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <UnifiedCard tone="review">
          <UnifiedCardHeader title="Active Queue Work" />
          <UnifiedCardBody>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Column</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(queue.jobs || []).map((job: any) => (
                  <Table.Tr key={job.id}>
                    <Table.Td>{job.jobType}</Table.Td>
                    <Table.Td>{job.queueColumn}</Table.Td>
                    <Table.Td>{job.status}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="knowmore">
          <UnifiedCardHeader title="Recent Outcome Events" />
          <UnifiedCardBody>
            <Stack gap="sm">
              {(data?.recentEvents || []).map((event: any) => (
                <Stack key={event.id} gap={2}>
                  <Group gap="xs">
                    <Badge variant="light" color="gray">{event.outcomeType}</Badge>
                    <MetaText>{new Date(event.createdAt).toLocaleString()}</MetaText>
                  </Group>
                  <BodyText>{event.outcomeValue || event.entityType}</BodyText>
                </Stack>
              ))}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      </SimpleGrid>

      <UnifiedCard tone="tactical">
        <UnifiedCardHeader title="Workload Attribution" supporting={<Badge variant="light" color="tactical">{budget.usageCount || 0} records</Badge>} />
        <UnifiedCardBody>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Feature</Table.Th>
                <Table.Th>Estimated</Table.Th>
                <Table.Th>Units</Table.Th>
                <Table.Th>Runtime</Table.Th>
                <Table.Th>Retries</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(budget.usageByFeature || []).map((usage: any) => (
                <Table.Tr key={usage.feature}>
                  <Table.Td>{usage.feature}</Table.Td>
                  <Table.Td>${usage.estimatedCost ?? 0}</Table.Td>
                  <Table.Td>{Math.round((usage.workloadUnits || 0) * 10) / 10}</Table.Td>
                  <Table.Td>{Math.round((usage.runtimeMs || 0) / 1000)}s</Table.Td>
                  <Table.Td>{usage.retryCount || 0}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </UnifiedCardBody>
      </UnifiedCard>
    </PageShell>
  );
}
