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
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { PageShell, PageHeader } from "@/components/ui/app-shell";

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
  { key: "IDEABANK",  label: "Idea Bank", description: "Someday · ICE < 100",  accent: "#6b7280" },
  { key: "ROADMAP",   label: "Roadmap",   description: "Later · ICE ≥ 100",    accent: "#06b6d4" },
  { key: "BACKLOG",   label: "Backlog",   description: "Sooner · ICE ≥ 250",   accent: "#3b82f6" },
  { key: "TODO",      label: "Next",      description: "Soon · ICE ≥ 500",     accent: "#8b5cf6" },
  { key: "CHECKLIST", label: "Now",       description: "Active · ICE ≥ 700",   accent: "#f97316" },
];

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
}: {
  item: NBAItem | null;
  opened: boolean;
  onClose: () => void;
  onMove: (itemId: string, column: string) => void;
}) {
  const col = item ? COLUMNS.find(c => c.key === item.kanbanColumn) : null;

  const fmt = (n: number | null | undefined) =>
    n != null ? `${Math.round(n * 100)}%` : "—";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      withinPortal
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
      overlayProps={{ blur: 4 }}
    >
      {!item ? (
        <Center py="xl">
          <Loader variant="dots" />
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
            { label: "Impact",     value: item.impact,     color: "#f97316" },
            { label: "Confidence", value: item.confidence, color: "#06b6d4" },
            { label: "Ease",       value: item.ease,       color: "#8b5cf6" },
          ].map(s => (
            <Paper key={s.label} p="sm" radius="md" withBorder ta="center" bg="var(--mantine-color-dark-7)">
              <Text size="xl" fw={900} style={{ color: s.color }}>{s.value}</Text>
              <Text size="xs" c="dimmed">{s.label}</Text>
            </Paper>
          ))}
          <Paper p="sm" radius="md" withBorder ta="center" bg="var(--mantine-color-dark-7)">
            <Text size="xl" fw={900} c="orange">{Math.round(item.iceScore)}</Text>
            <Text size="xs" c="dimmed">ICE Score</Text>
          </Paper>
        </Group>

        {/* AI Scores */}
        {(item.qualityScore != null || item.urgencyScore != null || item.freshnessScore != null) && (
          <Paper p="sm" radius="md" withBorder bg="var(--mantine-color-dark-7)">
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
          <Paper p="sm" radius="md" withBorder bg="var(--mantine-color-dark-7)">
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
  const [selectedItem, setSelectedItem] = useState<NBAItem | null>(null);
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

  const handleOpenCard = (item: NBAItem) => {
    console.log("[KANBAN] Opening card:", item.id);
    setSelectedItem(item);
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
    if (selectedItem?.id === itemId) {
      setSelectedItem(prev => prev ? { ...prev, kanbanColumn: column as NBAKanbanColumn } : null);
    }
    try {
      await fetch(`/api/nba?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn: column, sortOrder: -(Date.now()) }),
      });
    } catch {
      fetchItems();
    }
  }, [fetchItems, selectedItem]);

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
    <PageShell width="full">
      <PageHeader
        title="Tactical Board"
        description="AI-orchestrated 5-horizon planning. Drag to set hard priority anchors. Click any card to view details."
      />

      <CardDetailModal
        item={selectedItem}
        opened={modalOpened}
        onClose={closeModal}
        onMove={handleMoveItem}
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(240px, 1fr))`,
            gap: rem(12),
            alignItems: "start",
            overflowX: "auto",
            paddingBottom: rem(24),
          }}
        >
          {COLUMNS.map((col) => {
            const colItems = items
              .filter(i => i.kanbanColumn === col.key)
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            return (
              <Stack key={col.key} gap="sm" style={{ minWidth: 240 }}>
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
                      <Text fw={800} size="sm" style={{ color: col.accent, letterSpacing: "-0.01em" }}>
                        {col.label}
                      </Text>
                      <Text size="xs" c="dimmed">{col.description}</Text>
                    </Stack>
                    <Badge
                      size="sm"
                      style={{ backgroundColor: `${col.accent}22`, color: col.accent }}
                    >
                      {colItems.length}
                    </Badge>
                  </Group>
                </Paper>

                {/* Droppable — plain div required for correct DnD ref binding */}
                <Droppable droppableId={col.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        minHeight: 80,
                        maxHeight: "calc(100vh - 310px)",
                        overflowY: "auto",
                        borderRadius: rem(12),
                        padding: rem(4),
                        border: snapshot.isDraggingOver
                          ? `1.5px dashed ${col.accent}`
                          : "1.5px dashed transparent",
                        background: snapshot.isDraggingOver
                          ? `${col.accent}0d`
                          : "transparent",
                        transition: "all 0.15s ease",
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
                                    background: snapshot.isDragging
                                      ? "var(--mantine-color-dark-5)"
                                      : "var(--mantine-color-dark-7)",
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
                                    <Group justify="space-between" mt={2}>
                                      <Badge size="xs" variant="dot" color={item.impact >= 8 ? "red" : item.impact >= 5 ? "yellow" : "gray"}>
                                        {item.candidateState}
                                      </Badge>
                                      <Text size="xs" fw={900} style={{ color: col.accent, fontVariantNumeric: "tabular-nums" }}>
                                        {Math.round(item.iceScore)}
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
