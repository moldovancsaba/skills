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
  ThemeIcon,
  SimpleGrid,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { PageShell, PageHeader, PipelineAccentHeader } from "@/components/ui/app-shell";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { IconTrash as Trash2, IconExternalLink as ExternalLink, IconTarget as Target, IconSparkles as Sparkles, IconRefresh as RefreshCw, IconLayersIntersect as Layers, IconLayoutDashboard as LayoutDashboard, IconListCheck as ListCheck } from "@tabler/icons-react";

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
          <ThemeIcon color="orange">
            <Target size={16} />
          </ThemeIcon>
          <Text size="sm">
            #{item?.publicId ?? "—"} · Tactical Unit
          </Text>
          {col && (
            <Badge
              size="xs"
              variant="outline"
              color={col.accent}
            >
              {col.label}
            </Badge>
          )}
        </Group>
      }
      size="xl"
      
      overlayProps={{ 
        backgroundOpacity: 0.55, 
        color: 'light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-9))'
      }}
    >
      {!item ? (
        <Center py="xl">
          <Loader variant="dots" color="orange" />
        </Center>
      ) : (
        <Stack gap="xl" pt="xs">
        {/* Title & Description */}
        <Stack gap="xs">
          <Text size="xl">
            {stripTechnicalMetadata(item.title)}
          </Text>
          {item.description && (
            <Text size="sm" c="dimmed">
              {stripTechnicalMetadata(item.description)}
            </Text>
          )}
        </Stack>

        {/* ICE Scores */}
        <Box>
          <Text size="xs" c="dimmed" mb="md">Operational Scores</Text>
          <Group grow gap="md">
            {[
              { label: "Impact",     value: item.impact,     color: "orange" },
              { label: "Confidence", value: item.confidence, color: "cyan" },
              { label: "Ease",       value: item.ease,       color: "violet" },
            ].map(s => (
              <Paper key={s.label} p="md" ta="center">
                <Text size="xl" c={s.color}>{s.value}</Text>
                <Text size="xs" c="dimmed">{s.label}</Text>
              </Paper>
            ))}
            <Paper p="md" ta="center">
              <Text size="xl" c="orange">{Math.round(item.iceScore)}</Text>
              <Text size="xs" c="orange">ICE Score</Text>
            </Paper>
          </Group>
        </Box>

        {/* AI Scores */}
        {(item.qualityScore != null || item.urgencyScore != null || item.freshnessScore != null) && (
          <Box>
            <Group gap="xs" mb="md">
              <Sparkles size={14} color="var(--mantine-color-blue-6)" />
              <Text size="xs" c="dimmed">AI Evaluation Signals</Text>
            </Group>
            <Paper p="md">
              <SimpleGrid cols={4}>
                <Stack gap={2}>
                  <Text size="sm">{fmt(item.qualityScore)}</Text>
                  <Text size="xs" c="dimmed">Quality</Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="sm">{fmt(item.urgencyScore)}</Text>
                  <Text size="xs" c="dimmed">Urgency</Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="sm">{fmt(item.freshnessScore)}</Text>
                  <Text size="xs" c="dimmed">Freshness</Text>
                </Stack>
                <Stack gap={2}>
                  <Badge color="blue">{item.candidateState}</Badge>
                  <Text size="xs" c="dimmed">State</Text>
                </Stack>
              </SimpleGrid>
            </Paper>
          </Box>
        )}

        {/* Evaluation Reason */}
        {item.evaluationReason && (
          <Box>
            <Text size="xs" c="dimmed" mb="md">AI Judge Reasoning</Text>
            <Paper p="md" style={{ borderLeft: '4px solid var(--mantine-color-orange-6)' }}>
              <Text size="sm">
                "{stripTechnicalMetadata(item.evaluationReason)}"
              </Text>
            </Paper>
          </Box>
        )}

        {/* Hashtags */}
        {item.hashtags?.length > 0 && (
          <Group gap="xs" wrap="wrap">
            {item.hashtags.map(tag => (
              <Badge key={tag} size="xs" color="gray">
                #{tag}
              </Badge>
            ))}
          </Group>
        )}

        <Divider variant="dashed" />

        {/* Actions Section */}
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end">
            <Select
              data={COLUMN_OPTIONS}
              value={item.kanbanColumn}
              size="sm"
              
              label={<Text size="xs" mb={4}>Move to tactical horizon</Text>}
              style={{ flex: 1 }}
              onChange={(val) => {
                if (val && val !== item.kanbanColumn) {
                  onMove(item.id, val);
                  onClose();
                }
              }}
            />
          </Group>

          <Box>
            <Text size="xs" c="dimmed" mb="md">Protocol Migration</Text>
            <Group grow gap="md">
              <Button 
                variant="light" 
                color="indigo" 
                size="xs" 
                leftSection={<RefreshCw size={14} />}
                onClick={() => onConvert(item.id, "KNOWLEDGE")}
              >
                Migrate to Knowledge
              </Button>
              <Button 
                variant="light" 
                color="teal" 
                size="xs" 
                leftSection={<Layers size={14} />}
                onClick={() => onConvert(item.id, "GOAL")}
              >
                Migrate to Goals
              </Button>
            </Group>
          </Box>
        </Stack>

        <Divider variant="dashed" />

        <Group justify="space-between">
          <Button 
            variant="subtle" 
            color="red" 
            size="xs"
            leftSection={<Trash2 size={16} />} 
            onClick={() => onDelete(item.id)}
            
          >
            Archive Unit
          </Button>
          <Group gap="sm">
            <Button variant="light" color="gray" onClick={onClose} size="sm">
              Cancel
            </Button>
            <Button variant="filled" color="orange" onClick={onClose} size="sm">
              Acknowledge
            </Button>
          </Group>
        </Group>

        {/* Timestamps */}
        <Group justify="flex-end" gap="xs">
          <Text size="10px" c="dimmed">
            COMMITTED: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}
          </Text>
          <Text size="10px" c="dimmed">
            SYNCED: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}
          </Text>
        </Group>
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
            <Loader color="orange" />
            <Text c="dimmed" size="xs">Synchronizing Tactical Board...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  return (
    <Box h="100vh" style={{ display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))' }}>

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
          icon={LayoutDashboard} 
        />
          <Group 
            wrap="nowrap" 
            align="flex-start" 
            gap="lg" 
            h="100%"
            pt="md"
          >
            {COLUMNS.map((col) => {
              const colItems = items
                .filter(i => i.kanbanColumn === col.key)
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

              return (
                <Stack 
                  key={col.key} 
                  gap="md" 
                  w={320} 
                  h="100%"
                  style={{ flexShrink: 0 }}
                >
                  {/* Column Header */}
                  <Paper
                    p="md"
                    style={{
                      borderTop: `4px solid ${col.accent}`,
                      flexShrink: 0
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2} style={{ overflow: 'hidden' }}>
                        <Text size="sm" style={{ color: col.accent }} truncate>
                          {col.label}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>{col.description}</Text>
                      </Stack>
                      <Badge
                        size="sm"
                        variant="light"
                        color={col.accent}
                        style={{ backgroundColor: `${col.accent}15`, color: col.accent, border: `1px solid ${col.accent}33` }}
                      >
                        {colItems.length}
                      </Badge>
                    </Group>
                  </Paper>

                  {/* Droppable */}
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <Box
                        component="div"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          flex: 1,
                          border: snapshot.isDraggingOver
                            ? `2px dashed ${col.accent}`
                            : "2px dashed transparent",
                          backgroundColor: snapshot.isDraggingOver
                            ? `${col.accent}05`
                            : "transparent",
                          transition: "all 0.15s ease",
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 0
                        }}
                      >
                        <ScrollArea offsetScrollbars style={{ flex: 1 }} viewportProps={{ style: { display: 'flex', flexDirection: 'column' } }}>
                          <Stack gap="sm" p={4} style={{ flex: 1 }}>
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
                                      p="md"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        handleOpenCard(item);
                                      }}
                                      style={{
                                        cursor: snapshot.isDragging ? "grabbing" : "pointer",
                                        borderColor: snapshot.isDragging
                                          ? col.accent
                                          : "transparent",
                                        transform: snapshot.isDragging ? "rotate(1deg) scale(1.02)" : "none",
                                        transition: "all 0.15s ease",
                                        userSelect: "none",
                                      }}
                                    >
                                      <Stack gap="xs">
                                        <Text size="xs" lineClamp={2}>
                                          {stripTechnicalMetadata(item.title)}
                                        </Text>
                                        {item.description && (
                                          <Text size="xs" c="dimmed" lineClamp={2}>
                                            {stripTechnicalMetadata(item.description)}
                                          </Text>
                                        )}
                                        <Group justify="space-between" mt={4} wrap="nowrap">
                                          <Badge 
                                            size="xs" 
                                            variant="light" 
                                            color={item.impact >= 8 ? "red" : item.impact >= 5 ? "orange" : "gray"}
                                          >
                                            {item.candidateState}
                                          </Badge>
                                          <Group gap={4}>
                                            <Text size="10px" c="dimmed">ICE</Text>
                                            <Text size="xs" style={{ color: col.accent, fontVariantNumeric: "tabular-nums" }}>
                                              {Math.round(item.iceScore)}
                                            </Text>
                                          </Group>
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
