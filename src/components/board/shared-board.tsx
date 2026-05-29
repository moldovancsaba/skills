'use client';

import { useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Box, Group, ScrollArea, Stack } from "@mantine/core";
import { UnifiedCard } from "@/components/ui/unified-card";
import { Text } from "@/components/ui/typography";
import { getModuleTheme, getSemanticDropzoneStyle } from "@/lib/semantic-theme";
import type { BoardCardRecord, BoardColumn, BoardMoveRequest } from "@/lib/board-system";
import { moveBoardItem, sortBoardRecords } from "@/lib/board-system";

type SharedBoardProps<T extends BoardCardRecord> = {
  columns: BoardColumn[];
  items: T[];
  onMove: (request: BoardMoveRequest, nextItems: T[]) => Promise<void> | void;
  renderCard: (item: T, options: { dragging: boolean; overlay: boolean }) => React.ReactNode;
  renderColumnContent?: (column: BoardColumn, options: { itemCount: number }) => React.ReactNode;
  getCardTone?: (item: T) => BoardColumn["tone"];
  emptyColumnCopy?: string;
};

function findItemColumn<T extends BoardCardRecord>(items: T[], itemId: string) {
  return items.find((item) => item.id === itemId)?.columnKey ?? null;
}

function getColumnItems<T extends BoardCardRecord>(items: T[], columnKey: string) {
  return sortBoardRecords(items.filter((item) => item.columnKey === columnKey));
}

function resolveDropTarget<T extends BoardCardRecord>(
  items: T[],
  columns: BoardColumn[],
  activeId: string,
  overId: string,
) {
  const activeColumn = findItemColumn(items, activeId);
  if (!activeColumn) return null;

  const isColumn = columns.some((column) => column.key === overId);
  const destinationColumn = isColumn ? overId : findItemColumn(items, overId);
  if (!destinationColumn) return null;

  const destinationItems = getColumnItems(
    items.filter((item) => item.id !== activeId),
    destinationColumn,
  );

  if (isColumn) {
    return { sourceColumn: activeColumn, destinationColumn, destinationIndex: destinationItems.length };
  }

  const overIndex = destinationItems.findIndex((item) => item.id === overId);
  if (overIndex === -1) {
    return { sourceColumn: activeColumn, destinationColumn, destinationIndex: destinationItems.length };
  }

  return { sourceColumn: activeColumn, destinationColumn, destinationIndex: overIndex };
}

function SortableBoardCard<T extends BoardCardRecord>({
  item,
  children,
  tone,
}: {
  item: T;
  children: React.ReactNode;
  tone: BoardColumn["tone"];
}) {
  const { attributes, listeners, setNodeRef, transform, transition: dragMotion, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: dragMotion,
        opacity: isDragging ? 0.55 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <UnifiedCard
        tone={tone}
        cursor={isDragging ? "grabbing" : "grab"}
        userSelect="none"
        borderColor={isDragging ? getModuleTheme(tone).color : undefined}
      >
        {children}
      </UnifiedCard>
    </Box>
  );
}

function DroppableColumn({
  column,
  children,
}: {
  column: BoardColumn;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: column.key });

  return (
    <Box
      ref={setNodeRef}
      id={column.key}
      style={getSemanticDropzoneStyle(column.tone, isOver)}
      display="flex"
      flex={1}
      mih={0}
    >
      {children}
    </Box>
  );
}

