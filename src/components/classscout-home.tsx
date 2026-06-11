'use client';

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Center, Group, Loader, SimpleGrid, Stack } from "@/components/gds/primitives";
import {
  IconActivity as Activity,
  IconBook2 as Book,
  IconHistory as History,
  IconLayoutKanban as Kanban,
  IconRefresh as Refresh,
  IconRadar2 as Radar,
  IconRocket as Rocket,
} from "@/components/gds/icons";
import { EmptyState, LinkCard, MetricCard, Notice, PageHeader, PageShell, RouteCardGrid } from "@/components/ui/app-shell";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";
import { logClientInteraction } from "@/lib/client-events";
import type { ClassScoutLandingSummary } from "@/lib/classscout-landing";

const ACTION_ICON = {
  "content-ops": History,
  "live-queue": Book,
  "project-board": Kanban,
  "mission-control": Radar,
  "visitor-ops": Rocket,
} as const;

function pct(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export function ClassScoutHome({
  companyId,
  initialSummary = null,
}: {
  companyId: string;
  initialSummary?: ClassScoutLandingSummary | null;
}) {
  const [loading, setLoading] = useState(!initialSummary);
  const [summary, setSummary] = useState<ClassScoutLandingSummary | null>(initialSummary);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastLoggedState = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/classscout/landing?companyId=${encodeURIComponent(companyId)}`);
      const payload = response.ok ? await response.json() : null;
      if (!response.ok || !payload?.destinationKey) {
        throw new Error(String(payload?.error || "ClassScout landing summary unavailable."));
      }
      setSummary(payload as ClassScoutLandingSummary);
    } catch (error) {
      setSummary(null);
      setLoadError(error instanceof Error ? error.message : "ClassScout landing summary unavailable.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (initialSummary) return undefined;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSummary, load]);

  useEffect(() => {
    if (loading) return;
    const state = loadError ? "fatal" : (summary?.state ?? "fatal");
    if (lastLoggedState.current === state) return;
    lastLoggedState.current = state;
    void logClientInteraction({
      companyId,
      surface: "classscout-home",
      interactionType: "CLASSSCOUT_HOME_LOADED",
      entityType: "ROUTE",
      entityId: "classscout",
      payload: {
        state,
        unavailableSections: summary?.unavailableSections.map((item) => item.key) ?? [],
        degradedSources: summary?.fetchHealth.sources.filter((item) => item.status !== "ok").map((item) => item.key) ?? [],
      },
      teachingWeight: 25,
    });
  }, [companyId, loadError, loading, summary]);

  const actions = useMemo(() => summary?.actions ?? [], [summary]);

  const handleActionClick = useCallback((actionKey: string, href: string) => {
    void logClientInteraction({
      companyId,
      surface: "classscout-home",
      interactionType: "CLASSSCOUT_ACTION_OPEN",
      entityType: "ROUTE",
      entityId: actionKey,
      payload: { href },
      teachingWeight: 25,
    });
  }, [companyId]);

  if (loading && !summary) {
    return (
      <PageShell width="full">
        <Center h={400}>
          <Stack align="center" gap="sm">
            <Loader color="review" />
            <Text c="dimmed">Loading ClassScout operator home...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  if (loadError && !summary) {
    return (
      <PageShell width="full">
        <Stack gap="xl">
          <PageHeader
            title="ClassScout"
            description="Dedicated operator home for ClassScout workflows, review queues, project delivery, and mission control."
            actions={(
              <Button variant="light" color="gray" leftSection={<Refresh size={14} />} onClick={() => void load()}>
                Retry
              </Button>
            )}
          />
          <Notice title="ClassScout home is temporarily unavailable" icon={Activity} variant="destructive">
            {loadError}
          </Notice>
        </Stack>
      </PageShell>
    );
  }

  if (!summary) {
    return null;
  }

  const primaryBadges = (
    <Group gap="xs">
      <Badge variant="light" color="review">Miniapp</Badge>
      {summary.bridgeConfigured ? (
        <Badge variant="light" color="strategy">Bridge Ready</Badge>
      ) : (
        <Badge variant="light" color="gray">Bridge Missing</Badge>
      )}
    </Group>
  );

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PageHeader
          title="ClassScout"
          description="Dedicated operator home for ClassScout workflows, review queues, project delivery, and mission control."
          actions={(
            <Group gap="sm">
              {primaryBadges}
              <Button variant="light" color="gray" leftSection={<Refresh size={14} />} onClick={() => void load()}>
                Refresh
              </Button>
            </Group>
          )}
        />

        {summary.state === "partial" ? (
          <Notice title="ClassScout home is partially degraded" icon={Activity}>
            {summary.fetchHealth.sources
              .filter((source) => source.status !== "ok")
              .map((source) => source.key)
              .join(", ")} data is temporarily unavailable. Launch actions remain available.
          </Notice>
        ) : null}

        {!summary.bridgeConfigured ? (
          <Notice title="ClassScout bridge is not configured" icon={Radar}>
            Live catalog actions may be unavailable until the ClassScout bridge configuration is restored.
          </Notice>
        ) : null}

        {summary.state === "empty" ? (
          <EmptyState
            icon={Rocket}
            title={summary.configured ? "ClassScout is ready but quiet" : "ClassScout is not configured for this unit yet"}
            description={summary.configured
              ? "There is no active ClassScout review, live-catalog, or project-board pressure right now."
              : "The destination exists in the product surface now, but this unit still needs its ClassScout workflow configured or seeded."}
            tone="review"
            primaryAction={(
              <Button component={Link} href={`/${companyId}/review?tab=setup&destinationKey=classscout`} color="review">
                Open mission setup
              </Button>
            )}
            secondaryAction={(
              <Button component={Link} href={`/${companyId}/workflows`} variant="light" color="strategy">
                Open workflow definitions
              </Button>
            )}
          />
        ) : null}

        <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
          <MetricCard icon={History} color="review" label="Review Cards" value={summary.reviewPackets.total} detail={`${summary.reviewPackets.pending} pending review`} />
          <MetricCard icon={Book} color="knowmore" label="Live Listings" value={summary.liveListings.total} detail={`${summary.liveListings.needsReview} need revision`} />
          <MetricCard icon={Kanban} color="tactical" label="Published Outcomes" value={summary.learning.published} detail={`${summary.learning.replayCandidates} replay candidates`} />
          <MetricCard icon={Radar} color="strategy" label="Mission Pressure" value={summary.missionControl.activeRuns} detail={`${summary.missionControl.failedRuns} failed · ${summary.missionControl.retryBacklog} retries`} />
        </SimpleGrid>

        <RouteCardGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          {actions.map((action) => {
            const Icon = ACTION_ICON[action.key as keyof typeof ACTION_ICON] ?? Activity;
            return (
              <LinkCard
                key={action.key}
                href={action.href}
                icon={Icon}
                variant={action.tone}
                title={action.title}
                description={action.description}
                density="compact"
                onOpen={() => handleActionClick(action.key, action.href)}
              />
            );
          })}
        </RouteCardGrid>

        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
          <UnifiedCard tone="review">
            <UnifiedCardHeader title="Execution Snapshot" />
            <UnifiedCardBody>
              <Stack gap="sm">
                <UnifiedCardSection tone="review">
                  <Group justify="space-between">
                    <Text fw={600}>Content Ops</Text>
                    <MetaText>{summary.reviewPackets.total} review cards</MetaText>
                  </Group>
                  <BodyText>{summary.reviewPackets.pending} review cards are waiting for operator action. First-pass approval {pct(summary.sections.learning?.firstPassApprovalRate ?? 0)}.</BodyText>
                </UnifiedCardSection>
                <UnifiedCardSection tone="review">
                  <Group justify="space-between">
                    <Text fw={600}>Live Catalog</Text>
                    <MetaText>{summary.liveListings.total} listings</MetaText>
                  </Group>
                  <BodyText>{summary.liveListings.needsReview} listings currently require review-oriented follow-up.</BodyText>
                </UnifiedCardSection>
                <UnifiedCardSection tone="review">
                  <Group justify="space-between">
                    <Text fw={600}>Mission Control</Text>
                    <MetaText>{summary.missionControl.activeRuns} active runs</MetaText>
                  </Group>
                  <BodyText>{summary.missionControl.retryBacklog} workflow retries and {summary.sections.missionControl?.callbackFailureCount ?? 0} callback failures are visible.</BodyText>
                </UnifiedCardSection>
                {summary.fetchHealth.sources.filter((source) => source.status !== "ok").map((source) => (
                  <UnifiedCardSection key={source.key} tone="review">
                    <Group justify="space-between">
                      <Text fw={600}>{source.key}</Text>
                      <Badge variant="light" color="review">{source.status}</Badge>
                    </Group>
                    <BodyText>{source.message || "This source is degraded. Other ClassScout actions remain available."}</BodyText>
                  </UnifiedCardSection>
                ))}
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>

          <UnifiedCard tone="tactical">
            <UnifiedCardHeader title="Project Board Snapshot" />
            <UnifiedCardBody>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <SectionTitle>{summary.sections.projectBoard?.activeCards ?? 0}</SectionTitle>
                  <Badge variant="light" color="tactical">Active cards</Badge>
                </Group>
                {(summary.sections.projectBoard?.byColumn ?? []).map((column) => (
                  <UnifiedCardSection key={column.columnKey} tone="tactical">
                    <Group justify="space-between">
                      <Text fw={600}>{column.columnKey}</Text>
                      <Badge variant="light" color="tactical">{column.count}</Badge>
                    </Group>
                  </UnifiedCardSection>
                ))}
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>
        </SimpleGrid>
      </Stack>
    </PageShell>
  );
}
