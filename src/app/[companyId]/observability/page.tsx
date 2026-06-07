'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Badge, Box, Button, Group, Loader, Select, SimpleGrid, Stack, Table } from "@/components/gds/primitives";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCoins as Coins, IconGauge as Gauge, IconHeartbeat as Heartbeat, IconListCheck as ListCheck, IconRefresh as RefreshIcon, IconStethoscope as Stethoscope } from "@/components/gds/icons";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/gds/charts";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { DestinationLearningPanel } from "@/components/destination-learning-panel";
import { DestinationMissionControl } from "@/components/destination-mission-control";
import { normalizeDestinationKey, resolveDestinationLabel } from "@/lib/destination-scope";
import { DESTINATION_KEYS } from "@/lib/destination-workflow-contract";
import { SEMANTIC_CHART_BAR_RADIUS, SEMANTIC_CHART_GRID_STROKE, getSemanticListItemStyle } from "@/lib/semantic-theme";
import { resolveEnabledLegacyModules } from "@/lib/module-capability-utils";
import type { UnitModuleKey } from "@/lib/intelligence-unit-capabilities";

const QUEUE_COLUMN_RANK: Record<string, number> = {
  NOW: 0,
  SOON: 1,
  LATER: 2,
  PARKED: 3,
};

function sortQueueJobs(jobs: any[]) {
  return [...jobs].sort((left, right) => {
    const leftRunning = left.status === "RUNNING" ? 1 : 0;
    const rightRunning = right.status === "RUNNING" ? 1 : 0;
    if (leftRunning !== rightRunning) {
      return rightRunning - leftRunning;
    }

    const leftRank = QUEUE_COLUMN_RANK[left.queueColumn] ?? 99;
    const rightRank = QUEUE_COLUMN_RANK[right.queueColumn] ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftPriority = Number(left.priorityScore ?? 0);
    const rightPriority = Number(right.priorityScore ?? 0);
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority;
    }

    return String(left.jobType || "").localeCompare(String(right.jobType || ""));
  });
}

function chartTooltipFormatter(value: unknown) {
  if (value == null) {
    return ["—", "Value"];
  }
  if (typeof value === "number") {
    return [Math.round(value * 10) / 10, "Value"];
  }
  if (typeof value === "string") {
    return [value, "Value"];
  }
  return [String(value), "Value"];
}

