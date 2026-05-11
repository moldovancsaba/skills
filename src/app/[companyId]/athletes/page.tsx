'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Badge,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  TextInput,
} from "@mantine/core";
import {
  IconAlertTriangle as AlertTriangle,
  IconClipboardCheck as ClipboardCheck,
  IconRun as Run,
  IconUsers as Users,
} from "@tabler/icons-react";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";

type AthleteMetrics = {
  sleepHours?: number;
  soreness?: number;
  stress?: number;
  mood?: number;
  hydration?: number;
  bodyWeight?: number;
  painArea?: string;
  nutritionNote?: string;
};

type AthleteLog = {
  id: string;
  athleteEmail: string;
  athleteName?: string | null;
  activityType: string;
  title: string;
  notes?: string | null;
  durationMinutes?: number | null;
  readiness?: number | null;
  intensity?: number | null;
  completionState: string;
  metrics?: AthleteMetrics | null;
  createdAt: string;
};

type AthleteSummary = {
  athleteEmail: string;
  athleteName?: string | null;
  totalLogs: number;
  completed: number;
  totalMinutes: number;
  averageReadiness: number | null;
  averageIntensity: number | null;
  averageSleepHours: number | null;
  averageSoreness: number | null;
  averageStress: number | null;
  averageHydration: number | null;
  painReports: number;
};

type TeamPayload = {
  date: string;
  scope: "team";
  logs: AthleteLog[];
  assignedWork: unknown[];
  summary: {
    totalLogs: number;
    completed: number;
    totalMinutes: number;
    averageReadiness: number | null;
    averageIntensity: number | null;
    averageSleepHours: number | null;
    averageSoreness: number | null;
    painReports: number;
  };
  athleteSummaries: AthleteSummary[];
  error?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function AthletesPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [date, setDate] = useState(today());
  const [data, setData] = useState<TeamPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/athlete?companyId=${companyId}&date=${date}&scope=team`);
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }, [companyId, date]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDay();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDay]);

  if (loading) {
    return (
      <PageShell width="full">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </PageShell>
    );
  }

  const summary = data?.summary || {
    totalLogs: 0,
    completed: 0,
    totalMinutes: 0,
    averageReadiness: null,
    averageIntensity: null,
    averageSleepHours: null,
    averageSoreness: null,
    painReports: 0,
  };
  const athleteSummaries = data?.athleteSummaries || [];
  const logs = data?.logs || [];

  return (
    <PageShell width="full">
      <PageHeader
        title="Athlete Records"
        description="Coach view of athlete daily records, completion evidence, readiness, wellness, and pain flags."
        actions={
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.currentTarget.value)}
          />
        }
      />

      {data?.error ? (
        <Notice title="Coach access required">{data.error}</Notice>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={Users} color="checklist" label="Athletes" value={athleteSummaries.length} detail="Reported today" />
        <MetricCard icon={ClipboardCheck} color="knowmore" label="Completed" value={summary.completed} detail={`${summary.totalLogs} records logged`} />
        <MetricCard icon={Run} color="tactical" label="Minutes" value={summary.totalMinutes} detail="Team recorded load" />
        <MetricCard icon={AlertTriangle} color="review" label="Pain Flags" value={summary.painReports} detail={`Sleep ${summary.averageSleepHours ?? "—"}h · soreness ${summary.averageSoreness ?? "—"}`} />
      </SimpleGrid>

      <UnifiedCard tone="checklist">
        <UnifiedCardHeader title="Athlete Daily Summary" supporting={<Badge variant="light" color="checklist">{athleteSummaries.length} athletes</Badge>} />
        <UnifiedCardBody>
          {athleteSummaries.length === 0 ? (
            <Notice title="No athlete records">No athletes have recorded activity for this date yet.</Notice>
          ) : (
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Athlete</Table.Th>
                  <Table.Th>Records</Table.Th>
                  <Table.Th>Minutes</Table.Th>
                  <Table.Th>Readiness</Table.Th>
                  <Table.Th>Intensity</Table.Th>
                  <Table.Th>Sleep</Table.Th>
                  <Table.Th>Soreness</Table.Th>
                  <Table.Th>Pain</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {athleteSummaries.map((athlete) => (
                  <Table.Tr key={athlete.athleteEmail}>
                    <Table.Td>
                      <Stack gap={2}>
                        <BodyText>{athlete.athleteName || athlete.athleteEmail}</BodyText>
                        <MetaText>{athlete.athleteEmail}</MetaText>
                      </Stack>
                    </Table.Td>
                    <Table.Td>{athlete.totalLogs}</Table.Td>
                    <Table.Td>{athlete.totalMinutes}</Table.Td>
                    <Table.Td>{athlete.averageReadiness ?? "—"}</Table.Td>
                    <Table.Td>{athlete.averageIntensity ?? "—"}</Table.Td>
                    <Table.Td>{athlete.averageSleepHours ?? "—"}</Table.Td>
                    <Table.Td>{athlete.averageSoreness ?? "—"}</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={athlete.painReports ? "review" : "gray"}>
                        {athlete.painReports}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </UnifiedCardBody>
      </UnifiedCard>

      <UnifiedCard tone="review">
        <UnifiedCardHeader title="Recent Athlete Entries" supporting={<Badge variant="light" color="review">{logs.length} entries</Badge>} />
        <UnifiedCardBody>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Athlete</Table.Th>
                <Table.Th>Activity</Table.Th>
                <Table.Th>Load</Table.Th>
                <Table.Th>Wellness</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logs.map((log) => (
                <Table.Tr key={log.id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <BodyText>{log.athleteName || log.athleteEmail}</BodyText>
                      <MetaText>{log.athleteEmail}</MetaText>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Badge variant="outline" color="gray">{log.activityType}</Badge>
                        <BodyText>{log.title}</BodyText>
                      </Group>
                      {log.notes ? <MetaText lineClamp={1}>{log.notes}</MetaText> : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <MetaText>{log.durationMinutes ?? "—"} min · intensity {log.intensity ?? "—"}</MetaText>
                  </Table.Td>
                  <Table.Td>
                    <MetaText>
                      Readiness {log.readiness ?? "—"} · sleep {log.metrics?.sleepHours ?? "—"}h · sore {log.metrics?.soreness ?? "—"}
                    </MetaText>
                    {log.metrics?.painArea ? <MetaText c="var(--mantine-color-review-4)">Pain: {log.metrics.painArea}</MetaText> : null}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={log.completionState === "COMPLETED" ? "knowmore" : "gray"}>
                      {log.completionState}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </UnifiedCardBody>
      </UnifiedCard>
    </PageShell>
  );
}
