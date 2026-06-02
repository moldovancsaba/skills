'use client';
/**
 * Topics focus page.
 *
 * This route renders company topics through the shared page shell and
 * unified grid/card architecture.
 */
import { Text, Title } from "@/components/ui/typography";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { 
  Stack, Group, Card, Badge as MantineBadge, ActionIcon, Tooltip, Button, Checkbox, TextInput, rem, Center, Loader, Box, Divider, ThemeIcon, Select } from "@mantine/core";
import { IconGripVertical as GripVertical, IconPlus as Plus, IconTrash as Trash2, IconArrowUp as ArrowUp, IconArrowDown as ArrowDown, IconInfoCircle as Info, IconLayoutList as LayoutList, IconLayersIntersect as Layers } from "@tabler/icons-react";
import { EmptyState, Notice, PageHeader, PageShell, UnifiedGrid, PipelineAccentHeader } from "@/components/ui/app-shell";
import { 
  UnifiedCard, 
  UnifiedCardFreshnessBadge,
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardActions, 
} from "@/components/ui/unified-card";
import { getTopicCardFreshness } from "@/lib/card-freshness";
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";
import { CardShareAction } from "@/components/ui/card-share-action";
import type { TopicsInitialData } from "@/lib/server-topics-page-data";

type Topic = {
  id: string;
  companyId: string;
  label: string;
  active: boolean;
  sortOrder: number;
  notes?: string | null;
  iceScore: number;
  confidenceScore: number;
  impact: number;
  weight: number;
  createdAt: string;
  updatedAt: string;
  boardState?: {
    boardKey: string;
    entityType: string;
    columnKey: "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";
    orderRank: number;
    priority: number;
  };
};

type TopicBoardColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

type Company = {
  id: string;
  name: string;
};

async function fetchTopics(companyId: string) {
  const topicsRes = await fetch(`/api/topics?companyId=${companyId}`).then((res) => res.json());
  return Array.isArray(topicsRes) ? topicsRes : [];
}

