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
  ActionIcon, 
  ScrollArea,
  rem,
  Tooltip,
  Box,
  Loader,
  Center
} from "@mantine/core";
import { PageShell, PageHeader } from "@/components/ui/app-shell";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

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
};

const COLUMNS: { key: NBAKanbanColumn; label: string; description: string; color: string }[] = [
  { key: "IDEABANK", label: "Idea Bank", description: "Someday / Maybe", color: "gray" },
  { key: "ROADMAP", label: "Roadmap", description: "Later", color: "cyan" },
  { key: "BACKLOG", label: "Backlog", description: "Sooner", color: "blue" },
  { key: "TODO", label: "Next", description: "Soon", color: "indigo" },
  { key: "CHECKLIST", label: "Checklist", description: "Now (Visible in NBA)", color: "orange" },
];

export function TacticalBoard({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { company } = useStore();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/nba?companyId=${companyId}&all=true`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error("[KANBAN] Fetch failed:", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const item = items.find(i => i.id === draggableId);
    if (!item) return;

    // Optimistic Update
    const newColumn = destination.droppableId as NBAKanbanColumn;
    const newItems = Array.from(items);
    const [moved] = newItems.splice(newItems.findIndex(i => i.id === draggableId), 1);
    
    // Calculate new sortOrder (§24 - userPriority override)
    // We use a negative number to represent high priority manual placement
    const newSortOrder = -(items.length + 1000 - destination.index);

    const updatedItem = { ...moved, kanbanColumn: newColumn, sortOrder: newSortOrder };
    newItems.push(updatedItem);
    setItems(newItems);

    try {
      await fetch(`/api/nba?id=${draggableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          kanbanColumn: newColumn,
          sortOrder: newSortOrder 
        }),
      });
      // Optionally re-fetch to ensure sync
      // fetchItems();
    } catch (error) {
      console.error("[KANBAN] Update failed:", error);
      fetchItems(); // Rollback
    }
  };

  if (loading && items.length === 0) {
    return (
      <PageShell width="full">
        <Center h={400}>
          <Stack align="center">
            <Loader size="lg" variant="dots" />
            <Text c="dimmed">Synchronizing Tactical Board...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <PageHeader 
        title="Tactical Board" 
        description="AI-orchestrated Kanban for strategic execution. Drag to set hard priority feedback."
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <Box 
          style={{ 
            display: 'grid', 
            gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(300px, 1fr))`,
            gap: rem(16),
            alignItems: 'start'
          }}
        >
          {COLUMNS.map((col) => {
            const colItems = items
              .filter(i => i.kanbanColumn === col.key)
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            return (
              <Stack key={col.key} gap="md">
                <Paper p="sm" radius="md" withBorder bg="var(--mantine-color-dark-8)">
                  <Group justify="space-between" mb="xs">
                    <Stack gap={0}>
                      <Title order={4} style={{ letterSpacing: '-0.02em' }}>{col.label}</Title>
                      <Text size="xs" c="dimmed">{col.description}</Text>
                    </Stack>
                    <Badge color={col.color} variant="light" radius="sm">
                      {colItems.length}
                    </Badge>
                  </Group>
                </Paper>

                <Droppable droppableId={col.key}>
                  {(provided, snapshot) => (
                    <ScrollArea 
                      h="calc(100vh - 280px)" 
                      offsetScrollbars
                      viewportProps={{ ref: provided.innerRef }}
                      {...provided.droppableProps}
                      className={cn(
                        "rounded-xl transition-colors duration-200 min-h-[100px] p-2",
                        snapshot.isDraggingOver ? "bg-zinc-800/30" : "bg-transparent"
                      )}
                    >
                      <Stack gap="sm">
                        {colItems.map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index}>
                            {(provided, snapshot) => (
                              <Paper
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                p="md"
                                radius="md"
                                withBorder
                                bg={snapshot.isDragging ? "var(--mantine-color-dark-6)" : "var(--mantine-color-dark-7)"}
                                style={{
                                  ...provided.draggableProps.style,
                                  boxShadow: snapshot.isDragging ? '0 8px 24px rgba(0,0,0,0.3)' : 'none',
                                  transition: 'background-color 0.2s ease, transform 0.2s ease',
                                }}
                                className="group hover:border-zinc-500/50"
                              >
                                <Stack gap="xs">
                                  <Group justify="space-between" wrap="nowrap">
                                    <Text size="sm" fw={700} className="line-clamp-2 leading-tight">
                                      {item.title}
                                    </Text>
                                    <Badge size="xs" variant="outline" color={item.impact > 7 ? "red" : "gray"}>
                                      {item.impact}
                                    </Badge>
                                  </Group>
                                  
                                  <Text size="xs" c="dimmed" className="line-clamp-2">
                                    {item.description}
                                  </Text>

                                  <Group justify="space-between" mt="xs">
                                    <Badge size="xs" radius="xs" variant="dot" color="blue">
                                      {item.candidateState}
                                    </Badge>
                                    <Text size="xs" fw={700} c="orange">
                                      ICE: {Math.round(item.iceScore)}
                                    </Text>
                                  </Group>
                                </Stack>
                              </Paper>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </Stack>
                    </ScrollArea>
                  )}
                </Droppable>
              </Stack>
            );
          })}
        </Box>
      </DragDropContext>
    </PageShell>
  );
}
