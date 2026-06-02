'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Box, Button, Center, Divider, Group, Loader, Modal, Select, SimpleGrid, Stack } from "@mantine/core";
import { IconDownload as Download, IconLayersIntersect as Layers, IconRefresh as RefreshCw, IconTarget as Target, IconTrash as Trash2 } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { SharedBoard } from "@/components/board/shared-board";
import { CardShareAction } from "@/components/ui/card-share-action";
import { PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCardBody, UnifiedCardFreshnessBadge, UnifiedCardSection } from "@/components/ui/unified-card";
import { MetaText, Text } from "@/components/ui/typography";
import { CHECKLIST_BOARD_COLUMNS } from "@/lib/board-system";
import { getTaskCardFreshness } from "@/lib/card-freshness";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
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
    reasons: string[];
  } | null;
};

const COLUMN_OPTIONS = CHECKLIST_BOARD_COLUMNS.map((column) => ({
  value: column.key,
  label: `${column.label} (${column.description})`,
}));

function TacticalCardModal({
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
  onMove: (itemId: string, column: ChecklistKanbanColumn) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string, targetType: "KNOWLEDGE" | "GOAL") => void;
}) {
  const freshness = item
    ? getTaskCardFreshness({
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        generatedAt: item.generatedAt,
      })
    : null;

  return (
    <Modal opened={opened} onClose={onClose} centered withinPortal={false} title={item ? `#${item.publicId ?? "—"} Tactical Unit` : "Tactical Unit"} size="lg">
      {!item ? null : (
        <Stack gap="lg">
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start">
              <Text size="lg">{stripTechnicalMetadata(item.title)}</Text>
              <UnifiedCardFreshnessBadge freshness={freshness} />
            </Group>
            {item.description ? (
              <Text size="sm" c="dimmed">
                {stripTechnicalMetadata(item.description)}
              </Text>
            ) : null}
          </Stack>

          <SimpleGrid cols={4}>
            <UnifiedCardSection tone="review">
              <Stack gap={2} align="center">
                <Text size="xl" c="review">{item.impact}</Text>
                <Text size="xs" c="dimmed">Impact</Text>
              </Stack>
            </UnifiedCardSection>
            <UnifiedCardSection tone="tactical">
              <Stack gap={2} align="center">
                <Text size="xl" c="tactical">{item.confidence}</Text>
                <Text size="xs" c="dimmed">Confidence</Text>
              </Stack>
            </UnifiedCardSection>
            <UnifiedCardSection tone="strategy">
              <Stack gap={2} align="center">
                <Text size="xl" c="strategy">{item.ease}</Text>
                <Text size="xs" c="dimmed">Ease</Text>
              </Stack>
            </UnifiedCardSection>
            <UnifiedCardSection tone="checklist">
              <Stack gap={2} align="center">
                <Text size="xl" c="checklist">{Math.round(item.priorityProfile?.score ?? item.iceScore)}</Text>
                <Text size="xs" c="dimmed">{item.priorityProfile ? "Priority" : "ICE"}</Text>
              </Stack>
            </UnifiedCardSection>
          </SimpleGrid>

          {item.priorityProfile?.reasons?.length ? (
            <UnifiedCardSection tone="tactical">
              <Text size="xs" c="dimmed">
                {item.priorityProfile.reasons.slice(0, 6).join(" · ")}
              </Text>
            </UnifiedCardSection>
          ) : null}

          {item.evaluationReason ? (
            <UnifiedCardSection tone="review">
              <Text size="sm">{stripTechnicalMetadata(item.evaluationReason)}</Text>
            </UnifiedCardSection>
          ) : null}

          {item.hashtags?.length ? (
            <Group gap="xs">
              {item.hashtags.map((tag) => (
                <Badge key={tag} size="xs" color="tactical">
                  #{tag}
                </Badge>
              ))}
            </Group>
          ) : null}

          <Divider variant="dashed" />

          <Select
            data={COLUMN_OPTIONS}
            value={item.kanbanColumn}
            label={<Text size="xs">Move to tactical horizon</Text>}
            onChange={(value) => {
              if (value && value !== item.kanbanColumn) {
                onMove(item.id, value as ChecklistKanbanColumn);
                onClose();
              }
            }}
          />

          <Group grow>
            <Button variant="light" color="knowmore" leftSection={<RefreshCw size={14} />} onClick={() => onConvert(item.id, "KNOWLEDGE")}>
              Migrate to Knowledge
            </Button>
            <Button variant="light" color="strategy" leftSection={<Layers size={14} />} onClick={() => onConvert(item.id, "GOAL")}>
              Migrate to Goals
            </Button>
          </Group>

          <Group justify="space-between">
            <Button variant="subtle" color="review" leftSection={<Trash2 size={16} />} onClick={() => onDelete(item.id)}>
              Archive Unit
            </Button>
            <Group gap="sm">
              <CardShareAction cardId={item.id} color="gray" size="md" />
              <Button variant="light" color="dark" onClick={onClose}>Close</Button>
            </Group>
          </Group>

          <Group justify="flex-end" gap="xs">
            <MetaText>COMMITTED: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}</MetaText>
            <MetaText>SYNCED: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</MetaText>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

export function TacticalBoard({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<ChecklistTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [planningSummary, setPlanningSummary] = useState<{
    laneCounts: Record<ChecklistKanbanColumn, number>;
    tacticalCount: number;
    checklistCount: number;
  } | null>(null);
  const [projectionFreshness, setProjectionFreshness] = useState<ProjectionFreshness | null>(null);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const planningExportHref = `/api/checklist/export?companyId=${companyId}&scope=planning`;

  const boardItems = useMemo(
    () => items.map((item) => ({
      ...item,
      columnKey: item.kanbanColumn,
      orderRank: Number(item.sortOrder ?? 0),
    })),
    [items],
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/checklist?companyId=${companyId}&all=true`);
      if (!response.ok) return;
      const data = await response.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const fetchPlanningSummary = useCallback(async () => {
    const response = await fetch(`/api/companies/${companyId}/planning-summary`);
    if (!response.ok) return;
    const data = await response.json();
    setPlanningSummary(data.planningSummary ?? null);
    setProjectionFreshness(data.projection?.freshness ?? null);
  }, [companyId]);

  useEffect(() => {
    void (async () => {
      await fetchPlanningSummary();
      await fetchItems();
    })();

    const interval = window.setInterval(() => {
      void fetchPlanningSummary();
      void fetchItems();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchItems, fetchPlanningSummary]);

  const persistMove = useCallback(async (
    itemId: string,
    sourceColumn: ChecklistKanbanColumn,
    destinationColumn: ChecklistKanbanColumn,
    beforeId: string | null,
    afterId: string | null,
  ) => {
    try {
      await fetch(`/api/checklist?id=${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceColumn,
          destinationColumn,
          beforeId,
          afterId,
        }),
      });
    } catch {
      await fetchItems();
    }
  }, [fetchItems]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to archive this task?")) return;
    await fetch(`/api/checklist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setItems((current) => current.filter((item) => item.id !== id));
    setDetailId(null);
  }, []);

  const handleConvert = useCallback(async (id: string, targetType: "KNOWLEDGE" | "GOAL") => {
    const response = await fetch("/api/intelligence/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: id,
        sourceType: "TASKCARD",
        targetType: targetType === "KNOWLEDGE" ? "FLASHCARD" : "GOALCARD",
        companyId,
      }),
    });
    if (response.ok) {
      setItems((current) => current.filter((item) => item.id !== id));
      setDetailId(null);
      closeModal();
    }
  }, [closeModal, companyId]);

  const projectionFreshnessLabel =
    projectionFreshness?.status === "FRESH"
      ? `Projection fresh${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
      : projectionFreshness?.status === "AGING"
        ? `Projection aging${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
        : projectionFreshness?.status === "STALE"
          ? `Projection stale${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
          : "Projection missing";

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

  return (
    <Box h="100vh" display="flex" style={{ flexDirection: "column", overflow: "hidden" }}>
      <TacticalCardModal
        item={detailId ? items.find((item) => item.id === detailId) ?? null : null}
        opened={modalOpened}
        onClose={() => {
          closeModal();
          setDetailId(null);
        }}
        onMove={(itemId, column) => {
          const source = items.find((item) => item.id === itemId);
          if (!source) return;
          const destinationItems = boardItems
            .filter((item) => item.columnKey === column && item.id !== itemId)
            .sort((left, right) => left.orderRank - right.orderRank);
          setItems((current) =>
            current.map((item) =>
              item.id === itemId
                ? { ...item, kanbanColumn: column, sortOrder: (destinationItems.length + 1) * 1024 }
                : item,
            ),
          );
          void persistMove(itemId, source.kanbanColumn, column, destinationItems.at(-1)?.id ?? null, null);
        }}
        onDelete={handleDelete}
        onConvert={handleConvert}
      />

      <Box flex={1} p="xl" style={{ overflowX: "hidden", overflowY: "auto" }}>
        <PipelineAccentHeader activeKey="tactical" title="Tactical Board" icon={Target} />
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
          <Button component="a" href={planningExportHref} variant="light" color="gray" size="xs" leftSection={<Download size={14} />}>
            Export CSV
          </Button>
        </Group>

        <SharedBoard
          columns={CHECKLIST_BOARD_COLUMNS}
          items={boardItems}
          onMove={async (request, nextItems) => {
            setItems(nextItems.map((item) => ({
              ...item,
              kanbanColumn: item.columnKey as ChecklistKanbanColumn,
              sortOrder: item.orderRank,
            })));
            await persistMove(
              request.itemId,
              request.sourceColumn as ChecklistKanbanColumn,
              request.destinationColumn as ChecklistKanbanColumn,
              request.beforeId,
              request.afterId,
            );
          }}
          renderCard={(item) => {
            const freshness = getTaskCardFreshness({
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              generatedAt: item.generatedAt,
            });

            return (
              <UnifiedCardBody>
                <Stack gap="xs" onClick={() => { setDetailId(item.id); openModal(); }}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                    <Text size="xs" lineClamp={2} flex={1}>
                      {stripTechnicalMetadata(item.title)}
                    </Text>
                    <UnifiedCardFreshnessBadge freshness={freshness} />
                  </Group>
                  {item.description ? (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {stripTechnicalMetadata(item.description)}
                    </Text>
                  ) : null}
                  <Group justify="space-between" wrap="nowrap">
                    <Badge size="xs" variant="light" color={item.impact >= 8 ? "review" : item.impact >= 5 ? "checklist" : "dark"}>
                      {item.candidateState}
                    </Badge>
                    <Group gap={4}>
                      <MetaText>{item.priorityProfile ? "PRIORITY" : "ICE"}</MetaText>
                      <Text size="xs" c="tactical" ff="monospace">
                        {Math.round(item.priorityProfile?.score ?? item.iceScore)}
                      </Text>
                    </Group>
                  </Group>
                </Stack>
              </UnifiedCardBody>
            );
          }}
        />
      </Box>
    </Box>
  );
}
