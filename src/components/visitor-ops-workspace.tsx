"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Group, Loader, ScrollArea, Stack, Table, Tabs, TextInput } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { BodyText, MetaText } from "@/components/ui/typography";

type Snapshot = {
  visitorKey: string;
  destinationKey: string;
  blueprint: Record<string, unknown> | null;
  taxonomy: Record<string, unknown> | null;
  sources: Array<Record<string, unknown>>;
  refreshQueue: { dueCount: number; totalSources: number; queue: Array<Record<string, unknown>> };
  flashcards: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  reviewPackets: Array<Record<string, unknown>>;
  reviewQueueCount: number;
  published: Array<Record<string, unknown>>;
  feedbackMemory: Array<Record<string, unknown>>;
  refinementRuns: Array<Record<string, unknown>>;
  publicVerification: Record<string, unknown>;
};

function RowValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <MetaText>-</MetaText>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return <BodyText>{String(value)}</BodyText>;
  return <BodyText>{JSON.stringify(value)}</BodyText>;
}

export function VisitorOpsWorkspace({ companyId, defaultVisitorKey = "rangescout-hungary" }: { companyId: string; defaultVisitorKey?: string }) {
  const [visitorKey, setVisitorKey] = useState(defaultVisitorKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/visitor/${encodeURIComponent(visitorKey)}/ops/snapshot?companyId=${encodeURIComponent(companyId)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.snapshot) {
        throw new Error(String(payload?.error || "Visitor ops snapshot unavailable"));
      }
      setSnapshot(payload.snapshot as Snapshot);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Visitor ops snapshot unavailable");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, visitorKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const sections = useMemo(() => ([
    ["Blueprint", snapshot?.blueprint],
    ["Taxonomy", snapshot?.taxonomy],
    ["Public Verification", snapshot?.publicVerification],
  ] as const), [snapshot]);

  return (
    <PageShell width="full">
      <Stack gap="lg">
        <PageHeader
          title="Visitor Ops"
          description="Operational control surface for blueprint, source graph, candidates, review, publish, and feedback refinement."
          actions={(
            <Group>
              <TextInput
                aria-label="Visitor key"
                value={visitorKey}
                onChange={(event) => setVisitorKey(event.currentTarget.value)}
                placeholder="rangescout-hungary"
              />
              <Button leftSection={<IconRefresh size={14} />} onClick={() => void load()} loading={loading}>Refresh</Button>
            </Group>
          )}
        />

        {error ? <Notice title="Visitor ops unavailable" variant="destructive">{error}</Notice> : null}
        {loading && !snapshot ? <Loader /> : null}

        {snapshot ? (
          <Tabs defaultValue="blueprint">
            <Tabs.List>
              <Tabs.Tab value="blueprint">Blueprint</Tabs.Tab>
              <Tabs.Tab value="source-graph">Source Graph</Tabs.Tab>
              <Tabs.Tab value="knowledge-pack">Knowledge Pack</Tabs.Tab>
              <Tabs.Tab value="candidates">Candidates</Tabs.Tab>
              <Tabs.Tab value="review">Review</Tabs.Tab>
              <Tabs.Tab value="published">Published</Tabs.Tab>
              <Tabs.Tab value="feedback-memory">Feedback Memory</Tabs.Tab>
              <Tabs.Tab value="refinement-runs">Refinement Runs</Tabs.Tab>
              <Tabs.Tab value="public-verification">Public Verification</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="blueprint" pt="md">
              <Stack>
                {sections.map(([label, value]) => (
                  <UnifiedCard key={label} tone="neutral">
                    <UnifiedCardHeader title={label} />
                    <UnifiedCardBody>
                      <RowValue value={value} />
                    </UnifiedCardBody>
                  </UnifiedCard>
                ))}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="source-graph" pt="md">
              <Stack>
                <Group>
                  <Badge>{snapshot.sources.length} Sources</Badge>
                  <Badge color={snapshot.refreshQueue.dueCount > 0 ? "orange" : "green"}>{snapshot.refreshQueue.dueCount} Due</Badge>
                </Group>
                <ScrollArea>
                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead><Table.Tr><Table.Th>URL</Table.Th><Table.Th>Trust</Table.Th><Table.Th>Type</Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {snapshot.sources.slice(0, 100).map((source, index) => (
                        <Table.Tr key={`${String(source.sourceId || index)}`}>
                          <Table.Td>{String(source.canonicalUrl || source.url || "")}</Table.Td>
                          <Table.Td>{String(source.trustTier || "")}</Table.Td>
                          <Table.Td>{String(source.datacardType || "")}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="knowledge-pack" pt="md">
              <Badge>{snapshot.flashcards.length} Flashcards</Badge>
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead><Table.Tr><Table.Th>Front</Table.Th><Table.Th>Applies To</Table.Th><Table.Th>Confidence</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {snapshot.flashcards.slice(0, 100).map((card, index) => (
                      <Table.Tr key={`${String(card.id || index)}`}>
                        <Table.Td>{String(card.front || "")}</Table.Td>
                        <Table.Td>{JSON.stringify(card.appliesTo || [])}</Table.Td>
                        <Table.Td>{String(card.confidence || "")}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="candidates" pt="md">
              <Badge>{snapshot.candidates.length} Candidates</Badge>
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead><Table.Tr><Table.Th>ID</Table.Th><Table.Th>Status</Table.Th><Table.Th>Type</Table.Th><Table.Th>Source</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {snapshot.candidates.slice(0, 200).map((candidate, index) => (
                      <Table.Tr key={`${String(candidate.id || index)}`}>
                        <Table.Td>{String(candidate.id || "")}</Table.Td>
                        <Table.Td>{String(candidate.status || "")}</Table.Td>
                        <Table.Td>{String(candidate.proposedType || "")}</Table.Td>
                        <Table.Td>{String(candidate.canonicalSourceUrl || "")}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="review" pt="md">
              <Group>
                <Badge>{snapshot.reviewQueueCount} Awaiting Review</Badge>
                <Button component={Link} href={`/${companyId}/review?destinationKey=${encodeURIComponent(snapshot.destinationKey)}`}>Open Review Queue</Button>
              </Group>
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead><Table.Tr><Table.Th>Packet</Table.Th><Table.Th>Candidate</Table.Th><Table.Th>State</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {snapshot.reviewPackets.slice(0, 200).map((packet, index) => (
                      <Table.Tr key={`${String(packet.id || index)}`}>
                        <Table.Td>{String(packet.id || "")}</Table.Td>
                        <Table.Td>{String(packet.candidateId || "")}</Table.Td>
                        <Table.Td>{String(packet.packetState || "")}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="published" pt="md">
              <Badge>{snapshot.published.length} Published</Badge>
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead><Table.Tr><Table.Th>ID</Table.Th><Table.Th>Status</Table.Th><Table.Th>Source</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {snapshot.published.slice(0, 200).map((item, index) => (
                      <Table.Tr key={`${String(item.id || index)}`}>
                        <Table.Td>{String(item.id || "")}</Table.Td>
                        <Table.Td>{String(item.status || "")}</Table.Td>
                        <Table.Td>{String(item.canonicalSourceUrl || "")}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Tabs.Panel>

            <Tabs.Panel value="feedback-memory" pt="md">
              <Badge>{snapshot.feedbackMemory.length} Feedback Rules</Badge>
              <RowValue value={snapshot.feedbackMemory.slice(0, 200)} />
            </Tabs.Panel>

            <Tabs.Panel value="refinement-runs" pt="md">
              <Badge>{snapshot.refinementRuns.length} Runs</Badge>
              <RowValue value={snapshot.refinementRuns.slice(0, 200)} />
            </Tabs.Panel>

            <Tabs.Panel value="public-verification" pt="md">
              <RowValue value={snapshot.publicVerification} />
            </Tabs.Panel>
          </Tabs>
        ) : null}
      </Stack>
    </PageShell>
  );
}
