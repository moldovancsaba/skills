/**
 * TOPICS FOCUS PAGE
 * v0.15.0-HARDENED
 * 
 * Implements Unified Page Architecture:
 * - PageShell: Full-Width Layout
 * - UnifiedGrid: 3-Column Desktop Display
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { 
  Stack, 
  Group, 
  Text, 
  Card,
  Badge as MantineBadge,
  ActionIcon,
  Tooltip,
  Title,
  Button,
  Checkbox,
  TextInput,
  rem,
  Center,
  Loader,
  Box,
  Transition,
  Divider,
  ThemeIcon
} from "@mantine/core";
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown, Info, LayoutList } from "lucide-react";
import { Notice, PageHeader, PageShell, UnifiedGrid, PipelineAccentHeader } from "@/components/ui/app-shell";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardActions, 
} from "@/components/ui/unified-card";

type Topic = {
  id: string;
  companyId: string;
  label: string;
  active: boolean;
  sortOrder: number;
  notes?: string | null;
};

type Company = {
  id: string;
  name: string;
};

async function fetchTopicsPageData(companyId: string) {
  const [companiesRes, topicsRes] = await Promise.all([
    fetch("/api/companies").then((res) => res.json()),
    fetch(`/api/topics?companyId=${companyId}`).then((res) => res.json()),
  ]);

  return {
    company: Array.isArray(companiesRes)
      ? companiesRes.find((item: Company) => item.id === companyId) ?? null
      : null,
    topics: Array.isArray(topicsRes) ? topicsRes : [],
  };
}

function reorder<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function CompanyTopicsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function initializePage() {
      const { company: found, topics: nextTopics } = await fetchTopicsPageData(companyId);
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
  }, [companyId, router]);

  const loadPage = useCallback(async () => {
    const { topics: nextTopics } = await fetchTopicsPageData(companyId);
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

  if (loading) {
    return (
      <Center h="100vh">
        <Loader size="xl" variant="bars" color="brand" />
      </Center>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="topics" 
          title="Topic Synthesis" 
          icon="list_alt" 
        />
        {message && (
          <Notice title="Protocol Updated">
            {message}
          </Notice>
        )}

        <Card radius="lg" withBorder p="xl">
          <Stack gap="md">
            <Text size="xs" fw={900} tt="uppercase" lts={1.5} c="dimmed">Identify New Intelligence Frontier</Text>
            <Group gap="md" align="flex-end" wrap="nowrap">
              <TextInput
                label="Strategic Topic Label"
                description="What domain should the AI prioritize for research?"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g., market landscape analysis, pricing strategy..."
                style={{ flex: 1 }}
                radius="md"
              />
              <Button 
                onClick={() => void addTopic()}
                size="md"
                radius="md"
                leftSection={<Plus size={16} />}
              >
                Add Focus
              </Button>
            </Group>
          </Stack>
        </Card>

        <Stack gap="xs">
          <Group gap="sm">
            <Title order={2} size="h3" fw={900} lts={-0.5}>Strategic Hierarchy</Title>
            <MantineBadge variant="light" color="gray" radius="sm">{orderedTopics.length} Units</MantineBadge>
          </Group>
          <Text size="sm" c="dimmed" fw={500} style={{ fontStyle: "italic" }}>
            Prioritize topics by reordering. Top-level units receive maximum synthesis yield.
          </Text>
        </Stack>

        <UnifiedGrid>
          {orderedTopics.map((topic, index) => {
            const supportingBadge = (
              <Group gap={6}>
                <MantineBadge variant="outline" color="gray" size="xs" fw={900}>
                  {index + 1}
                </MantineBadge>
                <MantineBadge 
                  variant="light" 
                  color={topic.active ? "green" : "gray"} 
                  size="xs"
                  fw={900}
                >
                  {topic.active ? "ACTIVE" : "PAUSED"}
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
                  transition: 'opacity 0.2s ease'
                }}
              >
                <UnifiedCard>
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
                          color="brand"
                        />
                        <Box style={{ flex: 1 }}>
                          <Text size="xs" fw={900} tt="uppercase" lts={1} c="dimmed">Research Status</Text>
                          <Text size="sm" fw={600} c={topic.active ? "white" : "dimmed"}>
                            {topic.active ? "Actively harvesting strategic intelligence" : "Research focus suspended"}
                          </Text>
                        </Box>
                      </Group>

                      <Divider variant="dotted" />

                      <UnifiedCardActions>
                        <Group justify="space-between" w="100%">
                          <Group gap={4}>
                            <Tooltip label="Move Up">
                              <ActionIcon 
                                variant="light" 
                                color="gray" 
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
                                color="gray" 
                                size="lg"
                                disabled={index === orderedTopics.length - 1}
                                onClick={() => void persistOrder(reorder(orderedTopics, index, index + 1))}
                              >
                                <ArrowDown size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>

                          <Group gap="sm">
                            <ThemeIcon variant="transparent" color="gray" opacity={0.3}>
                              <GripVertical size={16} />
                            </ThemeIcon>
                            <Tooltip label="Archive Focus">
                              <ActionIcon 
                                variant="light" 
                                color="red" 
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
          <Card radius="lg" withBorder p={rem(60)} ta="center" style={{ borderStyle: 'dashed' }}>
            <Stack align="center" gap="md">
              <ThemeIcon variant="light" color="gray" size="xl" radius="xl">
                <LayoutList size={24} />
              </ThemeIcon>
              <Text size="sm" c="dimmed" fs="italic">No focus topics established. Define your first intelligence frontier above.</Text>
            </Stack>
          </Card>
        )}
      </Stack>
    </PageShell>
  );
}
