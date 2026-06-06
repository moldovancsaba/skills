'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Loader, Stack, Center } from "@mantine/core";
import {
  IconActivityHeartbeat as ActivityHeartbeat,
  IconBell as Bell,
  IconBrain as Brain,
  IconBriefcase as Briefcase,
  IconExternalLink as ExternalLink,
  IconRefresh as Refresh,
  IconRoute as Route,
  IconShieldCheck as ShieldCheck,
} from "@tabler/icons-react";
import { EmptyState, MetricCard, MetricGrid, PageHeader, PageShell, UnifiedGrid } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { BodyText, LabelText, MetaText, SectionTitle } from "@/components/ui/typography";

type OperationsSeverity = "info" | "warning" | "critical";

type OperationsAction = {
  label: string;
  method: "GET" | "POST" | "PATCH";
  href: string;
  body?: Record<string, unknown>;
  requiresConfirmation: boolean;
};

type OperationsItem = {
  id: string;
  source: "opportunity" | "runtime" | "destination" | "content" | "notification" | "learning";
  severity: OperationsSeverity;
  title: string;
  summary: string;
  metric: number;
  updatedAt: string | null;
  actions: OperationsAction[];
};

type CustomerOperationsSummary = {
  version: string;
  companyId: string;
  generatedAt: string;
  health: "healthy" | "warning" | "critical";
  summary: {
    issues: number;
    opportunities: number;
    acceptedOpportunitycards: number;
    highValueReady: number;
    failedJobs: number;
    reviewPressure: number;
    failedDestinations: number;
    learningLessons: number;
    notificationsReady: boolean;
  };
  items: OperationsItem[];
  topOpportunities: Array<{
    id: string;
    companyName: string;
    title: string;
    iceScore: number;
    processingStatus: string;
    kanbanColumn: string;
    updatedAt: string;
  }>;
  learningMemory: Array<{
    id: string;
    lessonType: string;
    lessonContent: string;
    weight: number;
    updatedAt: string;
  }>;
};

const severityTone: Record<OperationsSeverity, "neutral" | "review" | "tactical"> = {
  info: "neutral",
  warning: "review",
  critical: "tactical",
};

const sourceIcon = {
  opportunity: Briefcase,
  runtime: ActivityHeartbeat,
  destination: Route,
  content: ShieldCheck,
  notification: Bell,
  learning: Brain,
};

function formatTime(value: string | null) {
  if (!value) return "No timestamp";
  return new Date(value).toLocaleString();
}

export default function CustomerOperationsClient({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<CustomerOperationsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}/customer-operations`);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "Customer operations could not be loaded");
    }
    return response.json() as Promise<CustomerOperationsSummary>;
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await load();
        if (!cancelled) setSummary(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setSummary(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const healthLabel = useMemo(() => {
    if (!summary) return "Loading";
    if (summary.health === "healthy") return "Healthy";
    if (summary.health === "critical") return "Critical";
    return "Needs attention";
  }, [summary]);

  if (loading) {
    return (
      <Center py="xl">
        <Loader color="strategy" />
      </Center>
    );
  }

  return (
    <PageShell width="full">
      <PageHeader
        title="Customer Operations"
        description="Customer-value cockpit for lead readiness, runtime pressure, destination work, learning memory, and notification readiness."
        actions={
          <Button variant="light" color="gray" leftSection={<Refresh size={14} />} onClick={() => void handleRefresh()} loading={refreshing}>
            Refresh
          </Button>
        }
      />

      {error ? (
        <EmptyState
          icon={ActivityHeartbeat}
          title="Operations unavailable"
          description={error}
          tone="review"
        />
      ) : null}

      {summary ? (
        <Stack gap="xl">
          <MetricGrid cols={{ base: 1, sm: 2, xl: 4 }}>
            <MetricCard icon={ActivityHeartbeat} color={summary.health === "critical" ? "tactical" : summary.health === "warning" ? "review" : "strategy"} label="System Health" value={healthLabel} detail={summary.version} />
            <MetricCard icon={Briefcase} color="strategy" label="High-Value Leads" value={summary.summary.highValueReady} detail={`${summary.summary.acceptedOpportunitycards} accepted`} />
            <MetricCard icon={Route} color="review" label="Ops Pressure" value={summary.summary.failedJobs + summary.summary.reviewPressure + summary.summary.failedDestinations} detail="runtime and destination" />
            <MetricCard icon={Brain} color="knowmore" label="Learning Memory" value={summary.summary.learningLessons} detail="active opportunity lessons" />
          </MetricGrid>

          <UnifiedGrid cols={{ base: 1, xl: 2 }}>
            {summary.items.map((item) => {
              const Icon = sourceIcon[item.source];
              return (
                <UnifiedCard key={item.id} tone={severityTone[item.severity]}>
                  <UnifiedCardHeader
                    supporting={
                      <>
                        <Badge color={item.severity === "critical" ? "red" : item.severity === "warning" ? "yellow" : "gray"} variant="light">{item.severity}</Badge>
                        <Badge color="gray" variant="outline">{item.source}</Badge>
                      </>
                    }
                    title={item.title}
                    description={item.summary}
                    actions={<Icon size={18} aria-hidden="true" />}
                  />
                  <UnifiedCardBody>
                    <Stack gap="md">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <LabelText>Metric</LabelText>
                          <SectionTitle>{item.metric}</SectionTitle>
                        </Stack>
                        <MetaText>{formatTime(item.updatedAt)}</MetaText>
                      </Group>
                      <Group gap="xs">
                        {item.actions.map((action) => (
                          <Button
                            key={`${item.id}:${action.label}`}
                            component="a"
                            href={action.href}
                            variant="light"
                            color={action.requiresConfirmation ? "yellow" : "gray"}
                            leftSection={<ExternalLink size={14} />}
                            aria-label={`${action.label} for ${item.title}`}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </Group>
                    </Stack>
                  </UnifiedCardBody>
                </UnifiedCard>
              );
            })}
          </UnifiedGrid>

          <UnifiedGrid cols={{ base: 1, xl: 2 }}>
            <UnifiedCard tone="strategy">
              <UnifiedCardHeader title="Top Opportunities" description="Highest scored customer-facing sales opportunities." />
              <UnifiedCardBody>
                <Stack gap="sm">
                  {summary.topOpportunities.length > 0 ? summary.topOpportunities.map((item) => (
                    <Group key={item.id} justify="space-between" align="flex-start">
                      <Stack gap={2}>
                        <BodyText>{item.companyName}</BodyText>
                        <MetaText>{item.title}</MetaText>
                      </Stack>
                      <Badge color="strategy" variant="light">ICE {item.iceScore}</Badge>
                    </Group>
                  )) : <BodyText>No active opportunities are available.</BodyText>}
                </Stack>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="knowmore">
              <UnifiedCardHeader title="Learning Memory" description="Recent outcome lessons used to improve scoring and search behavior." />
              <UnifiedCardBody>
                <Stack gap="sm">
                  {summary.learningMemory.length > 0 ? summary.learningMemory.map((lesson) => (
                    <Stack key={lesson.id} gap={2}>
                      <Group gap="xs">
                        <Badge color="knowmore" variant="light">{lesson.lessonType}</Badge>
                        <MetaText>Weight {lesson.weight}</MetaText>
                      </Group>
                      <BodyText>{lesson.lessonContent}</BodyText>
                    </Stack>
                  )) : <BodyText>No outcome lessons have been captured yet.</BodyText>}
                </Stack>
              </UnifiedCardBody>
            </UnifiedCard>
          </UnifiedGrid>
        </Stack>
      ) : null}
    </PageShell>
  );
}
