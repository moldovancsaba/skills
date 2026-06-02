"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Group, Loader, SimpleGrid, Stack, Center } from "@mantine/core";
import { IconActivity as Activity, IconChartBar as ChartBar, IconClockHour4 as Clock, IconListCheck as ListCheck, IconRefresh as RefreshIcon } from "@tabler/icons-react";
import { EmptyState, MetricCard, MetricGrid, PageHeader, PageShell } from "@/components/ui/app-shell";
import { Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { SEMANTIC_CHART_BAR_RADIUS_COMPACT, SEMANTIC_CHART_GRID_STROKE } from "@/lib/semantic-theme";

type WindowKey = "7d" | "30d" | "90d";

type AnalyticsResponse = {
  company: {
    id: string;
    name: string;
    industry?: string | null;
  } | null;
  window: WindowKey;
  metrics: {
    activeTasks: number;
    checklistReady: number;
    evaluatedOrDelivered: number;
    avgIceScore: number;
    avgConfidenceScore: number;
    acceptedCount: number;
    deliveredCount: number;
    declinedCount: number;
  };
  laneCounts: Array<{ name: string; value: number }>;
  lifecycleCounts: Array<{ name: string; value: number }>;
  scoreBuckets: Array<{ name: string; value: number }>;
  throughputSeries: Array<{
    date: string;
    created: number;
    accepted: number;
    declined: number;
    delivered: number;
  }>;
};

const WINDOW_OPTIONS: Array<{ key: WindowKey; label: string }> = [
  { key: "7d", label: "Weekly" },
  { key: "30d", label: "Monthly" },
  { key: "90d", label: "Quarterly" },
];

function AxisTick({ x, y, payload }: any) {
  return (
    <text x={x} y={y} dy={14} textAnchor="middle" fill="currentColor" fontSize={11}>
      {String(payload?.value || "").slice(5)}
    </text>
  );
}

type CompanyAnalyticsPageProps = {
  companyId: string;
};

export default function CompanyAnalyticsPage({ companyId }: CompanyAnalyticsPageProps) {
  const router = useRouter();
  
  const [windowKey, setWindowKey] = useState<WindowKey>("30d");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  const load = useCallback(async (nextWindow: WindowKey) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/companies/${companyId}/analytics?window=${nextWindow}`);
      if (response.status === 404 || response.status === 403) {
        router.push("/");
        return;
      }
      const payload = await response.json();
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, [companyId, router]);

  useEffect(() => {
    if (!companyId) return;
    const timer = window.setTimeout(() => {
      void load(windowKey);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [companyId, load, windowKey]);

  if (loading && !data) {
    return (
      <PageShell width="full">
        <Center py="xl">
          <Loader color="strategy" />
        </Center>
      </PageShell>
    );
  }

  if (!data || data.metrics.activeTasks === 0) {
    return (
      <PageShell width="full">
        <Stack gap="xl">
          <PageHeader
            title="Analytics"
            description="Planning and checklist telemetry over the live company task system."
            actions={
              <Group gap="sm">
                {WINDOW_OPTIONS.map((option) => (
                  <Button
                    key={option.key}
                    size="xs"
                    variant={windowKey === option.key ? "filled" : "light"}
                    color="strategy"
                    onClick={() => setWindowKey(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </Group>
            }
          />
          <EmptyState
            icon={ChartBar}
            title="No planning analytics yet"
            description="Create or surface checklist tasks first. This page is driven from live company task and feedback records."
            tone="strategy"
          />
        </Stack>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PageHeader
          title="Analytics"
          description={`Planning and checklist telemetry for ${data.company?.name || "this company"} over the live task system.`}
          actions={
            <Group gap="sm">
              {WINDOW_OPTIONS.map((option) => (
                <Button
                  key={option.key}
                  size="xs"
                  variant={windowKey === option.key ? "filled" : "light"}
                  color="strategy"
                  onClick={() => setWindowKey(option.key)}
                >
                  {option.label}
                </Button>
              ))}
              <Button
                size="xs"
                variant="light"
                color="gray"
                leftSection={<RefreshIcon size={14} />}
                onClick={() => void load(windowKey)}
              >
                Refresh
              </Button>
            </Group>
          }
        />

        <MetricGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          <MetricCard icon={ListCheck} color="checklist" label="Active Tasks" value={data.metrics.activeTasks} detail="current planning and checklist surface" />
          <MetricCard icon={Clock} color="tactical" label="Checklist Ready" value={data.metrics.checklistReady} detail="currently in the checklist lane" />
          <MetricCard icon={Activity} color="review" label="Accepted" value={data.metrics.acceptedCount} detail={`${data.window} operator accepts`} />
          <MetricCard icon={ChartBar} color="strategy" label="Delivered" value={data.metrics.deliveredCount} detail={`${data.window} delivery confirmations`} />
          <MetricCard icon={ChartBar} color="knowmore" label="Declined" value={data.metrics.declinedCount} detail={`${data.window} negative signals`} />
          <MetricCard icon={Activity} color="strategy" label="Evaluated" value={data.metrics.evaluatedOrDelivered} detail="evaluated or delivered active candidates" />
          <MetricCard icon={ChartBar} color="review" label="Avg ICE" value={data.metrics.avgIceScore} detail="active task ICE average" />
          <MetricCard icon={ChartBar} color="knowmore" label="Avg Confidence" value={data.metrics.avgConfidenceScore} detail="active task confidence average" />
        </MetricGrid>

        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
          <UnifiedCard tone="strategy">
            <UnifiedCardHeader title="Throughput" supporting={<Text size="sm">{data.window}</Text>} />
            <UnifiedCardBody>
              <Stack gap="sm">
                <Text size="sm">Created, accepted, declined, and delivered task events over the selected window.</Text>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.throughputSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke={SEMANTIC_CHART_GRID_STROKE} />
                    <XAxis dataKey="date" tick={<AxisTick />} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="created" fill="var(--mantine-color-strategy-6)" radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT} />
                    <Bar dataKey="accepted" fill="var(--mantine-color-review-6)" radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT} />
                    <Bar dataKey="declined" fill="var(--mantine-color-knowmore-6)" radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT} />
                    <Bar dataKey="delivered" fill="var(--mantine-color-checklist-6)" radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT} />
                  </BarChart>
                </ResponsiveContainer>
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>

          <UnifiedCard tone="tactical">
            <UnifiedCardHeader title="Lane Distribution" />
            <UnifiedCardBody>
              <Stack gap="sm">
                <Text size="sm">Current active planning load by lane.</Text>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.laneCounts}>
                    <CartesianGrid strokeDasharray="3 3" stroke={SEMANTIC_CHART_GRID_STROKE} />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--mantine-color-tactical-6)" radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT} />
                  </BarChart>
                </ResponsiveContainer>
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>

          <UnifiedCard tone="review">
            <UnifiedCardHeader title="Lifecycle Distribution" />
            <UnifiedCardBody>
              <Stack gap="sm">
                <Text size="sm">Current active task population by canonical lifecycle state.</Text>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.lifecycleCounts}>
                    <CartesianGrid strokeDasharray="3 3" stroke={SEMANTIC_CHART_GRID_STROKE} />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--mantine-color-review-6)" radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT} />
                  </BarChart>
                </ResponsiveContainer>
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>

          <UnifiedCard tone="knowmore">
            <UnifiedCardHeader title="ICE Distribution" />
            <UnifiedCardBody>
              <Stack gap="sm">
                <Text size="sm">Current active task distribution by ICE band.</Text>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.scoreBuckets}>
                    <CartesianGrid strokeDasharray="3 3" stroke={SEMANTIC_CHART_GRID_STROKE} />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--mantine-color-knowmore-6)" radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT} />
                  </BarChart>
                </ResponsiveContainer>
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>
        </SimpleGrid>
      </Stack>
    </PageShell>
  );
}
