'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Box, Button, Group, Loader, Select, SimpleGrid, Stack, Table } from "@/components/gds/primitives";
import { IconActivity as Activity, IconRefresh as RefreshIcon, IconStethoscope as Stethoscope } from "@/components/gds/icons";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/gds/charts";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { SEMANTIC_CHART_BAR_RADIUS, SEMANTIC_CHART_GRID_STROKE } from "@/lib/semantic-theme";

type DashboardPayload = {
  generatedAt: string;
  range: {
    start: string;
    end: string;
    hours: number;
    timezone: string;
  };
  created: {
    total: number;
    buckets: Array<Record<string, string | number>>;
    totals: Record<string, number>;
    sources: Array<{ key: string; label: string; collection: string; total: number }>;
  };
  updated: {
    total: number;
    buckets: Array<Record<string, string | number>>;
    totals: Record<string, number>;
    sources: Array<{ key: string; label: string; collection: string; total: number }>;
  };
  recentSamples: Array<{
    id: string;
    family: string;
    label: string;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
};

const CREATED_SERIES = [
  { key: "datacards", name: "Datacards", color: "var(--mantine-color-cyan-6)" },
  { key: "files", name: "Files", color: "var(--mantine-color-blue-6)" },
  { key: "flashcards", name: "Flashcards", color: "var(--mantine-color-lime-6)" },
  { key: "goals", name: "Goals", color: "var(--mantine-color-violet-6)" },
  { key: "tasks", name: "Tasks", color: "var(--mantine-color-orange-6)" },
  { key: "opportunities", name: "Opportunities", color: "var(--mantine-color-pink-6)" },
  { key: "destinationCandidates", name: "Candidates", color: "var(--mantine-color-teal-6)" },
  { key: "destinationDrafts", name: "Drafts", color: "var(--mantine-color-grape-6)" },
] as const;

const UPDATED_SERIES = [
  { key: "datacards", name: "Datacards", color: "var(--mantine-color-cyan-6)" },
  { key: "flashcards", name: "Flashcards", color: "var(--mantine-color-lime-6)" },
  { key: "goals", name: "Goals", color: "var(--mantine-color-violet-6)" },
  { key: "tasks", name: "Tasks", color: "var(--mantine-color-orange-6)" },
  { key: "opportunities", name: "Opportunities", color: "var(--mantine-color-pink-6)" },
  { key: "feedback", name: "Feedback", color: "var(--mantine-color-yellow-6)" },
  { key: "actions", name: "Actions", color: "var(--mantine-color-blue-6)" },
  { key: "corrections", name: "Corrections", color: "var(--mantine-color-red-6)" },
  { key: "auditEvents", name: "Audit events", color: "var(--mantine-color-teal-6)" },
] as const;

const WINDOW_OPTIONS = [
  { value: "24", label: "Last 24 hours" },
  { value: "48", label: "Last 48 hours" },
  { value: "72", label: "Last 72 hours" },
  { value: "168", label: "Last 7 days" },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function tooltipFormatter(value: unknown, name: unknown) {
  return [typeof value === "number" ? value : Number(value || 0), String(name || "Activity")];
}

function totalActiveHours(buckets: Array<Record<string, string | number>>) {
  return buckets.filter((bucket) => Number(bucket.total || 0) > 0).length;
}

function HealthChart({
  title,
  description,
  data,
  series,
}: {
  title: string;
  description: string;
  data: Array<Record<string, string | number>>;
  series: ReadonlyArray<{ key: string; name: string; color: string }>;
}) {
  return (
    <UnifiedCard>
      <UnifiedCardHeader title={title} supporting={<Badge variant="light" color="tactical">hourly</Badge>} />
      <UnifiedCardBody>
        <Stack gap="sm">
          <MetaText>{description}</MetaText>
          <Box h={360} w="100%" miw={1} aria-label={title} role="img">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 16, left: -18, bottom: 64 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={SEMANTIC_CHART_GRID_STROKE} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" angle={-35} textAnchor="end" height={72} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip formatter={tooltipFormatter} />
                <Legend />
                {series.map((entry) => (
                  <Bar
                    key={entry.key}
                    dataKey={entry.key}
                    name={entry.name}
                    stackId="activity"
                    fill={entry.color}
                    radius={SEMANTIC_CHART_BAR_RADIUS}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}

export default function OperatorContentHealthPage() {
  const [hours, setHours] = useState("24");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/operator/content-health?hours=${encodeURIComponent(hours)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Request failed with ${response.status}`);
      }
      setDashboard(payload.dashboard);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    const timer = window.setInterval(loadDashboard, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadDashboard]);

  const topSources = useMemo(() => {
    const rows = [
      ...(dashboard?.created.sources || []).map((source) => ({ ...source, lane: "Created" })),
      ...(dashboard?.updated.sources || []).map((source) => ({ ...source, lane: "Updated" })),
    ];
    return rows.sort((left, right) => right.total - left.total).slice(0, 12);
  }, [dashboard]);

  if (loading && !dashboard) {
    return (
      <PageShell width="full">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <PageHeader
        title="System Activity Dashboard"
        description="Hourly health signal for new content creation and card update activity across the whole system."
        actions={
          <Group gap="xs" align="end">
            <Select
              label="Window"
              size="xs"
              value={hours}
              onChange={(value) => setHours(value || "24")}
              data={WINDOW_OPTIONS}
              allowDeselect={false}
              w={160}
            />
            <Button size="xs" variant="light" leftSection={<RefreshIcon size={14} />} onClick={loadDashboard} loading={loading}>
              Refresh
            </Button>
          </Group>
        }
      />

      {error ? (
        <Notice title="Dashboard unavailable" variant="destructive">{error}</Notice>
      ) : null}

      {dashboard ? (
        <Stack gap="lg" aria-live="polite">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            <MetricCard icon={Activity} color="strategy" label="Created content" value={dashboard.created.total} detail={`${totalActiveHours(dashboard.created.buckets)} active hour(s)`} />
            <MetricCard icon={Stethoscope} color="tactical" label="Updated activity" value={dashboard.updated.total} detail={`${totalActiveHours(dashboard.updated.buckets)} active hour(s)`} />
            <MetricCard icon={Activity} color="knowmore" label="Recent samples" value={dashboard.recentSamples.length} detail="latest cards and outcomes" />
            <MetricCard icon={Stethoscope} color="review" label="Generated at" value={formatDateTime(dashboard.generatedAt)} detail={dashboard.range.timezone} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <HealthChart
              title="New Created Content"
              description="Everything newly created by the system, grouped by content family."
              data={dashboard.created.buckets}
              series={CREATED_SERIES}
            />
            <HealthChart
              title="Updated Cards And Feedback"
              description="Cards with post-creation updates plus accept, decline, fine-tune, correction, comment, feedback, and audit activity."
              data={dashboard.updated.buckets}
              series={UPDATED_SERIES}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <UnifiedCard>
              <UnifiedCardHeader title="Top Activity Sources" supporting={<Badge variant="light" color="strategy">ranked</Badge>} />
              <UnifiedCardBody>
                <Table.ScrollContainer minWidth={620}>
                  <Table verticalSpacing="xs">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Lane</Table.Th>
                        <Table.Th>Source</Table.Th>
                        <Table.Th>Collection</Table.Th>
                        <Table.Th style={{ textAlign: "right" }}>Count</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {topSources.map((source) => (
                        <Table.Tr key={`${source.lane}-${source.collection}-${source.label}`}>
                          <Table.Td><Badge variant="light" color={source.lane === "Created" ? "strategy" : "tactical"}>{source.lane}</Badge></Table.Td>
                          <Table.Td>{source.label}</Table.Td>
                          <Table.Td><MetaText>{source.collection}</MetaText></Table.Td>
                          <Table.Td style={{ textAlign: "right" }}>{source.total}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard>
              <UnifiedCardHeader title="Latest Activity Samples" supporting={<Badge variant="light" color="knowmore">recent</Badge>} />
              <UnifiedCardBody>
                <Stack gap="sm">
                  {dashboard.recentSamples.length ? dashboard.recentSamples.map((sample) => (
                    <Box key={`${sample.family}-${sample.id}`} p="sm" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 8 }}>
                      <Group justify="space-between" align="flex-start" gap="sm">
                        <Stack gap={2}>
                          <BodyText>{sample.label}</BodyText>
                          <MetaText>{sample.family}</MetaText>
                        </Stack>
                        <MetaText>{formatDateTime(sample.updatedAt || sample.createdAt)}</MetaText>
                      </Group>
                    </Box>
                  )) : (
                    <Notice title="No recent activity">No matching content or card update activity was found in the selected window.</Notice>
                  )}
                </Stack>
              </UnifiedCardBody>
            </UnifiedCard>
          </SimpleGrid>
        </Stack>
      ) : null}
    </PageShell>
  );
}
