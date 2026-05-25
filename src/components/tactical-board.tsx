'use client';

/**
 * Planning and tactical board surface.
 *
 * This file must only be imported through `dynamic(..., { ssr: false })`
 * from the page layer because `@hello-pangea/dnd` depends on browser-only
 * pointer and DOM APIs.
 */

import { useState, useEffect, useCallback } from "react";
import {
  DragDropContext, Droppable, Draggable, DropResult, DragStart, } from "@hello-pangea/dnd";
import {
  Group, Stack, Badge, Loader, Center, Modal, Divider, ActionIcon, Tooltip, rem, Select, Button, Box, ScrollArea, ThemeIcon, SimpleGrid } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { PageShell, PageHeader, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardFreshnessBadge, UnifiedCardSection } from "@/components/ui/unified-card";
import { CardShareAction } from "@/components/ui/card-share-action";
import { MetaText, Text, Title } from "@/components/ui/typography";
import { getTaskCardFreshness } from "@/lib/card-freshness";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { IconTrash as Trash2, IconExternalLink as ExternalLink, IconTarget as Target, IconSparkles as Sparkles, IconRefresh as RefreshCw, IconLayersIntersect as Layers, IconLayoutDashboard as LayoutDashboard, IconListCheck as ListCheck, IconDownload as Download } from "@tabler/icons-react";
import { getModuleTheme, getSemanticDropzoneStyle } from "@/lib/semantic-theme";
import type { ProjectionFreshness } from "@/lib/webapp-projection";

type ChecklistKanbanColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

type ChecklistTask = {
  id: string;
  publicId?: number | null;
  title: string;
  description: string | null;
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
  kanbanColumn: ChecklistKanbanColumn;
  sortOrder: number;
  candidateState: string;
  hashtags: string[];
  evaluationReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  generatedAt?: string | null;
  qualityScore?: number | null;
  urgencyScore?: number | null;
  freshnessScore?: number | null;
  priorityProfile?: {
    score: number;
    baseScore?: number;
    manualAnchor: boolean;
    components: {
      ice: number;
      quality: number;
      urgency: number;
      freshness: number;
      human: number;
      risk: number;
    };
    reasons: string[];
    cohort?: {
      rank: number;
      total: number;
      percentile: number;
      bucket: number;
      bucketCount: number;
      spreadBoost: number;
      densityPenalty: number;
    };
  } | null;
};

const COLUMNS: {
  key: ChecklistKanbanColumn;
  label: string;
  description: string;
  accent: string;
  tone: "neutral" | "strategy" | "ingress" | "tactical" | "checklist";
}[] = [
  { key: "IDEABANK",  label: "Idea Bank", description: "Someday · priority < 100",  accent: getModuleTheme("neutral").color, tone: "neutral" },
  { key: "ROADMAP",   label: "Roadmap",   description: "Later · priority ≥ 100",    accent: getModuleTheme("strategy").color, tone: "strategy" },
  { key: "BACKLOG",   label: "Backlog",   description: "Sooner · priority ≥ 250",   accent: getModuleTheme("ingress").color, tone: "ingress" },
  { key: "TODO",      label: "Next",      description: "Soon · priority ≥ 500",     accent: getModuleTheme("tactical").color, tone: "tactical" },
  { key: "CHECKLIST", label: "Now",       description: "Active · priority ≥ 700",   accent: getModuleTheme("checklist").color, tone: "checklist" },
];

const COLUMN_OPTIONS = [
  { value: "IDEABANK",  label: "Idea Bank (Someday)" },
  { value: "ROADMAP",   label: "Roadmap (Later)" },
  { value: "BACKLOG",   label: "Backlog (Sooner)" },
  { value: "TODO",      label: "Next" },
  { value: "CHECKLIST", label: "Now (Checklist)" },
];