export default function ObservabilityPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.companyId as string;
  const destinationKey = normalizeDestinationKey(searchParams.get("destinationKey"));
  const destinationScopeValue = destinationKey ?? "all";
  const destinationScopeQuery = destinationKey ? `?destinationKey=${encodeURIComponent(destinationKey)}` : "";
  const destinationScopeOptions = [
    { value: "all", label: "All destinations" },
    ...DESTINATION_KEYS.map((key) => ({ value: key, label: resolveDestinationLabel(key) })),
  ];
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);

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
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await fetch(`/api/companies/${companyId}/nav`);
        const payload = await response.json().catch(() => null);
        const enabledModules = resolveEnabledLegacyModules({
          enabledModules: payload?.webapp?.enabledModules,
          enabledBlocks: payload?.webapp?.enabledBlocks,
        }) as UnitModuleKey[];
        const allowed = enabledModules.includes("analytics") || enabledModules.includes("pipeline");
        if (cancelled) return;
        if (!allowed) {
          router.replace(`/${companyId}`);
          return;
        }
        setAccessChecked(true);
        await loadData();
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [companyId, loadData, router]);

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

  const updateDestinationScope = useCallback((nextScope: string | null) => {
    const scope = normalizeDestinationKey(nextScope) ?? "all";
    const query = new URLSearchParams(searchParams.toString());
    if (scope === "all") {
      query.delete("destinationKey");
    } else {
      query.set("destinationKey", scope);
    }
    const queryString = query.toString();
    router.replace(`/${companyId}/observability${queryString ? `?${queryString}` : ""}`);
  }, [companyId, router, searchParams]);

  if (!accessChecked || loading) {
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
  const planner = data?.planner || { unmetLaneTargets: [], recentEvents: [] };
  const opportunitycardRepair = data?.opportunitycardRepair || { status: "PENDING", updated: 0, processed: 0, lastError: null };
  const workerBuild = data?.workerBuild || {};
  const quality = data?.quality || {};
  const boardHealth = data?.boardHealth || { totalStates: 0, boardCounts: {}, tightGapCount: 0, duplicatedRankCount: 0 };
  const capabilityTransactions = data?.capabilityTransactions || {
    appliedLast24h: 0,
    previewsLast24h: 0,
    conflictLast24h: 0,
    validationFailuresLast24h: 0,
    latestApplyAt: null,
    recentApplies: [],
  };
  const lifecycleControlCenter = data?.lifecycleControlCenter || null;
  const sortedQueueJobs = sortQueueJobs(queue.jobs || []);
  const currentJob = sortedQueueJobs[0] || null;
  const upcomingJobs = currentJob ? sortedQueueJobs.slice(1, 21) : sortedQueueJobs.slice(0, 20);
  const cardHealthChartData = [
    { family: "Flashcards", aggregate: Number(quality.flashcards?.averages?.aggregate ?? 0) },
    { family: "Goals", aggregate: Number(quality.goals?.averages?.aggregate ?? 0) },
    { family: "Tasks", aggregate: Number(quality.tasks?.averages?.aggregate ?? 0) },
  ];
  const cardCountChartData = [
    { family: "Datacards", count: Number(planner.datacardCount ?? 0) },
    { family: "Flashcards", count: Number(quality.flashcards?.sampleSize ?? 0) },
    { family: "Goals", count: Number(quality.goals?.sampleSize ?? 0) },
    { family: "Tasks", count: Number(quality.tasks?.sampleSize ?? 0) },
  ];

  return (
    <PageShell width="full">
      <PageHeader
        title="Observability"
        description="Mission control for worker health, queue pressure, scoring integrity, and recent system outcomes."
        actions={
          <Group gap="xs" align="end">
            <Select
              label="Destination scope"
              size="xs"
              value={destinationScopeValue}
              onChange={updateDestinationScope}
              data={destinationScopeOptions}
              allowDeselect={false}
              w={180}
            />
            <Button
              size="xs"
              variant="light"
              color="review"
              leftSection={<Stethoscope size={14} />}
              onClick={() => router.push(`/${companyId}/evaluations${destinationScopeQuery}`)}
            >
              Internal Evaluation Bench
            </Button>
          </Group>
        }
      />

      <DestinationMissionControl companyId={companyId} destinationKey={destinationKey ?? undefined} />
      <DestinationLearningPanel companyId={companyId} destinationKey={destinationKey ?? undefined} />

      {lifecycleControlCenter ? (
        <UnifiedCard>
          <UnifiedCardHeader
            title="Lifecycle Control Center"
            description="Unit lifecycle status across enabled Miniapps, daemon lanes, maintenance, public verification, and recovery actions."
          />
          <UnifiedCardBody>
            <Stack gap="sm" role="status" aria-live="polite">
              <Group gap="xs">
                <Badge color={lifecycleControlCenter.state === "healthy" ? "green" : lifecycleControlCenter.state === "failed" ? "red" : "yellow"}>
                  {String(lifecycleControlCenter.state || "unknown")}
                </Badge>
                <MetaText>
                  {lifecycleControlCenter.unit?.miniapps?.length ?? 0} miniapp(s), {lifecycleControlCenter.unit?.modules?.length ?? 0} module(s)
                </MetaText>
              </Group>
              <SimpleGrid cols={{ base: 1, md: 2, xl: 5 }} spacing="sm">
                {(lifecycleControlCenter.cards || []).map((card: any) => (
                  <Box key={card.id} style={getSemanticListItemStyle("strategy")}>
                    <Stack gap={4}>
                      <Group justify="space-between" align="start" gap="xs">
                        <BodyText>{card.title}</BodyText>
                        <Badge size="xs" variant="light">
                          {String(card.state || "unknown")}
                        </Badge>
                      </Group>
                      <MetaText>{card.summary}</MetaText>
                    </Stack>
                  </Box>
                ))}
              </SimpleGrid>
              {lifecycleControlCenter.state !== "healthy" ? (
                <Notice title="Lifecycle action may be required" icon={AlertTriangle} variant="default">
                  Review failed or degraded lifecycle cards, then use the recovery actions exposed by Unit operations.
                </Notice>
              ) : null}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={Heartbeat} color="review" label="Guardian State" value={String(heartbeat.healthState || "unknown")} detail={String(heartbeat.healthStage || "—")} />
        <MetricCard icon={Activity} color="checklist" label="Worker Alive" value={heartbeat.workerAlive ? "Yes" : "No"} detail={heartbeat.lastProgressAt || "—"} />
        <MetricCard icon={ListCheck} color="strategy" label="Active Queue Jobs" value={queue.totalActiveJobs ?? 0} detail={`${queue.runningJobs ?? 0} running`} />
        <MetricCard icon={AlertTriangle} color="knowmore" label="Score Health" value={scoreHealth?.overallBand || "UNKNOWN"} detail={`${scoreHealth?.alerts?.length ?? 0} active alerts`} />
        <MetricCard icon={RefreshIcon} color="strategy" label="Opportunity Repair" value={String(opportunitycardRepair.status || "PENDING")} detail={`${opportunitycardRepair.updated ?? 0} updated / ${opportunitycardRepair.processed ?? 0} processed`} />
        <MetricCard icon={Coins} color="tactical" label="Budget Pressure" value={budget.pressure || "UNKNOWN"} detail={`$${budget.totalEstimatedCost ?? 0} est · ${budget.totalWorkloadUnits ?? 0} units`} />
        <MetricCard icon={Gauge} color="strategy" label="Planner Mode" value={String(planner.operatingMode || "UNKNOWN")} detail={`${planner.unmetLaneTargets?.length ?? 0} unmet lanes`} />
        <MetricCard icon={AlertTriangle} color="review" label="Planner Timeouts" value={planner.timeoutCount ?? 0} detail={`${planner.qualityCeilingCount ?? 0} quality caps`} />
        <MetricCard icon={Activity} color="checklist" label="Manual Cooldowns" value={planner.activeManualCooldownCount ?? 0} detail={`${planner.manualCooldownBlockCount ?? 0} active blocks`} />
        <MetricCard icon={RefreshIcon} color="knowmore" label="Research Policy" value={planner.researchRunCount ?? 0} detail={`${planner.researchSkipCount ?? 0} skips`} />
        <MetricCard icon={AlertTriangle} color="strategy" label="Novelty Blocks" value={planner.noveltyBlockedCount ?? 0} detail="publish suppressions" />
        <MetricCard icon={Gauge} color="tactical" label="Feedback Pressure" value={planner.feedbackPressureBlockCount ?? 0} detail={`${planner.feedbackPressureSkipCount ?? 0} generation skips`} />
        <MetricCard icon={Activity} color="review" label="Editorial Gate" value={planner.editorialDowngradeCount ?? 0} detail="downgrades to review" />
        <MetricCard icon={Heartbeat} color="review" label="Worker Build" value={String(workerBuild.appVersion || "unknown")} detail={String(workerBuild.gitSha || "—").slice(0, 12)} />
        <MetricCard icon={Gauge} color="knowmore" label="Task Quality" value={quality.tasks?.averages?.aggregate ?? 0} detail={String(quality.tasks?.weakestDimension || "—")} />
        <MetricCard icon={ListCheck} color="review" label="Board States" value={boardHealth.totalStates ?? 0} detail={`${boardHealth.tightGapCount ?? 0} tight rank gaps`} />
        <MetricCard icon={Activity} color="strategy" label="Capability Applies (24h)" value={capabilityTransactions.appliedLast24h ?? 0} detail={capabilityTransactions.latestApplyAt || "no apply recorded"} />
        <MetricCard icon={AlertTriangle} color="review" label="Capability Conflicts (24h)" value={capabilityTransactions.conflictLast24h ?? 0} detail={`${capabilityTransactions.validationFailuresLast24h ?? 0} validation failures`} />
      </SimpleGrid>

      {scoreHealth?.alerts?.length ? (
        <Notice title="Top active score-health alert" icon={AlertTriangle} variant="destructive">
          {scoreHealth.alerts[0].message}
        </Notice>
      ) : null}

      {opportunitycardRepair.status !== "COMPLETED" ? (
        <Notice
          title={`Opportunitycard repair ${String(opportunitycardRepair.status || "PENDING").toLowerCase()}`}
          icon={RefreshIcon}
          variant={opportunitycardRepair.status === "FAILED" ? "destructive" : "default"}
        >
          {opportunitycardRepair.status === "FAILED"
            ? opportunitycardRepair.lastError || "Historical opportunitycard repair failed and will retry through the worker integrity loop."
            : `Historical opportunitycard repair is running in bounded worker slices. Updated ${opportunitycardRepair.updated ?? 0} after inspecting ${opportunitycardRepair.processed ?? 0} card(s).`}
        </Notice>
      ) : null}

      {(boardHealth.tightGapCount > 0 || boardHealth.duplicatedRankCount > 0) ? (
        <Notice
          title="Board rank repair recommended"
          icon={AlertTriangle}
          variant="destructive"
        >
          {`${boardHealth.tightGapCount ?? 0} tight gaps and ${boardHealth.duplicatedRankCount ?? 0} duplicate rank collisions were detected across shared board-state columns.`}
        </Notice>
      ) : null}

      <UnifiedCard tone="strategy">
        <UnifiedCardHeader
          title="Capability Transaction Activity"
          supporting={<Badge variant="light" color="strategy">{capabilityTransactions.previewsLast24h ?? 0} previews (24h)</Badge>}
        />
        <UnifiedCardBody>
          <Stack gap="sm">
            {(capabilityTransactions.recentApplies || []).length > 0 ? (
              (capabilityTransactions.recentApplies || []).map((event: any) => (
                <Group key={event.id} justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={2}>
                    <BodyText>{event.at || "unknown time"}</BodyText>
                    <MetaText>{`Actor: ${event.actor || "unknown"}`}</MetaText>
                    <MetaText>{`Expected version: ${event.expectedVersion || "n/a"}`}</MetaText>
                  </Stack>
                  <Stack gap={2} align="flex-end">
                    <Badge variant="outline" color="gray">{`${event.hiddenRoutes ?? 0} hidden routes`}</Badge>
                    <Badge variant="outline" color="gray">{`${event.blockedOperations ?? 0} blocked ops`}</Badge>
                  </Stack>
                </Group>
              ))
            ) : (
              <Notice title="No recent capability applies">No capability transaction apply events were recorded recently.</Notice>
            )}
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

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
                    <Stack gap={2} flex={1}>
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
          <UnifiedCardHeader
            title="Live Agent Pipeline"
            supporting={<Badge variant="light" color="review">{sortedQueueJobs.length} active jobs</Badge>}
          />
          <UnifiedCardBody>
            <Stack gap="md">
              {currentJob ? (
                <UnifiedCard tone="checklist">
                  <UnifiedCardHeader
                    title="Current Task"
                    supporting={<Badge variant="light" color="checklist">{currentJob.status}</Badge>}
                  />
                  <UnifiedCardBody>
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Box fw={700}>
                            <BodyText>{currentJob.jobType}</BodyText>
                          </Box>
                          <MetaText>{currentJob.reason || "Worker is actively processing this pipeline job."}</MetaText>
                        </Stack>
                        <Stack gap={2} align="flex-end">
                          <Badge variant="outline" color="gray">{currentJob.queueColumn}</Badge>
                          <MetaText>Priority {Math.round(Number(currentJob.priorityScore ?? 0))}</MetaText>
                        </Stack>
                      </Group>
                    </Stack>
                  </UnifiedCardBody>
                </UnifiedCard>
              ) : (
                <Notice title="No active pipeline task">The worker does not currently report an active queue job for this company.</Notice>
              )}

              <Stack gap="xs">
                <Group justify="space-between">
                  <Box fw={700}>
                    <BodyText>Queue Next</BodyText>
                  </Box>
                  <MetaText>Next {upcomingJobs.length} jobs headed to the agent</MetaText>
                </Group>
                {upcomingJobs.length ? (
                  upcomingJobs.map((job: any, index: number) => (
                    <Group
                      key={job.id}
                      justify="space-between"
                      align="flex-start"
                      p="sm"
                      style={getSemanticListItemStyle("neutral")}
                    >
                      <Stack gap={2} flex={1}>
                        <Group gap="xs">
                          <Badge variant="light" color={job.queueColumn === "NOW" ? "checklist" : job.queueColumn === "SOON" ? "tactical" : job.queueColumn === "LATER" ? "strategy" : "gray"}>
                            #{index + 1}
                          </Badge>
                          <Box fw={600}>
                            <BodyText>{job.jobType}</BodyText>
                          </Box>
                        </Group>
                        <MetaText>{job.reason || "No planner reason persisted."}</MetaText>
                      </Stack>
                      <Stack gap={2} align="flex-end">
                        <Badge variant="outline" color="gray">{job.queueColumn}</Badge>
                        <MetaText>{job.status}</MetaText>
                      </Stack>
                    </Group>
                  ))
                ) : (
                  <Notice title="Queue clear">No additional queued jobs are waiting behind the current task.</Notice>
                )}
              </Stack>
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="knowmore">
          <UnifiedCardHeader title="Card Health" supporting={<Badge variant="light" color="knowmore">aggregate quality</Badge>} />
          <UnifiedCardBody>
            <Box h={320}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cardHealthChartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={SEMANTIC_CHART_GRID_STROKE} />
                  <XAxis dataKey="family" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => chartTooltipFormatter(value)} />
                  <Bar dataKey="aggregate" fill="var(--mantine-color-cyan-6)" radius={SEMANTIC_CHART_BAR_RADIUS} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="strategy">
          <UnifiedCardHeader title="Sum of Cards" supporting={<Badge variant="light" color="strategy">current persisted totals</Badge>} />
          <UnifiedCardBody>
            <Box h={320}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cardCountChartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={SEMANTIC_CHART_GRID_STROKE} />
                  <XAxis dataKey="family" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => chartTooltipFormatter(value)} />
                  <Bar dataKey="count" fill="var(--mantine-color-orange-6)" radius={SEMANTIC_CHART_BAR_RADIUS} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="knowmore">
          <UnifiedCardHeader title="Quality Dimensions" />
          <UnifiedCardBody>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Card Family</Table.Th>
                  <Table.Th>Evidence</Table.Th>
                  <Table.Th>Linguistic</Table.Th>
                  <Table.Th>Actionability</Table.Th>
                  <Table.Th>Strategic</Table.Th>
                  <Table.Th>Weakest</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[
                  ["Flashcards", quality.flashcards],
                  ["Goals", quality.goals],
                  ["Tasks", quality.tasks],
                ].map(([label, snapshot]: any) => (
                  <Table.Tr key={label}>
                    <Table.Td>{label}</Table.Td>
                    <Table.Td>{snapshot?.averages?.evidenceQuality ?? 0}</Table.Td>
                    <Table.Td>{snapshot?.averages?.linguisticQuality ?? 0}</Table.Td>
                    <Table.Td>{snapshot?.averages?.actionabilityQuality ?? 0}</Table.Td>
                    <Table.Td>{snapshot?.averages?.strategicValue ?? 0}</Table.Td>
                    <Table.Td>{snapshot?.weakestDimension || "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="strategy">
          <UnifiedCardHeader title="Planner State" />
          <UnifiedCardBody>
            <Stack gap="sm">
              <Group justify="space-between">
                <BodyText>Datacards</BodyText>
                <MetaText>{planner.datacardCount ?? 0}</MetaText>
              </Group>
              <Group justify="space-between">
                <BodyText>Flashcards</BodyText>
                <MetaText>{planner.flashcardCount ?? 0}</MetaText>
              </Group>
              <Group justify="space-between">
                <BodyText>Flashcard gap</BodyText>
                <MetaText>{planner.unmetFlashcardTarget ?? 0}</MetaText>
              </Group>
              {(planner.unmetLaneTargets || []).length ? (
                <Stack gap="xs">
                  {(planner.unmetLaneTargets || []).map((lane: any) => (
                    <Group key={lane.lane} justify="space-between">
                      <BodyText>{lane.lane}</BodyText>
                      <MetaText>{lane.current}/{lane.target}</MetaText>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Notice title="Lane targets met">All planner lane minimums are currently satisfied.</Notice>
              )}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="review">
          <UnifiedCardHeader title="Planner Events" />
          <UnifiedCardBody>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Entity</Table.Th>
                  <Table.Th>Reason</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(planner.recentEvents || []).slice(0, 8).map((event: any) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>{event.eventType}</Table.Td>
                    <Table.Td>{event.entityType || "—"}</Table.Td>
                    <Table.Td>{event.reason || "—"}</Table.Td>
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
