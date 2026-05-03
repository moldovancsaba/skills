'use client';

import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { 
  Title, 
  Text, 
  Group, 
  Stack, 
  Paper, 
  Badge,
  Loader,
  Center,
  rem,
} from "@mantine/core";
import { PageShell, PageHeader } from "@/components/ui/app-shell";

type NBAKanbanColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

type NBAItem = {
  id: string;
  title: string;
  description: string | null;
  impact: number;
  confidence: number;
  iceScore: number;
  kanbanColumn: NBAKanbanColumn;
  sortOrder: number;
  candidateState: string;
  hashtags: string[];
};

const COLUMNS: { key: NBAKanbanColumn; label: string; description: string; accent: string }[] = [
  { key: "IDEABANK", label: "Idea Bank", description: "Someday · ICE < 100",   accent: "#6b7280" },
  { key: "ROADMAP",  label: "Roadmap",   description: "Later · ICE ≥ 100",     accent: "#06b6d4" },
  { key: "BACKLOG",  label: "Backlog",   description: "Sooner · ICE ≥ 250",    accent: "#3b82f6" },
  { key: "TODO",     label: "Next",      description: "Soon · ICE ≥ 500",      accent: "#8b5cf6" },
  { key: "CHECKLIST",label: "Now",       description: "Active · ICE ≥ 700",    accent: "#f97316" },
];

export function TacticalBoard({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/nba?companyId=${companyId}&all=true`);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("[KANBAN] Fetch failed:", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchItems();
    // Refresh every 5 minutes to stay in sync with Guardian recomputes
    const interval = setInterval(fetchItems, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newColumn = destination.droppableId as NBAKanbanColumn;

    // Optimistic update — swap column immediately for snappy UX
    setItems(prev =>
      prev.map(i =>
        i.id === draggableId
          ? { ...i, kanbanColumn: newColumn, sortOrder: -(Date.now()) }
          : i
      )
    );

    try {
      await fetch(`/api/nba?id=${draggableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanColumn: newColumn,
          // Negative sortOrder = hard user priority anchor the AI must respect
          sortOrder: -(Date.now()),
        }),
      });
    } catch (error) {
      console.error("[KANBAN] Update failed:", error);
      fetchItems(); // Rollback on failure
    }
  };

  if (loading && items.length === 0) {
    return (
      <PageShell width="full">
        <Center h={400}>
          <Stack align="center" gap="sm">
            <Loader size="lg" variant="dots" color="orange" />
            <Text c="dimmed" size="sm">Synchronizing Tactical Board...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <PageHeader
        title="Tactical Board"
        description="AI-orchestrated 5-horizon planning. Drag cards to set hard priority anchors the AI must respect."
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(260px, 1fr))`,
            gap: rem(12),
            alignItems: "start",
          }}
        >
          {COLUMNS.map((col) => {
            const colItems = items
              .filter(i => i.kanbanColumn === col.key)
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            return (
              <Stack key={col.key} gap="sm">
                {/* Column Header */}
                <Paper
                  p="sm"
                  radius="md"
                  style={{
                    borderTop: `3px solid ${col.accent}`,
                    background: "var(--mantine-color-dark-8)",
                  }}
                >
                  <Group justify="space-between">
                    <Stack gap={2}>
                      <Title order={5} style={{ color: col.accent, letterSpacing: "-0.02em" }}>
                        {col.label}
                      </Title>
                      <Text size="xs" c="dimmed">{col.description}</Text>
                    </Stack>
                    <Badge
                      size="sm"
                      variant="light"
                      style={{ backgroundColor: `${col.accent}22`, color: col.accent }}
                    >
                      {colItems.length}
                    </Badge>
                  </Group>
                </Paper>

                {/* Droppable Column — plain div for correct ref binding */}
                <Droppable droppableId={col.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        minHeight: 80,
                        maxHeight: "calc(100vh - 300px)",
                        overflowY: "auto",
                        borderRadius: rem(12),
                        padding: rem(4),
                        background: snapshot.isDraggingOver
                          ? `${col.accent}11`
                          : "transparent",
                        transition: "background 0.2s ease",
                      }}
                    >
                      <Stack gap="xs">
                        {colItems.map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                              >
                                <Paper
                                  p="sm"
                                  radius="md"
                                  withBorder
                                  style={{
                                    background: snapshot.isDragging
                                      ? "var(--mantine-color-dark-5)"
                                      : "var(--mantine-color-dark-7)",
                                    boxShadow: snapshot.isDragging
                                      ? "0 12px 32px rgba(0,0,0,0.4)"
                                      : "none",
                                    cursor: "grab",
                                    borderColor: snapshot.isDragging
                                      ? col.accent
                                      : "var(--mantine-color-dark-5)",
                                    transition: "box-shadow 0.15s ease, background 0.15s ease",
                                  }}
                                >
                                  <Stack gap={6}>
                                    <Text size="sm" fw={700} lineClamp={2} style={{ lineHeight: 1.3 }}>
                                      {item.title}
                                    </Text>

                                    {item.description && (
                                      <Text size="xs" c="dimmed" lineClamp={2}>
                                        {item.description}
                                      </Text>
                                    )}

                                    <Group justify="space-between" mt={4}>
                                      <Badge
                                        size="xs"
                                        variant="dot"
                                        color={item.impact >= 8 ? "red" : item.impact >= 5 ? "yellow" : "gray"}
                                      >
                                        {item.candidateState}
                                      </Badge>
                                      <Text size="xs" fw={700} style={{ color: col.accent }}>
                                        ICE {Math.round(item.iceScore)}
                                      </Text>
                                    </Group>
                                  </Stack>
                                </Paper>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </Stack>
                    </div>
                  )}
                </Droppable>
              </Stack>
            );
          })}
        </div>
      </DragDropContext>
    </PageShell>
  );
}
