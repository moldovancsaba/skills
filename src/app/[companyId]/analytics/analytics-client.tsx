"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Group, Loader, SimpleGrid, Stack, Center } from "@/components/gds/primitives";
import { IconActivity as Activity, IconChartBar as ChartBar, IconClockHour4 as Clock, IconListCheck as ListCheck, IconRefresh as RefreshIcon } from "@/components/gds/icons";
import { GdsReportingBarChart, GdsReportingSection } from "@/components/gds/reporting";
import { EmptyState, MetricCard, MetricGrid, PageHeader, PageShell } from "@/components/ui/app-shell";

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
          <GdsReportingSection
            title="Throughput"
            description="Created, accepted, declined, and delivered task events over the selected window."
            state={data.throughputSeries.length ? "ready" : "empty"}
            stateMessage="No throughput events are available for this window."
            periodControl={data.window}
            chart={
              <GdsReportingBarChart
                type="stacked-bar"
                title="Throughput"
                summary="Task lifecycle events by day."
                data={data.throughputSeries.flatMap((point) => [
                  { label: point.date, group: "created", value: point.created },
                  { label: point.date, group: "accepted", value: point.accepted },
                  { label: point.date, group: "declined", value: point.declined },
                  { label: point.date, group: "delivered", value: point.delivered },
                ])}
                config={{ minDataPoints: 1, groupLabel: "Event", tableValueHeader: "Tasks" }}
              />
            }
          />

          <GdsReportingSection
            title="Lane Distribution"
            description="Current active planning load by lane."
            state={data.laneCounts.length ? "ready" : "empty"}
            stateMessage="No active lane data is available."
            chart={
              <GdsReportingBarChart
                title="Lane Distribution"
                summary="Current active planning load by lane."
                data={data.laneCounts.map((point) => ({ label: point.name, value: point.value }))}
                config={{ minDataPoints: 1, tableValueHeader: "Tasks" }}
              />
            }
          />

          <GdsReportingSection
            title="Lifecycle Distribution"
            description="Current active task population by canonical lifecycle state."
            state={data.lifecycleCounts.length ? "ready" : "empty"}
            stateMessage="No active lifecycle data is available."
            chart={
              <GdsReportingBarChart
                title="Lifecycle Distribution"
                summary="Current active task population by canonical lifecycle state."
                data={data.lifecycleCounts.map((point) => ({ label: point.name, value: point.value }))}
                config={{ minDataPoints: 1, tableValueHeader: "Tasks" }}
              />
            }
          />

          <GdsReportingSection
            title="ICE Distribution"
            description="Current active task distribution by ICE band."
            state={data.scoreBuckets.length ? "ready" : "empty"}
            stateMessage="No active ICE score buckets are available."
            chart={
              <GdsReportingBarChart
                title="ICE Distribution"
                summary="Current active task distribution by ICE band."
                data={data.scoreBuckets.map((point) => ({ label: point.name, value: point.value }))}
                config={{ minDataPoints: 1, tableValueHeader: "Tasks" }}
              />
            }
          />
        </SimpleGrid>
      </Stack>
    </PageShell>
  );
}