export function SharedBoard<T extends BoardCardRecord>({
  columns,
  items,
  onMove,
  renderCard,
  renderColumnContent,
  getCardTone,
  emptyColumnCopy = "Drop a card here.",
}: SharedBoardProps<T>) {
  const [boardItems, setBoardItems] = useState<T[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const effectiveItems = activeId ? boardItems : items;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeItem = useMemo(
    () => (activeId ? effectiveItems.find((item) => item.id === activeId) ?? null : null),
    [activeId, effectiveItems],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setBoardItems(items);
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!activeId || !overId) return;

    const target = resolveDropTarget(effectiveItems, columns, activeId, overId);
    if (!target) return;

    const currentColumn = findItemColumn(effectiveItems, activeId);
    if (currentColumn === target.destinationColumn) return;

    setBoardItems((current) =>
      moveBoardItem(current, activeId, target.destinationColumn, target.destinationIndex),
    );
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!activeId || !overId) {
      setActiveId(null);
      setBoardItems(items);
      return;
    }

    const sourceColumn = findItemColumn(items, activeId);
    const target = resolveDropTarget(effectiveItems, columns, activeId, overId);
    if (!sourceColumn || !target) {
      setActiveId(null);
      setBoardItems([]);
      return;
    }

    let nextItems = effectiveItems;
    if (sourceColumn === target.destinationColumn) {
      const columnItems = getColumnItems(effectiveItems, sourceColumn);
      const oldIndex = columnItems.findIndex((item) => item.id === activeId);
      const newIndex = overId === target.destinationColumn
        ? columnItems.length - 1
        : columnItems.findIndex((item) => item.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reorderedIds = arrayMove(columnItems.map((item) => item.id), oldIndex, newIndex);
        nextItems = [
          ...effectiveItems.filter((item) => item.columnKey !== sourceColumn),
          ...reorderedIds.map((id, index) => {
            const item = columnItems.find((entry) => entry.id === id)!;
            return {
              ...item,
              orderRank: (index + 1) * 1024,
            };
          }),
        ] as T[];
      }
    } else {
      nextItems = moveBoardItem(boardItems, activeId, target.destinationColumn, target.destinationIndex) as T[];
    }

    setBoardItems([]);
    setActiveId(null);

    const destinationItems = getColumnItems(nextItems, target.destinationColumn);
    const index = destinationItems.findIndex((item) => item.id === activeId);
    await onMove({
      itemId: activeId,
      sourceColumn,
      destinationColumn: target.destinationColumn,
      beforeId: index > 0 ? destinationItems[index - 1].id : null,
      afterId: destinationItems[index + 1]?.id ?? null,
    }, nextItems);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={(event) => void handleDragEnd(event)}
      onDragCancel={() => {
        setActiveId(null);
        setBoardItems(items);
      }}
    >
      <Box style={{ width: "100%", maxWidth: "100%", overflowX: "auto", overflowY: "hidden" }}>
        <Group
          wrap="nowrap"
          align="flex-start"
          gap="lg"
          h="100%"
          pt="md"
          style={{ minWidth: "max-content" }}
        >
          {columns.map((column) => {
            const columnItems = getColumnItems(effectiveItems, column.key);

            return (
              <Stack key={column.key} gap="md" w={320} miw={320} h="100%">
                <UnifiedCard tone={column.tone} accentBandTone={column.tone} flexShrink={0}>
                  <Stack gap="md">
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
                    {renderColumnContent ? renderColumnContent(column, { itemCount: columnItems.length }) : null}
                  </Stack>
                </UnifiedCard>

                <DroppableColumn column={column}>
                  <ScrollArea offsetScrollbars flex={1} viewportProps={{ style: { display: "flex", flexDirection: "column" } }}>
                    <SortableContext items={columnItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                      <Stack gap="sm" p={4} flex={1}>
                        {columnItems.length === 0 ? (
                          <UnifiedCard tone={column.tone} dashed muted>
                            <Text size="xs" c="dimmed">
                              {emptyColumnCopy}
                            </Text>
                          </UnifiedCard>
                        ) : null}
                        {columnItems.map((item) => (
                          <SortableBoardCard
                            key={item.id}
                            item={item}
                            tone={getCardTone ? getCardTone(item) : column.tone}
                          >
                            {renderCard(item, { dragging: activeId === item.id, overlay: false })}
                          </SortableBoardCard>
                        ))}
                      </Stack>
                    </SortableContext>
                  </ScrollArea>
                </DroppableColumn>
              </Stack>
            );
          })}
        </Group>
      </Box>

      <DragOverlay>
        {activeItem ? (
          <UnifiedCard tone={getCardTone ? getCardTone(activeItem) : "neutral"}>
            {renderCard(activeItem, { dragging: true, overlay: true })}
          </UnifiedCard>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
