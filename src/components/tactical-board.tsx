'use client';

/**
 * TACTICAL BOARD
 * v1.1.0
 *
 * NOTE: This file must ONLY be imported via dynamic({ ssr: false }) from the
 * page component. @hello-pangea/dnd uses browser-only pointer/DOM APIs.
 */

import { useState, useEffect, useCallback } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  Title,
  Text,
  Group,
  Stack,
  Paper,
  Badge,
  Loader,
  Center,
  Modal,
  Divider,
  ActionIcon,
  Tooltip,
  rem,
  Select,
  Button,
  Box,
  ScrollArea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { PageShell, PageHeader, PipelineAccentHeader } from "@/components/ui/app-shell";
import { Trash2 } from "lucide-react";

type NBAKanbanColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

type NBAItem = {
  id: string;
  publicId?: number | null;
  title: string;
  description: string | null;
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
  kanbanColumn: NBAKanbanColumn;
  sortOrder: number;
  candidateState: string;
  hashtags: string[];
  evaluationReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  qualityScore?: number | null;
  urgencyScore?: number | null;
  freshnessScore?: number | null;
};

const COLUMNS: {
  key: NBAKanbanColumn;
  label: string;
  description: string;
  accent: string;
}[] = [
  { key: "IDEABANK",  label: "Idea Bank", description: "Someday · ICE < 100",  accent: "var(--mantine-color-gray-6)" },
  { key: "ROADMAP",   label: "Roadmap",   description: "Later · ICE ≥ 100",    accent: "var(--mantine-color-cyan-6)" },
  { key: "BACKLOG",   label: "Backlog",   description: "Sooner · ICE ≥ 250",   accent: "var(--mantine-color-blue-6)" },
  { key: "TODO",      label: "Next",      description: "Soon · ICE ≥ 500",     accent: "var(--mantine-color-violet-6)" },
  { key: "CHECKLIST", label: "Now",       description: "Active · ICE ≥ 700",   accent: "var(--mantine-color-orange-6)" },
];

const chartColors: Record<string, string> = {
  blue: "var(--mantine-color-blue-6)",
  amber: "var(--mantine-color-yellow-6)",
  green: "var(--mantine-color-green-6)",
  violet: "var(--mantine-color-violet-6)",
  teal: "var(--mantine-color-teal-6)",
};

const COLUMN_OPTIONS = [
  { value: "IDEABANK",  label: "Idea Bank (Someday)" },
  { value: "ROADMAP",   label: "Roadmap (Later)" },
  { value: "BACKLOG",   label: "Backlog (Sooner)" },
  { value: "TODO",      label: "Next" },
  { value: "CHECKLIST", label: "Now (Checklist)" },
];

