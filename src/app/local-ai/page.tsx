'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Box, Group, Loader, SimpleGrid, Stack, Table, Anchor } from "@mantine/core";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconBrain as Brain, IconHeartbeat as Heartbeat, IconHierarchy as Hierarchy, IconListCheck as ListCheck, IconServer as Server } from "@tabler/icons-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";

const STATUS_API_URL = "http://127.0.0.1:10006/api/status";
const RAW_HEALTH_URL = "http://127.0.0.1:10005/health";
const RAW_COMMAND_CENTER_URL = "http://127.0.0.1:10006";

function formatTimestamp(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatJobLabel(job: any) {
  if (!job) return "No active task";
  const entityType = job.entityType ? String(job.entityType).replace(/_/g, " ") : "SYSTEM";
  if (job.entityLabel) return `${job.jobType} · ${entityType} · ${job.entityLabel}`;
  return `${job.jobType} · ${entityType}`;
}

function chartTooltipFormatter(value: unknown) {
  if (typeof value === "number") return [Math.round(value * 10) / 10, "Value"];
  if (value == null) return ["—", "Value"];
  return [String(value), "Value"];
}

export default function LocalAiMissionControlPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(STATUS_API_URL, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Status server returned ${response.status}`);
        }
        const payload = await response.json();
        if (cancelled) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const queue = data?.queue || {};
  const currentJob = queue.currentJob || null;
  const nextJobs = queue.nextJobs || [];
  const inventory = data?.inventory || {};
  const worker = data?.worker || {};
  const guardian = data?.guardian || {};
  const buildIdentity = worker?.settings?.buildIdentity || {};

  const cardCountChartData = [
    { family: "Datacards", count: Number(inventory.datacards ?? 0) },
    { family: "Flashcards", count: Number(inventory.flashcards ?? 0) },
    { family: "Goals", count: Number(inventory.goalcards ?? 0) },
    { family: "Tasks", count: Number(inventory.taskcards ?? 0) },
  ];

  const queueByCompanyChartData =
    (queue.companyQueueDepth || []).slice(0, 8).map((row: any) => ({
      company: row.companyName,
      jobs: Number(row.activeJobs ?? 0),
    }));

  return (
    <PageShell width="full">
      <PageHeader
        title="Local AI Mission Control"
        description="Public operator view of the local AI runtime. Shows what the worker is doing now, which company it is touching, and the next queued work globally."
        actions={
          <Group gap="sm">
            <Anchor component={Link} href={RAW_HEALTH_URL} target="_blank" rel="noreferrer">Raw Health JSON</Anchor>
            <Anchor component={Link} href={RAW_COMMAND_CENTER_URL} target="_blank" rel="noreferrer">Raw Command Center</Anchor>
          </Group>
        }
      />

      {loading ? (
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      ) : null}

      {error ? (
        <Notice title="Local AI status unavailable" icon={AlertTriangle} variant="destructive">
          {error}. Confirm the local status server is running on port 10006.
        </Notice>
      ) : null}

      {!loading && !error ? (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
            <MetricCard icon={Heartbeat} color="review" label="Worker State" value={String(worker.state || "unknown")} detail={String(worker.stage || "—")} />
            <MetricCard icon={Brain} color="strategy" label="Current Company" value={String(data?.activeCompany || worker.currentCompany || "Idle Rotation")} detail={String(currentJob?.companyId || "—")} />
            <MetricCard icon={ListCheck} color="checklist" label="Current Task" value={currentJob?.jobType || worker.activeTask || "Idle"} detail={currentJob?.entityLabel || "No active queue entity"} />
            <MetricCard icon={Server} color="knowmore" label="Worker Build" value={String(buildIdentity.appVersion || "unknown")} detail={String(buildIdentity.gitSha || "—").slice(0, 12)} />
            <MetricCard icon={Activity} color="review" label="Queue Depth" value={queue.totalActiveJobs ?? 0} detail={`${queue.runningJobs ?? 0} running · ${queue.failedJobs ?? 0} failed`} />
            <MetricCard icon={Hierarchy} color="tactical" label="Datacards" value={inventory.datacards ?? 0} detail={`${inventory.sources ?? 0} sources · ${inventory.files ?? 0} files`} />
            <MetricCard icon={Brain} color="strategy" label="Cards" value={inventory.totalCards ?? 0} detail={`${inventory.flashcards ?? 0} flashcards · ${inventory.goalcards ?? 0} goals · ${inventory.taskcards ?? 0} tasks`} />
            <MetricCard icon={Heartbeat} color="review" label="Guardian" value={guardian.workerAlive ? "Watching" : "Degraded"} detail={formatTimestamp(guardian.lastHealthAt)} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <UnifiedCard tone="review">
              <UnifiedCardHeader
                title="Live Runtime"
                supporting={<Badge variant="light" color="review">{worker.stage || "IDLE"}</Badge>}
              />
              <UnifiedCardBody>
                {currentJob ? (
                  <UnifiedCard tone="checklist">
                    <UnifiedCardHeader
                      title="Current Task"
                      supporting={<Badge variant="light" color="checklist">{currentJob.status}</Badge>}
                    />
                    <UnifiedCardBody>
                      <Stack gap="xs">
                        <BodyText>{formatJobLabel(currentJob)}</BodyText>
                        <MetaText>Company: {currentJob.companyName || currentJob.companyId || "—"}</MetaText>
                        <MetaText>Queue: {currentJob.queueColumn || "—"} · Priority {Math.round(Number(currentJob.priorityScore ?? 0))}</MetaText>
                        <MetaText>Reason: {currentJob.reason || "Worker is actively processing this queue job."}</MetaText>
                        <MetaText>Updated: {formatTimestamp(currentJob.updatedAt)}</MetaText>
                      </Stack>
                    </UnifiedCardBody>
                  </UnifiedCard>
                ) : (
                  <Notice title="No current queue task">The worker is currently idle or between queue claims.</Notice>
                )}

                <Notice title="Raw worker stage">
                  {worker.activeTask || "No explicit active task string is being persisted by the worker right now."}
                </Notice>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="tactical">
              <UnifiedCardHeader
                title="Pipeline Next"
                supporting={<Badge variant="light" color="tactical">next {nextJobs.length}</Badge>}
              />
              <UnifiedCardBody>
                <Stack gap="xs">
                  {nextJobs.length ? nextJobs.map((job: any, index: number) => (
                    <Group
                      key={job.id}
                      justify="space-between"
                      align="flex-start"
                      p="sm"
                      style={{
                        border: "1px solid var(--border-primary)",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <Stack gap={2} flex={1}>
                        <Group gap="xs">
                          <Badge variant="light" color={job.queueColumn === "NOW" ? "checklist" : job.queueColumn === "SOON" ? "tactical" : job.queueColumn === "LATER" ? "strategy" : "gray"}>
                            #{index + 1}
                          </Badge>
                          <BodyText>{job.jobType}</BodyText>
                        </Group>
                        <MetaText>{job.companyName || job.companyId}</MetaText>
                        <MetaText>{job.entityLabel || job.entityType || "No entity label persisted."}</MetaText>
                        <MetaText>{job.reason || "No planner reason persisted."}</MetaText>
                      </Stack>
                      <Stack gap={2} align="flex-end">
                        <Badge variant="outline" color="gray">{job.queueColumn}</Badge>
                        <MetaText>{Math.round(Number(job.priorityScore ?? 0))}</MetaText>
                      </Stack>
                    </Group>
                  )) : (
                    <Notice title="Queue clear">No queued jobs are waiting behind the current runtime state.</Notice>
                  )}
                </Stack>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="strategy">
              <UnifiedCardHeader title="Sum of Cards" supporting={<Badge variant="light" color="strategy">global totals</Badge>} />
              <UnifiedCardBody>
                <Box h={320}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cardCountChartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="family" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => chartTooltipFormatter(value)} />
                      <Bar dataKey="count" fill="var(--mantine-color-orange-6)" radius={[10, 10, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="knowmore">
              <UnifiedCardHeader title="Queue by Company" supporting={<Badge variant="light" color="knowmore">nice to have</Badge>} />
              <UnifiedCardBody>
                {(queueByCompanyChartData || []).length ? (
                  <Box h={320}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={queueByCompanyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="company" tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={72} />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value) => chartTooltipFormatter(value)} />
                        <Bar dataKey="jobs" fill="var(--mantine-color-cyan-6)" radius={[10, 10, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Notice title="No global queue pressure">No company currently has queued work waiting in the global pipeline.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>
          </SimpleGrid>

          <UnifiedCard tone="review">
            <UnifiedCardHeader title="Recent Failed Jobs" />
            <UnifiedCardBody>
              {(queue.recentFailedJobs || []).length ? (
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Company</Table.Th>
                      <Table.Th>Job</Table.Th>
                      <Table.Th>Entity</Table.Th>
                      <Table.Th>Error</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(queue.recentFailedJobs || []).map((job: any) => (
                      <Table.Tr key={job.id}>
                        <Table.Td>{job.companyName || job.companyId}</Table.Td>
                        <Table.Td>{job.jobType}</Table.Td>
                        <Table.Td>{job.entityLabel || job.entityType || "—"}</Table.Td>
                        <Table.Td>{job.lastError || "—"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Notice title="No recent failed jobs">The global pipeline does not currently report failed jobs.</Notice>
              )}
            </UnifiedCardBody>
          </UnifiedCard>
        </Stack>
      ) : null}
    </PageShell>
  );
}
