'use client';

import { useCallback, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DragStart, type DropResult } from "@hello-pangea/dnd";
import { Box, ScrollArea, Stack, Group, Badge } from "@mantine/core";
import { OpportunityReviewCard } from "@/components/opportunity-review-card";
import { UnifiedCard } from "@/components/ui/unified-card";
import { Text } from "@/components/ui/typography";
import { getSemanticDropzoneStyle } from "@/lib/semantic-theme";

type OpportunityKanbanColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

export type SalesOpportunitycard = {
  id: string;
  publicId: number | null;
  companyName: string;
  title: string;
  body: string;
  website?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  xUrl?: string | null;
  location?: string | null;
  coreOffer?: string | null;
  financialBackground?: string | null;
  fitRationale?: string | null;
  opportunityType: "PROSPECT" | "PARTNER" | "RESELLER";
  confidenceScore: number;
  impact: number;
  weight: number;
  iceScore: number;
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED" | "REVIEW";
  activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
  hashtags: string[];
  kanbanColumn: OpportunityKanbanColumn;
  sortOrder?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  generatedAt?: string | null;
  refreshedAt?: string | null;
  userAnnotation?: string | null;
};

type SalesBoardReorderPayload = {
  itemId: string;
  nextItems: SalesOpportunitycard[];
  sourceColumn: OpportunityKanbanColumn;
  destinationColumn: OpportunityKanbanColumn;
  sourceColumnOrderIds?: string[];
  destinationColumnOrderIds: string[];
};

type Props = {
  items: SalesOpportunitycard[];
  onAction: (itemId: string, action: string, payload?: Record<string, unknown>) => void;
  onReorder: (payload: SalesBoardReorderPayload) => void | Promise<void>;
};

const COLUMNS: {
  key: OpportunityKanbanColumn;
  label: string;
  description: string;
  tone: "neutral" | "strategy" | "ingress" | "tactical" | "checklist";
}[] = [
  { key: "IDEABANK", label: "Idea Bank", description: "Someday lead pool", tone: "neutral" },
  { key: "ROADMAP", label: "Roadmap", description: "Later qualification", tone: "strategy" },
  { key: "BACKLOG", label: "Backlog", description: "Sooner research", tone: "ingress" },
  { key: "TODO", label: "Next", description: "Soon review", tone: "tactical" },
  { key: "CHECKLIST", label: "Now", description: "Active sales focus", tone: "checklist" },
];

function reorderColumnItems(
  items: SalesOpportunitycard[],
  draggableId: string,
  source: { droppableId: string; index: number },
  destination: { droppableId: string; index: number },
) {
  const sourceColumn = source.droppableId as OpportunityKanbanColumn;
  const destinationColumn = destination.droppableId as OpportunityKanbanColumn;
  const sourceItems = items
    .filter((item) => item.kanbanColumn === sourceColumn && item.activityState !== "ARCHIVED")
    .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));
  const destinationItems =
    sourceColumn === destinationColumn
      ? sourceItems
      : items
          .filter((item) => item.kanbanColumn === destinationColumn && item.activityState !== "ARCHIVED")
          .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));

  const movingItem = sourceItems[source.index];
  if (!movingItem || movingItem.id !== draggableId) {
    return null;
  }

  const nextSourceItems = [...sourceItems];
  nextSourceItems.splice(source.index, 1);

  const nextDestinationItems = sourceColumn === destinationColumn ? nextSourceItems : [...destinationItems];
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

  const manualizeColumn = (columnItems: SalesOpportunitycard[]) =>
    columnItems.map((item, index) => ({
      ...item,
      sortOrder: index - columnItems.length,
    }));

  const sourceManualized = sourceColumn === destinationColumn ? [] : manualizeColumn(nextSourceItems);
  const destinationManualized = manualizeColumn(nextDestinationItems);
  const patchedById = new Map<string, SalesOpportunitycard>();

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

export function SalesBoard({ items, onAction, onReorder }: Props) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

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

    await onReorder({
      itemId: draggableId,
      nextItems: reordered.nextItems,
      sourceColumn: reordered.sourceColumn,
      destinationColumn: reordered.destinationColumn,
      sourceColumnOrderIds: reordered.sourceColumnOrderIds,
      destinationColumnOrderIds: reordered.destinationColumnOrderIds,
    });
  }, [items, onReorder]);

  return (
    <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Box style={{ overflowX: "auto", overflowY: "hidden" }}>
        <Group wrap="nowrap" align="flex-start" gap="lg" h="100%" pt="md">
          {COLUMNS.map((column) => {
            const columnItems = items
              .filter((item) => item.kanbanColumn === column.key && item.activityState !== "ARCHIVED")
              .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));

            return (
              <Stack key={column.key} gap="md" w={320} miw={320} h="100%">
                <UnifiedCard tone={column.tone} accentBandTone={column.tone} flexShrink={0}>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2} style={{ overflow: "hidden" }}>
                      <Text size="sm" c={column.tone === "neutral" ? "dimmed" : column.tone} fw={650} truncate>
                        {column.label}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {column.description}
                      </Text>
                    </Stack>
                    <Badge size="sm" variant="light" color={column.tone === "neutral" ? "gray" : column.tone}>
                      {columnItems.length}
                    </Badge>
                  </Group>
                </UnifiedCard>

                <Droppable droppableId={column.key}>
                  {(provided, snapshot) => (
                    <Box
                      component="div"
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={getSemanticDropzoneStyle(column.tone, snapshot.isDraggingOver)}
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
                          {columnItems.map((item, index) => {
                            const isActivelyDragging = draggingItemId === item.id;
                            return (
                              <Draggable key={item.id} draggableId={item.id} index={index}>
                                {(dragProvided, dragSnapshot) => (
                                  <Box
                                    component="div"
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    style={{
                                      ...dragProvided.draggableProps.style,
                                      transform: isActivelyDragging && dragSnapshot.isDragging
                                        ? `${dragProvided.draggableProps.style?.transform ?? ""} rotate(1deg) scale(1.02)`.trim()
                                        : dragProvided.draggableProps.style?.transform,
                                    }}
                                  >
                                    <OpportunityReviewCard item={item} onAction={onAction} />
                                  </Box>
                                )}
                              </Draggable>
                            );
                          })}
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
  );
}
