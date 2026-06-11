"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, SimpleGrid, Stack } from "@/components/gds/primitives";
import {
  IconCheck as Check,
  IconCircleDashed as CircleDashed,
  IconDatabase as Database,
  IconHistory as History,
  IconRefresh as Refresh,
  IconRocket as Rocket,
  IconSparkles as Sparkles,
} from "@/components/gds/icons";
import { MiniappPublicShell } from "@/components/gds/public-miniapp-shell";
import { EmptyState, LinkCard, MetricCard, Notice, PageHeader, RouteCardGrid } from "@/components/ui/app-shell";
import { MetaText } from "@/components/ui/typography";
import { type UnitModuleKey } from "@/lib/intelligence-unit-capabilities";
import { type ModuleTone } from "@/lib/semantic-theme";
import type { CompareLandingSummary } from "@/lib/compare-landing";

type CapabilityRecord = Partial<Record<UnitModuleKey, boolean>>;

const COMPARE_QUICK_ACTIONS: Array<{ key: UnitModuleKey; href: string; title: string; description: string; tone: ModuleTone | "neutral"; icon: any }> = [
  { key: "data", href: "data", title: "Data", description: "Review discovered sources and uploads", tone: "ingress", icon: Database },
  { key: "knowmore", href: "knowmore", title: "Knowmore", description: "Inspect evidence and generated knowledge", tone: "knowmore", icon: Sparkles },
  { key: "analytics", href: "analytics", title: "Analytics", description: "Monitor compare confidence and health", tone: "review", icon: Rocket },
  { key: "pipeline", href: "pipeline", title: "AI Queue", description: "Validate compare-driven pipeline work", tone: "neutral", icon: CircleDashed },
  { key: "checklist", href: "checklist", title: "Checklist", description: "AI supported execution checklist", tone: "checklist", icon: Check },
];

export function CompareHome({ companyId, modules = {} }: { companyId: string; modules?: CapabilityRecord }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<CompareLandingSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/compare/landing-summary?companyId=${encodeURIComponent(companyId)}`);
      const payload = response.ok ? await response.json() : null;
      if (!response.ok || !payload?.summary) {
        throw new Error(String(payload?.error || "Compare landing summary unavailable."));
      }
      setSummary(payload.summary);
    } catch (error) {
      setSummary(null);
      setLoadError(error instanceof Error ? error.message : "Compare landing summary unavailable.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const actions = useMemo(() => COMPARE_QUICK_ACTIONS.filter((action) => modules[action.key] !== false), [modules]);
  const shellNavItems = useMemo(() => [
    { id: "overview", label: "Overview", href: `/${companyId}/compare` },
    { id: "visitor-ops", label: "Visitor Ops", href: `/${companyId}/compare/visitor-ops` },
    { id: "project-board", label: "Project Board", href: `/${companyId}/unit-board?module=compare` },
    { id: "settings", label: "Capabilities", href: `/${companyId}/settings` },
  ], [companyId]);

  const shellActions = (
    <Group gap="sm">
      <Badge variant="light" color="review">Miniapp</Badge>
      {summary?.bridgeConfigured ? (
        <Badge variant="light" color="strategy">Bridge Ready</Badge>
      ) : (
        <Badge variant="light" color="gray">Bridge Missing</Badge>
      )}
      <Button variant="light" color="gray" leftSection={<Refresh size={14} />} onClick={() => void load()} loading={loading}>
        Refresh
      </Button>
    </Group>
  );

  return (
    <MiniappPublicShell
      brandTitle="Compare"
      brandDescription="Visitor intelligence workflow"
      navItems={shellNavItems}
      actions={shellActions}
      footerActions={(
        <Button variant="light" color="review" component={Link} href={`/${companyId}/compare/visitor-ops`}>
          Open Visitor Ops
        </Button>
      )}
    >
      <Stack gap="xl">
        <PageHeader
          title="Compare"
          description="Dedicated operator home for Compare workflows, review cards, and mission follow-through."
          actions={shellActions}
        />

        {loadError && !summary ? (
          <Notice title="Compare home is temporarily unavailable" icon={Rocket} variant="destructive">
            {loadError}
          </Notice>
        ) : null}

        {summary?.state === "partial" ? (
          <Notice title="Compare home is partially degraded" icon={Rocket}>
            Some Compare sections are currently unavailable, but core actions remain available.
          </Notice>
        ) : null}

        {summary?.publicVerification.status === "blocked" ? (
          <Notice title="Compare public projection is blocked" icon={Rocket} variant="destructive">
            {summary.publicVerification.blockedCount} candidates are blocked by stop-the-bleeding guardrails (source-only, weak source, inherited labels, or fake/static content).
          </Notice>
        ) : null}

        {summary && !summary.bridgeConfigured ? (
          <Notice title="Compare bridge is not configured" icon={Rocket}>
            Publishing and downstream sync can fail until Compare bridge credentials are restored.
          </Notice>
        ) : null}

        {summary?.state === "empty" ? (
          <EmptyState
            icon={Rocket}
            title={summary.configured ? "Compare is ready but quiet" : "Compare is not configured for this unit yet"}
            description={summary.configured
              ? "There is no active Compare review, workflow, or publish pressure right now."
              : "This unit needs its Compare workflow configured or seeded before active operations begin."}
            tone="review"
            primaryAction={(
              <Button component={Link} href={`/${companyId}/review?tab=review`} color="review">
                Open review queue
              </Button>
            )}
            secondaryAction={(
              <Button component={Link} href={`/${companyId}/settings`} variant="light" color="strategy">
                Open settings
              </Button>
            )}
          />
        ) : null}

        {summary ? (
          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
            <MetricCard icon={History} color="review" label="Workflow Cards" value={summary.summary.workflowPackets} detail={`${summary.summary.reviewRequired} require review`} />
            <MetricCard icon={Rocket} color="knowmore" label="Published Outcomes" value={summary.summary.publishedOutcomes} detail={`${summary.summary.approvedPackets} approved`} />
            <MetricCard icon={CircleDashed} color="strategy" label="Active Runs" value={summary.summary.activeRuns} detail={`${summary.summary.failedRuns} failed`} />
            <MetricCard
              icon={Sparkles}
              color="tactical"
              label="Replay Candidates"
              value={summary.summary.replayCandidates}
              detail={`${summary.summary.projectionBlockedCandidates} blocked by projection gate`}
            />
          </SimpleGrid>
        ) : null}

        <RouteCardGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          {actions.map((action) => (
            <LinkCard
              key={action.key}
              href={`/${companyId}/${action.href}`}
              icon={action.icon}
              variant={action.tone}
              title={action.title}
              description={action.description}
              density="compact"
            />
          ))}
        </RouteCardGrid>

        <Group>
          <Button variant="light" color="review" component={Link} href={`/${companyId}/compare/visitor-ops`}>
            Open Visitor Ops
          </Button>
          <Button variant="light" color="synthesis" component={Link} href={`/${companyId}/unit-board?module=compare`}>
            Open project board
          </Button>
          <Button variant="outline" component={Link} href={`/${companyId}/settings`}>
            Unit capabilities
          </Button>
          <MetaText>Capabilities for this unit are configured in Settings.</MetaText>
        </Group>
      </Stack>
    </MiniappPublicShell>
  );
}