function reorderColumnItems(
  items: ChecklistTask[],
  draggableId: string,
  source: { droppableId: string; index: number },
  destination: { droppableId: string; index: number },
) {
  const sourceColumn = source.droppableId as ChecklistKanbanColumn;
  const destinationColumn = destination.droppableId as ChecklistKanbanColumn;
  const sourceItems = items
    .filter((item) => item.kanbanColumn === sourceColumn)
    .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));
  const destinationItems =
    sourceColumn === destinationColumn
      ? sourceItems
      : items
          .filter((item) => item.kanbanColumn === destinationColumn)
          .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));

  const movingItem = sourceItems[source.index];
  if (!movingItem || movingItem.id !== draggableId) {
    return null;
  }

  const nextSourceItems = [...sourceItems];
  nextSourceItems.splice(source.index, 1);

  const nextDestinationItems =
    sourceColumn === destinationColumn ? nextSourceItems : [...destinationItems];

  nextDestinationItems.splice(destination.index, 0, {
    ...movingItem,
    kanbanColumn: destinationColumn,
  });

  const updatedItems = items.map((item) => {
    if (item.id === movingItem.id) {
      return { ...item, kanbanColumn: destinationColumn };
    }
    return item;
  });

  const manualizeColumn = (columnItems: ChecklistTask[]) =>
    columnItems.map((item, index) => ({
      ...item,
      sortOrder: index - columnItems.length,
    }));

  const sourceManualized = sourceColumn === destinationColumn ? [] : manualizeColumn(nextSourceItems);
  const destinationManualized = manualizeColumn(nextDestinationItems);
  const patchedById = new Map<string, ChecklistTask>();

  for (const item of sourceManualized) patchedById.set(item.id, item);
  for (const item of destinationManualized) patchedById.set(item.id, item);

  return {
    nextItems: updatedItems.map((item) => patchedById.get(item.id) ?? item),
    sourceColumn,
    destinationColumn,
    sourceColumnOrderIds: sourceColumn === destinationColumn ? undefined : sourceManualized.map((item) => item.id),
    destinationColumnOrderIds: destinationManualized.map((item) => item.id),
  };
}

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
  item: ChecklistTask | null;
  opened: boolean;
  onClose: () => void;
  onMove: (itemId: string, column: string) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string, targetType: "KNOWLEDGE" | "GOAL") => void;
}) {
  const col = item ? COLUMNS.find(c => c.key === item.kanbanColumn) : null;
  const freshness = item
    ? getTaskCardFreshness({
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        generatedAt: item.generatedAt,
      })
    : null;

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
          <ThemeIcon color={col?.tone === "strategy" ? "strategy" : col?.tone === "ingress" ? "ingress" : col?.tone === "tactical" ? "tactical" : col?.tone === "checklist" ? "checklist" : "dark"}>
            <Target size={16} />
          </ThemeIcon>
          <Text size="sm">
            #{item?.publicId ?? "—"} · Tactical Unit
          </Text>
          {col && (
            <Badge
              size="xs"
              variant="outline"
              color={col.tone === "neutral" ? "dark" : col.tone}
            >
              {col.label}
            </Badge>
          )}
          <UnifiedCardFreshnessBadge freshness={freshness} />
        </Group>
      }
      size="xl"
      
      overlayProps={{ 
        backgroundOpacity: 0.55, 
        color: "var(--overlay-color)",
      }}
    >
      {!item ? (
        <Center py="xl">
          <Loader variant="dots" color="checklist" />
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
              { label: "Impact",     value: item.impact,     color: "review" },
              { label: "Confidence", value: item.confidence, color: "tactical" },
              { label: "Ease",       value: item.ease,       color: "strategy" },
            ].map(s => (
              <UnifiedCardSection key={s.label} tone={s.color as any}>
                <Stack gap={2} align="center">
                  <Text size="xl" c={s.color}>{s.value}</Text>
                  <Text size="xs" c="dimmed">{s.label}</Text>
                </Stack>
              </UnifiedCardSection>
            ))}
            <UnifiedCardSection tone="checklist">
              <Stack gap={2} align="center">
                <Text size="xl" c="checklist">{Math.round(item.iceScore)}</Text>
                <Text size="xs" c="checklist">ICE Score</Text>
              </Stack>
            </UnifiedCardSection>
          </Group>
        </Box>

        {/* AI Scores */}
        {(item.priorityProfile || item.qualityScore != null || item.urgencyScore != null || item.freshnessScore != null) && (
          <Box>
            <Group gap="xs" mb="md">
              <Sparkles size={14} color="var(--mantine-color-ingress-6)" />
              <Text size="xs" c="dimmed">Blended Priority Signals</Text>
            </Group>
            <UnifiedCardSection tone="tactical">
              <SimpleGrid cols={item.priorityProfile?.cohort ? 6 : 4}>
                <Stack gap={2}>
                  <Text size="sm">{item.priorityProfile ? Math.round(item.priorityProfile.score) : "—"}</Text>
                  <Text size="xs" c="dimmed">Priority</Text>
                </Stack>
                {item.priorityProfile?.baseScore != null ? (
                  <Stack gap={2}>
                    <Text size="sm">{Math.round(item.priorityProfile.baseScore)}</Text>
                    <Text size="xs" c="dimmed">Base</Text>
                  </Stack>
                ) : null}
                <Stack gap={2}>
                  <Text size="sm">{item.priorityProfile ? fmt(item.priorityProfile.components.human) : "—"}</Text>
                  <Text size="xs" c="dimmed">Human</Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="sm">{item.priorityProfile ? fmt(item.priorityProfile.components.risk) : "—"}</Text>
                  <Text size="xs" c="dimmed">Risk</Text>
                </Stack>
                <Stack gap={2}>
                  <Badge color="tactical">{item.candidateState}</Badge>
                  <Text size="xs" c="dimmed">State</Text>
                </Stack>
                {item.priorityProfile?.cohort ? (
                  <Stack gap={2}>
                    <Text size="sm">
                      {item.priorityProfile.cohort.rank}/{item.priorityProfile.cohort.total}
                    </Text>
                    <Text size="xs" c="dimmed">Rank</Text>
                  </Stack>
                ) : null}
                {item.priorityProfile?.cohort ? (
                  <Stack gap={2}>
                    <Text size="sm">
                      {item.priorityProfile.cohort.bucketCount > 1
                        ? `-${Math.round(item.priorityProfile.cohort.densityPenalty)}`
                        : `+${Math.round(item.priorityProfile.cohort.spreadBoost)}`}
                    </Text>
                    <Text size="xs" c="dimmed">Cohort</Text>
                  </Stack>
                ) : null}
              </SimpleGrid>
              {item.priorityProfile?.reasons?.length ? (
                <Text size="xs" c="dimmed" mt="sm">
                  {item.priorityProfile.reasons.slice(0, 6).join(" · ")}
                </Text>
              ) : null}
            </UnifiedCardSection>
          </Box>
        )}

        {/* Evaluation Reason */}
        {item.evaluationReason && (
          <Box>
            <Text size="xs" c="dimmed" mb="md">AI Judge Reasoning</Text>
            <UnifiedCardSection tone="review">
              <Text size="sm">
                &quot;{stripTechnicalMetadata(item.evaluationReason)}&quot;
              </Text>
            </UnifiedCardSection>
          </Box>
        )}

        {/* Hashtags */}
        {item.hashtags?.length > 0 && (
          <Group gap="xs" wrap="wrap">
            {item.hashtags.map(tag => (
                <Badge key={tag} size="xs" color="tactical">
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
                color="knowmore" 
                size="xs" 
                leftSection={<RefreshCw size={14} />}
                onClick={() => onConvert(item.id, "KNOWLEDGE")}
              >
                Migrate to Knowledge
              </Button>
              <Button 
                variant="light" 
                color="strategy" 
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
            color="review" 
            size="xs"
            leftSection={<Trash2 size={16} />} 
            onClick={() => onDelete(item.id)}
            
          >
            Archive Unit
          </Button>
          <Group gap="sm">
            <CardShareAction cardId={item.id} color="gray" size="md" />
            <Button variant="light" color="dark" onClick={onClose} size="sm">
              Cancel
            </Button>
            <Button variant="filled" color="checklist" onClick={onClose} size="sm">
              Acknowledge
            </Button>
          </Group>
        </Group>

        {/* Timestamps */}
        <Group justify="flex-end" gap="xs">
          <MetaText>COMMITTED: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}</MetaText>
          <MetaText>SYNCED: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</MetaText>
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
  const [items, setItems] = useState<ChecklistTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [planningSummary, setPlanningSummary] = useState<{
    laneCounts: Record<ChecklistKanbanColumn, number>;
    tacticalCount: number;
    checklistCount: number;
  } | null>(null);
  const [projectionFreshness, setProjectionFreshness] = useState<ProjectionFreshness | null>(null);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const planningExportHref = `/api/checklist/export?companyId=${companyId}&scope=planning`;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/checklist?companyId=${companyId}&all=true`);
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

  const fetchPlanningSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/companies/${companyId}/planning-summary`);
      if (!res.ok) return;
      const data = await res.json();
      setPlanningSummary(data.planningSummary ?? null);
      setProjectionFreshness(data.projection?.freshness ?? null);
    } catch (error) {
      console.error("[KANBAN] Planning summary fetch failed:", error);
    }
  }, [companyId]);

  useEffect(() => {
    void (async () => {
      await fetchPlanningSummary();
      await fetchItems();
    })();

    const interval = setInterval(() => {
      void fetchPlanningSummary();
      void fetchItems();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchItems, fetchPlanningSummary]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to archive this task?")) return;
    await fetch(`/api/checklist?id=${id}`, { method: "DELETE" });
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

  const handleOpenCard = (item: ChecklistTask) => {
    setDetailId(item.id);
    openModal();
  };

  const persistBoardReorder = useCallback(async (
    itemId: string,
    sourceColumn: ChecklistKanbanColumn,
    destinationColumn: ChecklistKanbanColumn,
    destinationColumnOrderIds: string[],
    sourceColumnOrderIds?: string[],
  ) => {
    try {
      await fetch(`/api/checklist?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanColumn: destinationColumn,
          destinationColumn,
          sourceColumn,
          destinationColumnOrderIds,
          sourceColumnOrderIds,
        }),
      });
    } catch {
      fetchItems();
    }
  }, [fetchItems]);

  const onDragStart = useCallback((result: DragStart) => {
    setDraggingItemId(result.draggableId);
  }, []);

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    setDraggingItemId(null);
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const reordered = reorderColumnItems(items, draggableId, source, destination);
    if (!reordered) return;

    setItems(reordered.nextItems);
    await persistBoardReorder(
      draggableId,
      reordered.sourceColumn,
      reordered.destinationColumn,
      reordered.destinationColumnOrderIds,
      reordered.sourceColumnOrderIds,
    );
  }, [items, persistBoardReorder]);

  if (loading && items.length === 0) {
    return (
      <PageShell width="full">
        <Center h={400}>
          <Stack align="center" gap="sm">
            <Loader color="tactical" />
            <Text c="dimmed" size="xs">Synchronizing Tactical Board...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  const projectionFreshnessLabel =
    projectionFreshness?.status === "FRESH"
      ? `Projection fresh${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
      : projectionFreshness?.status === "AGING"
        ? `Projection aging${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
        : projectionFreshness?.status === "STALE"
          ? `Projection stale${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
          : "Projection missing";

  return (
    <Box h="100vh" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

      <CardDetailModal
        item={detailId ? items.find(i => i.id === detailId) || null : null}
        opened={modalOpened}
        onClose={() => { closeModal(); setDetailId(null); }}
        onMove={(itemId, column) => {
          const item = items.find((entry) => entry.id === itemId);
          if (!item || item.kanbanColumn === column) return;
          const reordered = reorderColumnItems(
            items,
            itemId,
            {
              droppableId: item.kanbanColumn,
              index: items
                .filter((entry) => entry.kanbanColumn === item.kanbanColumn)
                .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
                .findIndex((entry) => entry.id === itemId),
            },
            {
              droppableId: column,
              index: items.filter((entry) => entry.kanbanColumn === column).length,
            },
          );
          if (!reordered) return;
          setItems(reordered.nextItems);
          void persistBoardReorder(
            itemId,
            reordered.sourceColumn,
            reordered.destinationColumn,
            reordered.destinationColumnOrderIds,
            reordered.sourceColumnOrderIds,
          );
        }}
        onDelete={handleDelete}
        onConvert={handleConvert}
      />

      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Box 
        style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}
        p="xl"
      >
        <PipelineAccentHeader 
          activeKey="tactical" 
          title="Tactical Board" 
          icon={LayoutDashboard} 
        />
          <Group gap="sm" mb="md">
            <Badge size="sm" variant="light" color="tactical">
              Planning {Math.max(Number(planningSummary?.tacticalCount || 0), Number(planningSummary?.checklistCount || 0))}
            </Badge>
            <Badge size="sm" variant="light" color="checklist">
              Checklist {Number(planningSummary?.checklistCount || 0)}
            </Badge>
            <Badge
              size="sm"
              variant="outline"
              color={projectionFreshness?.status === "STALE" ? "review" : projectionFreshness?.status === "AGING" ? "strategy" : "gray"}
            >
              {projectionFreshnessLabel}
            </Badge>
            <Button
              component="a"
              href={planningExportHref}
              variant="light"
              color="gray"
              size="xs"
              leftSection={<Download size={14} />}
            >
              Export CSV
            </Button>
          </Group>
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
                  miw={320}
                  h="100%"
                >
                  {/* Column Header */}
                  <UnifiedCard
                    tone={col.tone}
                    accentBandTone={col.tone}
                    flexShrink={0}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Stack gap={2} style={{ overflow: "hidden" }}>
                        <Text size="sm" c={col.tone === "neutral" ? "dimmed" : col.tone} fw={650} truncate>
                          {col.label}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>{col.description}</Text>
                      </Stack>
                      <Badge
                        size="sm"
                        variant="light"
                        color={col.tone === "neutral" ? "gray" : col.tone}
                      >
                        {colItems.length}
                      </Badge>
                    </Group>
                  </UnifiedCard>

                  {/* Droppable */}
                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <Box
                        component="div"
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={getSemanticDropzoneStyle(col.tone, snapshot.isDraggingOver)}
                        display="flex"
                        flex={1}
                        mih={0}
                      >
                        <ScrollArea
                          offsetScrollbars
                          flex={1}
                          viewportProps={{ style: { display: "flex", flexDirection: "column" } }}
                        >
                          <Stack gap="sm" p={4} flex={1}>
                            {colItems.map((item, index) => (
                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(provided, snapshot) => {
                                  const freshness = getTaskCardFreshness({
                                    createdAt: item.createdAt,
                                    updatedAt: item.updatedAt,
                                    generatedAt: item.generatedAt,
                                  });
                                  const isActivelyDragging = draggingItemId === item.id && snapshot.isDragging;

                                  return (
                                    <Box
                                      component="div"
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={{
                                        ...provided.draggableProps.style,
                                        transform: isActivelyDragging
                                          ? `${provided.draggableProps.style?.transform ?? ""} rotate(1deg) scale(1.02)`.trim()
                                          : provided.draggableProps.style?.transform,
                                      }}
                                    >
                                      <UnifiedCard
                                        tone={col.tone}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          event.preventDefault();
                                          handleOpenCard(item);
                                        }}
                                        cursor={isActivelyDragging ? "grabbing" : "pointer"}
                                        userSelect="none"
                                        borderColor={isActivelyDragging ? getModuleTheme(col.tone).color : undefined}
                                      >
                                        <UnifiedCardBody>
                                        <Stack gap="xs">
                                          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                                            <Text size="xs" lineClamp={2} style={{ flex: 1 }}>
                                              {stripTechnicalMetadata(item.title)}
                                            </Text>
                                            <UnifiedCardFreshnessBadge freshness={freshness} />
                                          </Group>
                                          {item.description && (
                                            <Text size="xs" c="dimmed" lineClamp={2}>
                                              {stripTechnicalMetadata(item.description)}
                                            </Text>
                                          )}
                                          <Group justify="space-between" mt={4} wrap="nowrap">
                                            <Badge 
                                              size="xs" 
                                              variant="light" 
                                              color={item.impact >= 8 ? "review" : item.impact >= 5 ? "checklist" : "dark"}
                                            >
                                              {item.candidateState}
                                            </Badge>
                                            <Group gap={4}>
                                              <MetaText>{item.priorityProfile ? "PRIORITY" : "ICE"}</MetaText>
                                              <Text size="xs" c={col.tone === "neutral" ? "dimmed" : col.tone} style={{ fontVariantNumeric: "tabular-nums" }}>
                                                {Math.round(item.priorityProfile?.score ?? item.iceScore)}
                                              </Text>
                                            </Group>
                                          </Group>
                                        </Stack>
                                        </UnifiedCardBody>
                                      </UnifiedCard>
                                    </Box>
                                  );
                                }}
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