function reorder<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function CompanyTopicsClient({
  companyId,
  initialData,
}: {
  companyId: string;
  initialData?: TopicsInitialData | null;
}) {
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(initialData?.company ?? null);
  const [topics, setTopics] = useState<Topic[]>(initialData?.topics ?? []);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(!initialData);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || initialData) return;
    let cancelled = false;

    async function initializePage() {
      const dashboardRes = await fetch(`/api/companies/${companyId}/dashboard`);
      if (!dashboardRes.ok) {
        if (!cancelled && (dashboardRes.status === 404 || dashboardRes.status === 403)) {
          router.push("/");
        }
        return;
      }

      const dashboard = await dashboardRes.json();
      const found = dashboard?.company as Company | null;
      const nextTopics = await fetchTopics(companyId);
      if (cancelled) return;
      if (!found) {
        router.push("/");
        return;
      }

      setCompany(found);
      setTopics(nextTopics);
      setLoading(false);
    }

    void initializePage();
    return () => {
      cancelled = true;
    };
  }, [companyId, initialData, router]);

  const loadPage = useCallback(async () => {
    const nextTopics = await fetchTopics(companyId);
    setTopics(nextTopics);
  }, [companyId]);

  const persistOrder = useCallback(async (nextTopics: Topic[]) => {
    setTopics(nextTopics);
    await Promise.all(
      nextTopics.map((topic, index) =>
        fetch(`/api/topics?id=${topic.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: index }),
        }),
      ),
    );
  }, []);

  const addTopic = useCallback(async () => {
    const label = draft.trim();
    if (!label) return;

    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, label }),
    });

    setDraft("");
    setMessage(`Focus established: "${label}"`);
    await loadPage();
    setTimeout(() => setMessage(null), 3000);
  }, [companyId, draft, loadPage]);

  const toggleActive = useCallback(async (topic: Topic) => {
    const newState = !topic.active;
    await fetch(`/api/topics?id=${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: newState }),
    });
    setTopics((current) =>
      current.map((item) => (item.id === topic.id ? { ...item, active: newState } : item)),
    );
  }, []);

  const removeTopic = useCallback(async (topic: Topic) => {
    if (!confirm(`Archive focus topic "${topic.label}"?`)) return;
    await fetch(`/api/topics?id=${topic.id}`, { method: "DELETE" });
    await loadPage();
  }, [loadPage]);

  const orderedTopics = useMemo(
    () => [...topics].sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)),
    [topics],
  );

  const updateBoardState = useCallback(async (topicId: string, destinationColumn: TopicBoardColumn) => {
    await fetch(`/api/topics?id=${encodeURIComponent(topicId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationColumn }),
    });
    await loadPage();
  }, [loadPage]);

  if (loading) {
    return (
      <Center h="100vh">
        <Loader color="synthesis" />
      </Center>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="topics" 
          title="Topic Synthesis" 
          icon={Layers} 
        />
        {message && (
          <Notice title="Protocol Updated">
            {message}
          </Notice>
        )}

        <UnifiedCard tone="synthesis">
          <UnifiedCardBody>
          <Stack gap="md">
            <Text size="xs" c="dimmed">Identify New Intelligence Frontier</Text>
            <Group gap="md" align="flex-end" wrap="nowrap">
              <TextInput
                label="Strategic Topic Label"
                description="What domain should the AI prioritize for research?"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g., market landscape analysis, pricing strategy..."
                flex={1}
              />
              <Button 
                onClick={() => void addTopic()}
                leftSection={<Plus size={16} />}
              >
                Add Focus
              </Button>
            </Group>
          </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

        <Stack gap="xs">
          <Group gap="sm">
            <Title order={2}>Strategic Hierarchy</Title>
            <MantineBadge color="synthesis">{orderedTopics.length} Units</MantineBadge>
          </Group>
          <Text size="sm" c="dimmed">
            Prioritize topics by reordering. Top-level units receive maximum synthesis yield.
          </Text>
        </Stack>

        <UnifiedGrid>
          {orderedTopics.map((topic, index) => {
            const supportingBadge = (
              <Group gap={6} justify="space-between" wrap="nowrap" w="100%">
                <Group gap={6}>
                  <MantineBadge variant="outline" color="gray" size="xs">
                    {index + 1}
                  </MantineBadge>
                  <MantineBadge 
                    variant="light" 
                    color={topic.active ? "knowmore" : "gray"} 
                    size="xs"
                  >
                    {topic.active ? "ACTIVE" : "PAUSED"}
                  </MantineBadge>
                  <MantineBadge variant="light" color="strategy" size="xs">
                    {topic.boardState?.columnKey ?? "BACKLOG"}
                  </MantineBadge>
                  <UnifiedCardFreshnessBadge
                    freshness={getTopicCardFreshness({
                      createdAt: topic.createdAt,
                      updatedAt: topic.updatedAt,
                    })}
                  />
                </Group>
                <MantineBadge variant="light" color={getIceBadgeColor(topic.iceScore)} size="xs">
                  ICE {Math.round(topic.iceScore)}
                </MantineBadge>
              </Group>
            );

            return (
              <Box
                key={topic.id}
                draggable
                onDragStart={() => setDraggingId(topic.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!draggingId || draggingId === topic.id) return;
                  const from = orderedTopics.findIndex((item) => item.id === draggingId);
                  const to = orderedTopics.findIndex((item) => item.id === topic.id);
                  if (from < 0 || to < 0) return;
                  void persistOrder(reorder(orderedTopics, from, to));
                  setDraggingId(null);
                }}
                onDragEnd={() => setDraggingId(null)}
                style={{ 
                  opacity: draggingId === topic.id ? 0.4 : 1,
                  cursor: draggingId === topic.id ? 'grabbing' : 'grab',
                }}
              >
                <UnifiedCard tone="synthesis">
                  <UnifiedCardHeader 
                    supporting={supportingBadge} 
                    title={stripTechnicalMetadata(topic.label)} 
                  />
                  
                  <UnifiedCardBody>
                    <Stack gap="lg">
                      <Group gap="md" align="flex-start" wrap="nowrap">
                        <Checkbox 
                          checked={topic.active} 
                          onChange={() => void toggleActive(topic)} 
                          size="md"
                          color="synthesis"
                        />
                        <Box flex={1}>
                          <Text size="xs" c="dimmed">Research Status</Text>
                          <Text size="sm" c={topic.active ? "white" : "dimmed"}>
                            {topic.active ? "Actively harvesting strategic intelligence" : "Research focus suspended"}
                          </Text>
                        </Box>
                      </Group>

                      <Divider variant="dotted" />

                      <Select
                        label="Board status"
                        size="xs"
                        data={[
                          { value: "IDEABANK", label: "Idea Bank" },
                          { value: "ROADMAP", label: "Roadmap" },
                          { value: "BACKLOG", label: "Backlog" },
                          { value: "TODO", label: "Todo" },
                          { value: "CHECKLIST", label: "Now" },
                        ]}
                        value={topic.boardState?.columnKey ?? "BACKLOG"}
                        onChange={(value) => {
                          if (value) {
                            void updateBoardState(topic.id, value as TopicBoardColumn);
                          }
                        }}
                      />

                      <UnifiedCardActions>
                        <Group justify="space-between" w="100%">
                          <Group gap={4}>
                            <Tooltip label="Move Up">
                              <ActionIcon 
                                variant="light" 
                                color="synthesis" 
                                size="lg"
                                disabled={index === 0}
                                onClick={() => void persistOrder(reorder(orderedTopics, index, index - 1))}
                              >
                                <ArrowUp size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Move Down">
                              <ActionIcon 
                                variant="light" 
                                color="synthesis" 
                                size="lg"
                                disabled={index === orderedTopics.length - 1}
                                onClick={() => void persistOrder(reorder(orderedTopics, index, index + 1))}
                              >
                                <ArrowDown size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>

                          <Group gap="sm">
                            <CardShareAction cardId={topic.id} color="synthesis" size="lg" />
                            <ThemeIcon variant="subtle" color="synthesis" opacity={0.35}>
                              <GripVertical size={16} />
                            </ThemeIcon>
                            <Tooltip label="Archive Focus">
                              <ActionIcon 
                                variant="light" 
                                color="review" 
                                size="lg"
                                onClick={() => void removeTopic(topic)}
                              >
                                <Trash2 size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Group>
                      </UnifiedCardActions>
                    </Stack>
                  </UnifiedCardBody>
                </UnifiedCard>
              </Box>
            );
          })}
        </UnifiedGrid>

        {orderedTopics.length === 0 && (
          <EmptyState
            icon={LayoutList}
            tone="synthesis"
            title="No focus topics established"
            description="Define your first intelligence frontier above."
          />
        )}
      </Stack>
    </PageShell>
  );
}
