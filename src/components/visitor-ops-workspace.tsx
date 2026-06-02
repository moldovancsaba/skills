"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Loader, ScrollArea, Stack, Table, Tabs, TextInput, Tooltip } from "@mantine/core";
import {
  IconBan,
  IconBolt,
  IconBrain,
  IconCircleCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconRotateClockwise,
  IconSearch,
  IconShieldCheck,
  IconTargetArrow,
} from "@tabler/icons-react";
import { EmptyState, MetricCard, MetricGrid, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { BodyText, MetaText } from "@/components/ui/typography";

type OpsSnapshot = {
  checkedAt: string;
  miniappKey: string;
  visitorKey: string;
  destinationKey: string;
  lifecycleState: string;
  paused: boolean;
  contract: {
    key: string;
    valid: boolean;
    errors: string[];
    successMetric: string;
    sourceCardInventoryIsSuccess: false;
  };
  target: {
    targetVisibleCards: number;
    publicVisibleCards: number;
    remainingVisibleCards: number;
    progressPercent: number;
  };
  publicVerification: Record<string, unknown>;
  burst: Record<string, unknown>;
  researchTasks: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  opportunities: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  learningMemory: Array<Record<string, unknown>>;
  blockers: Array<{ code: string; count: number; recommendedAction: string }>;
  actions: {
    canPause: boolean;
    canResume: boolean;
    canRunBurst: boolean;
    canReplan: boolean;
    canRetry: boolean;
  };
};

type ActionName =
  | "replan"
  | "run_burst"
  | "run_evidence"
  | "promote_opportunities"
  | "evaluate_gates"
  | "sync_learning"
  | "retry_task"
  | "pause_burst"
  | "resume_burst"
  | "suppress_domain";

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stateColor(state: string) {
  const normalized = state.toLowerCase();
  if (normalized.includes("complete") || normalized.includes("passed") || normalized.includes("found")) return "green";
  if (normalized.includes("blocked") || normalized.includes("failed") || normalized.includes("exhausted") || normalized.includes("rework")) return "red";
  if (normalized.includes("running") || normalized.includes("active") || normalized.includes("queued")) return "blue";
  if (normalized.includes("paused")) return "orange";
  return "gray";
}

function CompactTable({
  caption,
  columns,
  rows,
  empty,
}: {
  caption: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  empty: string;
}) {
  if (!rows.length) {
    return <EmptyState icon={IconSearch} title={empty} description="No records are available for this state yet." tone="neutral" />;
  }
  return (
    <ScrollArea>
      <Table striped highlightOnHover withTableBorder aria-label={caption}>
        <Table.Caption>{caption}</Table.Caption>
        <Table.Thead>
          <Table.Tr>
            {columns.map((column) => <Table.Th key={column.key}>{column.label}</Table.Th>)}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.slice(0, 100).map((row, index) => (
            <Table.Tr key={String(row.id || row.fingerprint || index)}>
              {columns.map((column) => (
                <Table.Td key={column.key}>
                  {column.key.toLowerCase().includes("status") || column.key.toLowerCase().includes("state") ? (
                    <Badge color={stateColor(text(row[column.key]))} variant="light">{text(row[column.key])}</Badge>
                  ) : (
                    <BodyText>{text(row[column.key])}</BodyText>
                  )}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

export function VisitorOpsWorkspace({ companyId, defaultVisitorKey = "compare" }: { companyId: string; defaultVisitorKey?: string }) {
  const [miniappKey, setMiniappKey] = useState(defaultVisitorKey);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<OpsSnapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/miniapps/${encodeURIComponent(miniappKey)}/ops/snapshot?companyId=${encodeURIComponent(companyId)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.snapshot) throw new Error(String(payload?.error || "Miniapp ops snapshot unavailable"));
      setSnapshot(payload.snapshot as OpsSnapshot);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Miniapp ops snapshot unavailable");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, miniappKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runAction = useCallback(async (action: ActionName, extra: Record<string, unknown> = {}) => {
    const confirmAction = action === "pause_burst" || action === "suppress_domain";
    if (confirmAction && !window.confirm("Confirm this operator action.")) return;
    setActing(action);
    setError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/miniapps/${encodeURIComponent(miniappKey)}/ops/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          action,
          targetVisibleCards: 100,
          maxCycles: 1,
          tasksPerCycle: 3,
          ...extra,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(String(payload?.error || payload?.code || "Miniapp action failed"));
      setActionMessage(`${action.replace(/_/g, " ")} completed.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Miniapp action failed");
    } finally {
      setActing(null);
    }
  }, [companyId, load, miniappKey]);

  const firstRetryableTask = useMemo(() => {
    return snapshot?.researchTasks.find((task) => ["FAILED", "NO_RESULTS", "EXHAUSTED"].includes(String(task.status))) ?? null;
  }, [snapshot]);

  const primaryBlocker = snapshot?.blockers[0] ?? null;

  return (
    <PageShell width="full">
      <Stack gap="lg">
        <PageHeader
          title="Sovereign Miniapp Ops"
          description="Contract-bound research, evidence, opportunity, burst, public verification, and learning state."
          actions={(
            <Group>
              <TextInput
                aria-label="Miniapp key"
                value={miniappKey}
                onChange={(event) => setMiniappKey(event.currentTarget.value)}
                placeholder="compare"
              />
              <Tooltip label="Refresh miniapp operations snapshot">
                <Button leftSection={<IconRefresh size={14} />} onClick={() => void load()} loading={loading}>Refresh</Button>
              </Tooltip>
            </Group>
          )}
        />

        <div aria-live="polite">
          {error ? <Notice title="Miniapp ops error" variant="destructive">{error}</Notice> : null}
          {actionMessage ? <Notice title="Operator action complete">{actionMessage}</Notice> : null}
        </div>

        {loading && !snapshot ? <Loader aria-label="Loading miniapp operations snapshot" /> : null}

        {snapshot ? (
          <Stack gap="lg">
            <Group gap="xs" wrap="wrap">
              <Badge color={stateColor(snapshot.lifecycleState)} variant="light">{snapshot.lifecycleState}</Badge>
              <Badge color={snapshot.contract.valid ? "green" : "red"} variant="light">{snapshot.contract.key}</Badge>
              <Badge color="gray" variant="outline">{snapshot.contract.successMetric}</Badge>
              <Badge color="red" variant="light">SOURCE inventory is not success</Badge>
            </Group>

            <MetricGrid cols={{ base: 1, sm: 2, xl: 4 }}>
              <MetricCard icon={IconTargetArrow} color="strategy" label="Public Visible Cards" value={`${snapshot.target.publicVisibleCards}/${snapshot.target.targetVisibleCards}`} detail={`${snapshot.target.remainingVisibleCards} remaining`} />
              <MetricCard icon={IconBolt} color="review" label="Burst State" value={snapshot.paused ? "Paused" : text(snapshot.burst?.stoppedBecause || snapshot.lifecycleState)} detail={`Progress ${snapshot.target.progressPercent}%`} />
              <MetricCard icon={IconSearch} color="knowmore" label="Research Queue" value={snapshot.researchTasks.length} detail={`${snapshot.evidence.length} evidence artifacts`} />
              <MetricCard icon={IconBrain} color="tactical" label="Learning Rules" value={snapshot.learningMemory.length} detail={`${snapshot.blockers.length} blocker groups`} />
            </MetricGrid>

            <UnifiedCard tone="neutral">
              <UnifiedCardHeader
                title="Operator Controls"
                description="Actions are bounded by the sovereign contract and return structured failure states."
              />
              <UnifiedCardBody>
                <Group gap="sm" wrap="wrap">
                  <Button leftSection={<IconSearch size={14} />} loading={acting === "replan"} disabled={!snapshot.actions.canReplan} onClick={() => void runAction("replan")}>Re-plan</Button>
                  <Button leftSection={<IconBolt size={14} />} loading={acting === "run_burst"} disabled={!snapshot.actions.canRunBurst} onClick={() => void runAction("run_burst")}>Run Burst Cycle</Button>
                  <Button leftSection={<IconCircleCheck size={14} />} loading={acting === "promote_opportunities"} onClick={() => void runAction("promote_opportunities")}>Promote Evidence</Button>
                  <Button leftSection={<IconShieldCheck size={14} />} loading={acting === "evaluate_gates"} onClick={() => void runAction("evaluate_gates")}>Evaluate Gates</Button>
                  <Button leftSection={<IconBrain size={14} />} loading={acting === "sync_learning"} onClick={() => void runAction("sync_learning")}>Sync Learning</Button>
                  {snapshot.paused ? (
                    <Button leftSection={<IconPlayerPlay size={14} />} loading={acting === "resume_burst"} onClick={() => void runAction("resume_burst")}>Resume</Button>
                  ) : (
                    <Button leftSection={<IconPlayerPause size={14} />} loading={acting === "pause_burst"} color="orange" onClick={() => void runAction("pause_burst")}>Pause</Button>
                  )}
                  <Button
                    leftSection={<IconRotateClockwise size={14} />}
                    loading={acting === "retry_task"}
                    disabled={!firstRetryableTask}
                    onClick={() => void runAction("retry_task", { taskId: firstRetryableTask?.id })}
                  >
                    Retry Task
                  </Button>
                  <Button
                    leftSection={<IconBan size={14} />}
                    loading={acting === "suppress_domain"}
                    disabled={!primaryBlocker}
                    color="red"
                    onClick={() => void runAction("suppress_domain", { sourceTerm: primaryBlocker?.code, reason: primaryBlocker?.recommendedAction })}
                  >
                    Suppress Blocker
                  </Button>
                </Group>
              </UnifiedCardBody>
            </UnifiedCard>

            <Tabs defaultValue="research">
              <Tabs.List aria-label="Miniapp operations sections">
                <Tabs.Tab value="research">Research</Tabs.Tab>
                <Tabs.Tab value="evidence">Evidence</Tabs.Tab>
                <Tabs.Tab value="opportunities">Opportunities</Tabs.Tab>
                <Tabs.Tab value="gates">Gates</Tabs.Tab>
                <Tabs.Tab value="learning">Learning</Tabs.Tab>
                <Tabs.Tab value="verification">Verification</Tabs.Tab>
                <Tabs.Tab value="legacy">Legacy Ops</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="research" pt="md">
                <CompactTable
                  caption="Research tasks"
                  empty="No research tasks planned"
                  rows={snapshot.researchTasks}
                  columns={[
                    { key: "status", label: "Status" },
                    { key: "query", label: "Query" },
                    { key: "priority", label: "Priority" },
                    { key: "attemptCount", label: "Attempts" },
                    { key: "coverageGoalId", label: "Coverage Goal" },
                  ]}
                />
              </Tabs.Panel>

              <Tabs.Panel value="evidence" pt="md">
                <CompactTable
                  caption="Evidence artifacts"
                  empty="No evidence artifacts found"
                  rows={snapshot.evidence}
                  columns={[
                    { key: "status", label: "Status" },
                    { key: "title", label: "Title" },
                    { key: "provider", label: "Provider" },
                    { key: "relevanceScore", label: "Relevance" },
                    { key: "authorityScore", label: "Authority" },
                    { key: "sourceUrl", label: "URL" },
                  ]}
                />
              </Tabs.Panel>

              <Tabs.Panel value="opportunities" pt="md">
                <CompactTable
                  caption="Miniapp opportunitycards"
                  empty="No opportunitycards promoted"
                  rows={snapshot.opportunities}
                  columns={[
                    { key: "status", label: "Status" },
                    { key: "title", label: "Title" },
                    { key: "candidateScore", label: "Score" },
                    { key: "nextAction", label: "Next Action" },
                    { key: "sourceUrl", label: "URL" },
                  ]}
                />
              </Tabs.Panel>

              <Tabs.Panel value="gates" pt="md">
                <CompactTable
                  caption="Promotion gate candidates"
                  empty="No gate candidates available"
                  rows={snapshot.candidates}
                  columns={[
                    { key: "status", label: "State" },
                    { key: "proposedType", label: "Type" },
                    { key: "gatePassed", label: "Gate Passed" },
                    { key: "blockingReasons", label: "Blocking Reasons" },
                    { key: "reviewReasons", label: "Review Reasons" },
                  ]}
                />
              </Tabs.Panel>

              <Tabs.Panel value="learning" pt="md">
                <Stack>
                  <CompactTable
                    caption="Learning memory rules"
                    empty="No learning rules recorded"
                    rows={snapshot.learningMemory}
                    columns={[
                      { key: "severity", label: "Severity" },
                      { key: "code", label: "Code" },
                      { key: "action", label: "Action" },
                      { key: "sourceTerm", label: "Source Term" },
                      { key: "reason", label: "Reason" },
                    ]}
                  />
                  <CompactTable
                    caption="Blocker summary"
                    empty="No blocker groups"
                    rows={snapshot.blockers}
                    columns={[
                      { key: "code", label: "Code" },
                      { key: "count", label: "Count" },
                      { key: "recommendedAction", label: "Recommended Action" },
                    ]}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="verification" pt="md">
                <UnifiedCard tone="strategy">
                  <UnifiedCardHeader title="Public Verification" />
                  <UnifiedCardBody>
                    <BodyText>{JSON.stringify(snapshot.publicVerification, null, 2)}</BodyText>
                    <MetaText>Checked at {snapshot.checkedAt}</MetaText>
                  </UnifiedCardBody>
                </UnifiedCard>
              </Tabs.Panel>

              <Tabs.Panel value="legacy" pt="md">
                <Button component={Link} href={`/${companyId}/review?destinationKey=${encodeURIComponent(snapshot.destinationKey)}`} variant="light">
                  Open Review Queue
                </Button>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        ) : null}
      </Stack>
    </PageShell>
  );
}