// ---------------------------------------------------------------------------
// Card Detail Modal
// ---------------------------------------------------------------------------
function CardDetailModal({
  item,
  opened,
  onClose,
  onMove,
  onDelete,
  onConvert,
}: {
  item: NBAItem | null;
  opened: boolean;
  onClose: () => void;
  onMove: (itemId: string, column: string) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string, targetType: "KNOWLEDGE" | "GOAL") => void;
}) {
  const col = item ? COLUMNS.find(c => c.key === item.kanbanColumn) : null;

  const fmt = (n: number | null | undefined) =>
    n != null ? `${Math.round(n * 100)}%` : "—";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      withinPortal={false}
      zIndex={3000}
      title={
        <Group gap="sm">
          <Text fw={800} size="lg" style={{ letterSpacing: "-0.02em" }}>
            #{item?.publicId ?? "—"} · Task Card
          </Text>
          {col && (
            <Badge
              size="sm"
              style={{ backgroundColor: `${col.accent}22`, color: col.accent }}
            >
              {col.label}
            </Badge>
          )}
        </Group>
      }
      size="xl"
      radius="lg"
      overlayProps={{ blur: 4, opacity: 0.6 }}
      styles={{
        content: { 
          border: "1px solid var(--mantine-color-default-border)",
        }
      }}
    >
      {!item ? (
        <Center py="xl">
          <Loader variant="dots" color="orange" />
        </Center>
      ) : (
        <Stack gap="md" pt="xs">
        {/* Title */}
        <Text fw={700} size="xl" style={{ lineHeight: 1.3 }}>
          {item.title}
        </Text>

        {/* Description */}
        {item.description && (
          <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
            {item.description}
          </Text>
        )}

        <Divider />

        {/* ICE Scores */}
        <Group grow gap="xs">
          {[
            { label: "Impact",     value: item.impact,     color: "var(--mantine-color-orange-6)" },
            { label: "Confidence", value: item.confidence, color: "var(--mantine-color-cyan-6)" },
            { label: "Ease",       value: item.ease,       color: "var(--mantine-color-violet-6)" },
          ].map(s => (
            <Paper key={s.label} p="sm" radius="md" withBorder ta="center">
              <Text size="xl" fw={900} style={{ color: s.color }}>{s.value}</Text>
              <Text size="xs" c="dimmed">{s.label}</Text>
            </Paper>
          ))}
          <Paper p="sm" radius="md" withBorder ta="center">
            <Text size="xl" fw={900} c="orange">{Math.round(item.iceScore)}</Text>
            <Text size="xs" c="dimmed">ICE Score</Text>
          </Paper>
        </Group>

        {/* AI Scores */}
        {(item.qualityScore != null || item.urgencyScore != null || item.freshnessScore != null) && (
          <Paper p="sm" radius="md" withBorder>
            <Text size="xs" fw={700} c="dimmed" mb="xs">AI EVALUATION SIGNALS</Text>
            <Group gap="xl">
              <Stack gap={0}>
                <Text size="sm" fw={700}>{fmt(item.qualityScore)}</Text>
                <Text size="xs" c="dimmed">Quality</Text>
              </Stack>
              <Stack gap={0}>
                <Text size="sm" fw={700}>{fmt(item.urgencyScore)}</Text>
                <Text size="xs" c="dimmed">Urgency</Text>
              </Stack>
              <Stack gap={0}>
                <Text size="sm" fw={700}>{fmt(item.freshnessScore)}</Text>
                <Text size="xs" c="dimmed">Freshness</Text>
              </Stack>
              <Stack gap={0}>
                <Badge size="sm" variant="dot" color="blue">{item.candidateState}</Badge>
                <Text size="xs" c="dimmed">State</Text>
              </Stack>
            </Group>
          </Paper>
        )}

        {/* Evaluation Reason */}
        {item.evaluationReason && (
          <Paper p="sm" radius="md" withBorder>
            <Text size="xs" fw={700} c="dimmed" mb={4}>AI JUDGE REASONING</Text>
            <Text size="xs" style={{ lineHeight: 1.6, fontStyle: "italic" }}>
              {item.evaluationReason}
            </Text>
          </Paper>
        )}

        {/* Hashtags */}
        {item.hashtags?.length > 0 && (
          <Group gap="xs" wrap="wrap">
            {item.hashtags.map(tag => (
              <Badge key={tag} size="xs" variant="outline" color="gray" radius="sm">
                #{tag}
              </Badge>
            ))}
          </Group>
        )}

        <Divider label="MOVE TO COLUMN" labelPosition="center" />

        {/* Move Action */}
        <Group justify="space-between">
          <Select
            data={COLUMN_OPTIONS}
            defaultValue={item.kanbanColumn}
            size="sm"
            radius="md"
            style={{ flex: 1 }}
            onChange={(val) => {
              if (val && val !== item.kanbanColumn) {
                onMove(item.id, val);
                onClose();
              }
            }}
            label="Move to tactical horizon"
          />
        </Group>

        {/* Conversion Controls */}
        <Divider label="Cataloging Controls" labelPosition="center" mt="xl" />
        <Stack gap="xs" mt="xs">
          <Text size="xs" ta="center" c="dimmed">Recatalog this intelligence unit if it belongs in a different layer.</Text>
          <Group justify="center">
            <Button variant="light" color="knowledge" size="xs" onClick={() => onConvert(item.id, "KNOWLEDGE")}>
              Move to Knowledge
            </Button>
            <Button variant="light" color="strategy" size="xs" onClick={() => onConvert(item.id, "GOAL")}>
              Move to Strategic Goal
            </Button>
          </Group>
        </Stack>

        <Divider mt="xl" />
        <Group justify="flex-end">
            <Button variant="light" color="red" leftSection={<Trash2 size={16} />} onClick={() => onDelete(item.id)}>
              Archive Card
            </Button>
            <Button variant="filled" color="orange" onClick={onClose}>
              Done
            </Button>
        </Group>

        {/* Timestamps */}
        <Text size="xs" c="dimmed" ta="right">
          Created {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"} ·
          Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}
        </Text>
        </Stack>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Board
// ---------------------------------------------------------------------------
export function TacticalBoard({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);

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
    const interval = setInterval(fetchItems, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to archive this task?")) return;
    await fetch(`/api/nba?id=${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
    setDetailId(null);
  };

  const handleConvert = async (id: string, targetType: "KNOWLEDGE" | "GOAL") => {
    try {
      const res = await fetch("/api/intelligence/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: id,
          sourceType: "TASKCARD",
          targetType: targetType === "KNOWLEDGE" ? "FLASHCARD" : "GOALCARD",
          companyId
        })
      });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        setDetailId(null);
      }
    } catch (err) {
      console.error("Conversion failed:", err);
    }
  };

  const handleOpenCard = (item: NBAItem) => {
    setDetailId(item.id);
    openModal();
  };

  const handleMoveItem = useCallback(async (itemId: string, column: string) => {
    // Optimistic update
    setItems(prev =>
      prev.map(i =>
        i.id === itemId
          ? { ...i, kanbanColumn: column as NBAKanbanColumn, sortOrder: -(Date.now()) }
          : i
      )
    );
    try {
      await fetch(`/api/nba?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn: column, sortOrder: -(Date.now()) }),
      });
    } catch {
      fetchItems();
    }
  }, [fetchItems]);

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    await handleMoveItem(draggableId, destination.droppableId);
  }, [handleMoveItem]);

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
    <Box h="100vh" style={{ display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: 'var(--mantine-color-body)' }}>

      <CardDetailModal
        item={detailId ? items.find(i => i.id === detailId) || null : null}
        opened={modalOpened}
        onClose={() => { closeModal(); setDetailId(null); }}
        onMove={handleMoveItem}
        onDelete={handleDelete}
        onConvert={handleConvert}
      />

      <DragDropContext onDragEnd={onDragEnd}>
      <Box 
        style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}
        p="xl"
      >
        <PipelineAccentHeader 
          activeKey="tactical" 
          title="Tactical Board" 
          icon="dashboard" 
        />
          <Group 
            wrap="nowrap" 
            align="flex-start" 
            gap="md" 
            h="100%"
          >
            {COLUMNS.map((col) => {
              const colItems = items
                .filter(i => i.kanbanColumn === col.key)
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

              return (
                <Stack 
                  key={col.key} 
                  gap="sm" 
                  w={300} 
                  h="100%"
                  style={{ flexShrink: 0 }}
                >
                  {/* Column Header */}
                  <Paper
                    p="sm"
                    radius="md"
                    withBorder
                    style={{
                      borderTop: `3px solid ${col.accent}`,
                      flexShrink: 0
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2} style={{ overflow: 'hidden' }}>
                        <Text fw={800} size="sm" style={{ color: col.accent, letterSpacing: "-0.01em" }} truncate>
                          {col.label}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>{col.description}</Text>
                      </Stack>
                      <Badge
                        size="sm"
                        variant="light"
                        color={col.accent}
                        style={{ backgroundColor: `${col.accent}22`, color: col.accent }}
                      >
                        {colItems.length}
                      </Badge>
                    </Group>
                  </Paper>

                  {/* Droppable — plain div is required here for provided.innerRef and provided.droppableProps */}
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <Box
                        component="div"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          flex: 1,
                          borderRadius: 'var(--mantine-radius-md)',
                          border: snapshot.isDraggingOver
                            ? `1.5px dashed ${col.accent}`
                            : "1.5px dashed transparent",
                          backgroundColor: snapshot.isDraggingOver
                            ? `${col.accent}0d`
                            : "transparent",
                          transition: "all 0.15s ease",
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 0 // Crucial for flex child scrolling
                        }}
                      >
                        <ScrollArea offsetScrollbars style={{ flex: 1 }} viewportProps={{ style: { display: 'flex', flexDirection: 'column' } }}>
                          <Stack gap="xs" p={4} style={{ flex: 1 }}>
                            {colItems.map((item, index) => (
                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => (
                                  <Box
                                    component="div"
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    style={{ ...provided.draggableProps.style }}
                                  >
                                    <Paper
                                      p="sm"
                                      radius="md"
                                      withBorder
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        handleOpenCard(item);
                                      }}
                                      style={{
                                        boxShadow: snapshot.isDragging
                                          ? "0 16px 40px rgba(0,0,0,0.5)"
                                          : "none",
                                        cursor: snapshot.isDragging ? "grabbing" : "pointer",
                                        borderColor: snapshot.isDragging
                                          ? col.accent
                                          : "transparent",
                                        transform: snapshot.isDragging ? "rotate(1.5deg)" : "none",
                                        transition: "box-shadow 0.15s ease, background 0.15s ease",
                                        userSelect: "none",
                                      }}
                                    >
                                      <Stack gap={6}>
                                        <Text size="xs" fw={700} lineClamp={2} style={{ lineHeight: 1.35 }}>
                                          {item.title}
                                        </Text>
                                        {item.description && (
                                          <Text size="xs" c="dimmed" lineClamp={2} style={{ lineHeight: 1.4 }}>
                                            {item.description}
                                          </Text>
                                        )}
                                        <Group justify="space-between" mt={2} wrap="nowrap">
                                          <Badge size="xs" variant="dot" color={item.impact >= 8 ? "red" : item.impact >= 5 ? "yellow" : "gray"}>
                                            {item.candidateState}
                                          </Badge>
                                          <Text size="xs" fw={900} style={{ color: col.accent, fontVariantNumeric: "tabular-nums" }}>
                                            {Math.round(item.iceScore)}
                                          </Text>
                                        </Group>
                                      </Stack>
                                    </Paper>
                                  </Box>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </Stack>
                        </ScrollArea>
                      </Box>
                    )}
                  </Droppable>
                </Stack>
              );
            })}
          </Group>
        </Box>
      </DragDropContext>
    </Box>
  );
}
