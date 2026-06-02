'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button, Group, Loader, Progress, SimpleGrid, Stack, Table } from "@mantine/core";
import {
  IconAlertTriangle as AlertTriangle,
  IconArrowUpRight as ArrowUpRight,
  IconBrain as Brain,
  IconChecks as Checks,
  IconFlask as Flask,
  IconRefresh as Refresh,
  IconShieldCheck as ShieldCheck,
  IconUpload as Upload,
} from "@tabler/icons-react";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { resolveEnabledLegacyModules } from "@/lib/module-capability-utils";
import type { UnitModuleKey } from "@/lib/intelligence-unit-capabilities";

function scorePercent(value?: number) {
  return Math.round((value ?? 0) * 100);
}

function gateColor(status?: string) {
  if (status === "PASS") return "green";
  if (status === "ADVISORY") return "yellow";
  if (status === "REVIEW_REQUIRED") return "orange";
  return "red";
}

function dateLabel(value?: string) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function EvaluationsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishingRunId, setPublishingRunId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/evaluations?companyId=${companyId}`);
      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(payload.error || "Admin access required");
        setData(null);
        return;
      }
      setErrorMessage(null);
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const runBench = useCallback(async (persistObservability = false) => {
    if (persistObservability) {
      setPublishing(true);
    } else {
      setRunning(true);
    }
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          persistObservability,
          candidate: {
            label: "candidate-strict-gate",
            evidenceStrictness: "strict",
            confidencePolicy: "risk_averse",
            actionabilityBoost: 8,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(payload.error || "Admin access required");
        return;
      }
      setErrorMessage(null);
      setData(payload);
    } finally {
      setRunning(false);
      setPublishing(false);
    }
  }, [companyId]);

  const publishLearningRun = useCallback(async (runId: string) => {
    setPublishingRunId(runId);
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          action: "PUBLISH_LOCAL_LEARNING_RUN",
          runId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(payload.error || "Failed to publish local learning run");
        return;
      }
      setErrorMessage(null);
      await loadData();
    } finally {
      setPublishingRunId(null);
    }
  }, [companyId, loadData]);

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

  if (!accessChecked || loading) {
    return (
      <PageShell width="full">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </PageShell>
    );
  }

  const comparison = data?.comparison;
  const candidate = comparison?.candidate;
  const baseline = comparison?.baseline;
  const failedCases = candidate?.failedCases || [];
  const learningRuns = data?.learningRuns || [];
  const registry = data?.registry;

  return (
    <PageShell width="full">
      <PageHeader
        title="Internal Evaluation Bench"
        description="Admin-only synthetic replay and promotion gates for recommendation, grounded-answer, search, KPI, workflow, competitor, and data-readiness behavior."
        actions={
          <>
            <Button
              leftSection={<Refresh size={16} />}
              variant="light"
              color="review"
              disabled={Boolean(errorMessage)}
              loading={running}
              onClick={() => void runBench(false)}
            >
              Run Bench
            </Button>
            <Button
              leftSection={<ArrowUpRight size={16} />}
              variant="light"
              color="strategy"
              disabled={Boolean(errorMessage) || failedCases.length === 0}
              loading={publishing}
              onClick={() => void runBench(true)}
            >
              Publish Failures
            </Button>
          </>
        }
      />

      {errorMessage ? (
        <Notice title="Admin access required" icon={AlertTriangle} variant="destructive">
          {errorMessage}
          {" "}This evaluation surface is internal and available only to company admins, owners, or superadmins.
          <br />
          <Button mt="sm" size="xs" variant="light" color="gray" onClick={() => router.push(`/${companyId}/observability`)}>
            Return to Observability
          </Button>
        </Notice>
      ) : null}

      {data ? (
        <>
      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={Flask} color="review" label="Candidate Score" value={`${scorePercent(candidate?.aggregateScore)}%`} detail={candidate?.label || "candidate"} />
        <MetricCard icon={Checks} color="checklist" label="Pass Rate" value={`${scorePercent(candidate?.passRate)}%`} detail={`${candidate?.trends?.passedCases ?? 0}/${candidate?.trends?.totalCases ?? 0} cases`} />
        <MetricCard icon={ShieldCheck} color="strategy" label="Promotion Gate" value={comparison?.promotionGate?.status || "UNKNOWN"} detail={comparison?.delta >= 0 ? `+${comparison.delta}` : comparison?.delta} />
        <MetricCard icon={AlertTriangle} color="knowmore" label="High-Risk Fails" value={candidate?.trends?.highRiskFailures ?? 0} detail={`${failedCases.length} total failed`} />
      </SimpleGrid>

      {comparison?.promotionGate?.status !== "PASS" ? (
        <Notice title="Promotion gate needs review" icon={AlertTriangle} variant="destructive">
          {comparison?.promotionGate?.reason}
        </Notice>
      ) : null}

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <UnifiedCard tone="review">
          <UnifiedCardHeader
            title="Current vs Candidate"
            supporting={
              <>
                <Badge variant="light" color="gray">Baseline {scorePercent(baseline?.aggregateScore)}%</Badge>
                <Badge variant="light" color={gateColor(candidate?.gateOutcome)}>Candidate {candidate?.gateOutcome}</Badge>
              </>
            }
          />
          <UnifiedCardBody>
            <Stack gap="xs">
              <Group justify="space-between">
                <BodyText>Baseline quality</BodyText>
                <MetaText>{scorePercent(baseline?.aggregateScore)}%</MetaText>
              </Group>
              <Progress value={scorePercent(baseline?.aggregateScore)} color="gray" />
              <Group justify="space-between">
                <BodyText>Candidate quality</BodyText>
                <MetaText>{scorePercent(candidate?.aggregateScore)}%</MetaText>
              </Group>
              <Progress value={scorePercent(candidate?.aggregateScore)} color={gateColor(candidate?.gateOutcome)} />
            </Stack>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Case</Table.Th>
                  <Table.Th>Baseline</Table.Th>
                  <Table.Th>Candidate</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(comparison?.regressedCases || []).concat(comparison?.improvedCases || []).map((item: any) => (
                  <Table.Tr key={item.caseId}>
                    <Table.Td>{item.title}</Table.Td>
                    <Table.Td>{scorePercent(item.baselineScore)}%</Table.Td>
                    <Table.Td>{scorePercent(item.candidateScore)}%</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="knowmore">
          <UnifiedCardHeader title="Seeded Cases" supporting={<Badge variant="light" color="knowmore">{candidate?.cases?.length ?? 0} cases</Badge>} />
          <UnifiedCardBody>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Case</Table.Th>
                  <Table.Th>Kind</Table.Th>
                  <Table.Th>Score</Table.Th>
                  <Table.Th>Gate</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(candidate?.cases || []).map((testCase: any) => (
                  <Table.Tr key={testCase.caseId}>
                    <Table.Td>{testCase.title}</Table.Td>
                    <Table.Td>{testCase.kind}</Table.Td>
                    <Table.Td>{scorePercent(testCase.score)}%</Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={gateColor(testCase.gateOutcome)}>
                        {testCase.gateOutcome}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </UnifiedCardBody>
        </UnifiedCard>
      </SimpleGrid>

      <UnifiedCard tone="tactical">
        <UnifiedCardHeader title="Failed Case Reasons" supporting={<Badge variant="light" color="tactical">{failedCases.length} failures</Badge>} />
        <UnifiedCardBody>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
            {failedCases.map((testCase: any) => (
              <Stack key={testCase.caseId} gap="xs">
                <Group gap="xs">
                  <Badge variant="outline" color={gateColor(testCase.gateOutcome)}>{testCase.gateOutcome}</Badge>
                  <MetaText>{scorePercent(testCase.score)}%</MetaText>
                </Group>
                <BodyText>{testCase.title}</BodyText>
                <Stack gap={4}>
                  {testCase.reasons.map((reason: string) => (
                    <MetaText key={reason}>{reason}</MetaText>
                  ))}
                </Stack>
              </Stack>
            ))}
          </SimpleGrid>
        </UnifiedCardBody>
      </UnifiedCard>

      <UnifiedCard tone="strategy">
        <UnifiedCardHeader
          title="Local MLX Candidate Runs"
          supporting={<Badge variant="light" color="strategy">{learningRuns.length} runs</Badge>}
        />
        <UnifiedCardBody>
          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md" mb="md">
            <MetricCard
              icon={Brain}
              color="strategy"
              label="Active Model"
              value={registry?.active?.candidateName || "None"}
              detail={registry?.active?.alias || "No promoted local learning candidate"}
            />
            <MetricCard
              icon={Flask}
              color="review"
              label="Canary Alias"
              value={registry?.canary?.alias || "None"}
              detail={registry?.canary?.candidateName || "No active canary"}
            />
            <MetricCard
              icon={Upload}
              color="knowmore"
              label="Registry Candidates"
              value={registry?.candidates?.length || 0}
              detail={registry?.updatedAt ? `Updated ${dateLabel(registry.updatedAt)}` : "Registry not initialized yet"}
            />
          </SimpleGrid>
          {learningRuns.length === 0 ? (
            <Notice title="No local candidate runs found" icon={Brain}>
              Prepare a local Apple Silicon training run with `npm run training:prepare-mlx` and this internal evaluation surface will surface its manifest and gate state automatically.
            </Notice>
          ) : (
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Candidate</Table.Th>
                  <Table.Th>Gate</Table.Th>
                  <Table.Th>Scores</Table.Th>
                  <Table.Th>Dataset</Table.Th>
                  <Table.Th>Generated</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {learningRuns.map((run: any) => (
                  <Table.Tr key={run.runId}>
                    <Table.Td>
                      <Stack gap={4}>
                        <BodyText>{run.candidateName}</BodyText>
                        <MetaText>{run.companyName}</MetaText>
                        <MetaText>{run.baseModel}</MetaText>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        <Badge variant="light" color={gateColor(run.gateStatus)}>
                          {run.gateStatus}
                        </Badge>
                        <MetaText>{run.gateReason}</MetaText>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {run.report ? (
                        <Stack gap={4}>
                          <MetaText>Baseline {scorePercent(run.report.baselineScore)}%</MetaText>
                          <MetaText>Candidate {scorePercent(run.report.candidateScore)}%</MetaText>
                          <MetaText>{run.report.delta >= 0 ? `+${run.report.delta}` : run.report.delta} delta</MetaText>
                        </Stack>
                      ) : (
                        <MetaText>Evaluation pending</MetaText>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        <MetaText>{run.exportLabel}</MetaText>
                        <MetaText>{run.counts.sftTasks} task SFT</MetaText>
                        <MetaText>{run.counts.sftFlashcards} flashcard SFT</MetaText>
                        <MetaText>{run.counts.evalCases} eval cases</MetaText>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <MetaText>{dateLabel(run.generatedAt)}</MetaText>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        color="strategy"
                        leftSection={<Upload size={14} />}
                        disabled={!run.report}
                        loading={publishingRunId === run.runId}
                        onClick={() => void publishLearningRun(run.runId)}
                      >
                        Publish Gate
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </UnifiedCardBody>
      </UnifiedCard>
        </>
      ) : null}
    </PageShell>
  );
}
