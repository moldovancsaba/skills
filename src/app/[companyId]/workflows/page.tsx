'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Group, Loader, SegmentedControl, SimpleGrid, Stack, Switch, Table } from "@mantine/core";
import { IconGitBranch as GitBranch, IconWand as Wand } from "@tabler/icons-react";
import { Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";

export default function WorkflowsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [enrichment, setEnrichment] = useState<{ definitions: any[]; items: any[] }>({ definitions: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [workflowResponse, enrichmentResponse] = await Promise.all([
        fetch(`/api/workflows?companyId=${companyId}`),
        fetch(`/api/enrichment-policies?companyId=${companyId}`),
      ]);
      if (!workflowResponse.ok) throw new Error("Failed to load workflows");
      if (!enrichmentResponse.ok) throw new Error("Failed to load enrichment policies");
      setWorkflows(await workflowResponse.json());
      setEnrichment(await enrichmentResponse.json());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load workflow settings");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const updateWorkflow = useCallback(
    async (workflow: any, patch: Record<string, unknown>) => {
      setErrorMessage(null);
      const response = await fetch("/api/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          blueprintId: workflow.id,
          controlMode: patch.controlMode ?? workflow.controlMode,
          queueColumn: patch.queueColumn ?? workflow.queueColumn,
          status: patch.status ?? workflow.status,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update workflow");
      }
      await loadAll();
    },
    [companyId, loadAll],
  );

  const runWorkflowUpdate = useCallback(
    (workflow: any, patch: Record<string, unknown>) => {
      void updateWorkflow(workflow, patch).catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : "Failed to update workflow");
      });
    },
    [updateWorkflow],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAll();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  if (loading) {
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
        title="Workflows & Enrichment"
        description="Bounded workflow blueprints and enrichment rules that feed the shared local AI queue."
      />

      <Notice title="First delivery slice">
        Active workflow blueprints materialize into the same persisted AI queue that the local worker executes. Human-guided mode keeps your placement decisions sticky until you hand control back to AI-only scheduling.
      </Notice>

      {errorMessage ? <Notice variant="destructive">{errorMessage}</Notice> : null}

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <UnifiedCard tone="review">
          <UnifiedCardHeader title="Workflow Blueprints" supporting={<Badge variant="light" color="review">{workflows.length} blueprints</Badge>} />
          <UnifiedCardBody>
            <Stack gap="md">
              {workflows.map((workflow) => (
                <Stack key={workflow.id} gap="xs">
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Badge variant="outline" color="gray">{workflow.triggerType}</Badge>
                      <Badge variant="light" color="review">{workflow.queueColumn}</Badge>
                    </Group>
                    <MetaText>{new Date(workflow.updatedAt).toLocaleString()}</MetaText>
                  </Group>
                  <BodyText>{workflow.name}</BodyText>
                  <BodyText>{workflow.description}</BodyText>
                  <SegmentedControl
                    value={workflow.status}
                    data={[
                      { value: "ACTIVE", label: "Active" },
                      { value: "PAUSED", label: "Paused" },
                    ]}
                    onChange={(value) => {
                      runWorkflowUpdate(workflow, { status: value });
                    }}
                  />
                  <SegmentedControl
                    value={workflow.queueColumn}
                    data={[
                      { value: "NOW", label: "Now" },
                      { value: "SOON", label: "Soon" },
                      { value: "LATER", label: "Later" },
                      { value: "PARKED", label: "Parked" },
                    ]}
                    onChange={(value) => {
                      runWorkflowUpdate(workflow, { queueColumn: value });
                    }}
                  />
                  <SegmentedControl
                    value={workflow.controlMode}
                    data={[
                      { value: "AI_ONLY", label: "AI only" },
                      { value: "HUMAN_GUIDED", label: "Human guided" },
                    ]}
                    onChange={(value) => {
                      runWorkflowUpdate(workflow, { controlMode: value });
                    }}
                  />
                </Stack>
              ))}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="strategy">
          <UnifiedCardHeader title="Enrichment Waterfall" supporting={<Badge variant="light" color="strategy">{enrichment.items.length} rules</Badge>} />
          <UnifiedCardBody>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Entity</Table.Th>
                  <Table.Th>Provider</Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Enabled</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {enrichment.items.map((policy) => (
                  <Table.Tr key={policy.id}>
                    <Table.Td>{policy.entityType}</Table.Td>
                    <Table.Td>{policy.providerKey}</Table.Td>
                    <Table.Td>{policy.priority}</Table.Td>
                    <Table.Td>
                      <Switch
                        checked={policy.enabled}
                        onChange={async (event) => {
                          await fetch("/api/enrichment-policies", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              companyId,
                              policyId: policy.id,
                              enabled: event.currentTarget.checked,
                              priority: policy.priority,
                              strategy: policy.strategy,
                            }),
                          });
                          await loadAll();
                        }}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </UnifiedCardBody>
        </UnifiedCard>
      </SimpleGrid>
    </PageShell>
  );
}
