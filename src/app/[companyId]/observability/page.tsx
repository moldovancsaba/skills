'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Group, Loader, SimpleGrid, Stack, Table } from "@mantine/core";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconHeartbeat as Heartbeat, IconListCheck as ListCheck } from "@tabler/icons-react";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText, SectionTitle } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";

export default function ObservabilityPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/observability?companyId=${companyId}`);
        setData(await response.json());
      } finally {
        setLoading(false);
      }
    };
    void run();
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

  return (
    <PageShell width="full">
      <PageHeader
        title="Observability"
        description="Mission control for worker health, queue pressure, scoring integrity, and recent system outcomes."
      />

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={Heartbeat} color="review" label="Guardian State" value={String(heartbeat.healthState || "unknown")} detail={String(heartbeat.healthStage || "—")} />
        <MetricCard icon={Activity} color="checklist" label="Worker Alive" value={heartbeat.workerAlive ? "Yes" : "No"} detail={heartbeat.lastProgressAt || "—"} />
        <MetricCard icon={ListCheck} color="strategy" label="Active Queue Jobs" value={queue.totalActiveJobs ?? 0} detail={`${queue.runningJobs ?? 0} running`} />
        <MetricCard icon={AlertTriangle} color="knowmore" label="Score Health" value={scoreHealth?.overallBand || "UNKNOWN"} detail={`${scoreHealth?.alerts?.length ?? 0} active alerts`} />
      </SimpleGrid>

      {scoreHealth?.alerts?.length ? (
        <Notice title="Top active score-health alert" icon={AlertTriangle} variant="destructive">
          {scoreHealth.alerts[0].message}
        </Notice>
      ) : null}

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
    </PageShell>
  );
}
