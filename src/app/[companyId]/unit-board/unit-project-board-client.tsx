'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Box, Button, Center, Group, Loader, Modal, Stack, TextInput, Textarea } from "@mantine/core";
import { IconChecklist as Checklist, IconPlus as Plus, IconRefresh as Refresh } from "@tabler/icons-react";
import { SharedBoard } from "@/components/board/shared-board";
import { PageHeader, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCardBody, UnifiedCardSection } from "@/components/ui/unified-card";
import { Text } from "@/components/ui/typography";
import { PROJECT_BOARD_COLUMNS } from "@/lib/board-system";

type UnitBoardItem = {
  id: string;
  entityType: "BOARD_CARD";
  boardKey: string;
  title: string;
  description: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  columnKey: string;
  orderRank: number;
  priority: number;
};

export function UnitProjectBoardClient({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UnitBoardItem[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/board-items?companyId=${encodeURIComponent(companyId)}&boardKey=UNIT_PROJECT`);
      if (!response.ok) return;
      const data = await response.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createCard = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) return;
    await fetch("/api/board-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        boardKey: "UNIT_PROJECT",
        title,
        description: draftDescription,
      }),
    });
    setDraftTitle("");
    setDraftDescription("");
    await load();
  }, [companyId, draftDescription, draftTitle, load]);

  const updateCard = useCallback(async () => {
    if (!selected) return;
    await fetch("/api/board-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        boardKey: "UNIT_PROJECT",
        id: selected.id,
        title: draftTitle,
        description: draftDescription,
      }),
    });
    setModalOpen(false);
    await load();
  }, [companyId, draftDescription, draftTitle, load, selected]);

  const archiveCard = useCallback(async (id: string) => {
    await fetch(`/api/board-items?companyId=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (selectedId === id) {
      setSelectedId(null);
      setModalOpen(false);
    }
    await load();
  }, [companyId, load, selectedId]);

  if (loading && items.length === 0) {
    return (
      <PageShell width="full">
        <Center h={400}>
          <Stack align="center" gap="sm">
            <Loader color="review" />
            <Text c="dimmed">Synchronizing Unit Project Board...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PageHeader
          title="Unit Project Board"
          description="Independent project execution board for this intelligence unit. This surface runs in the webapp and persists directly in MongoDB Atlas through the app API."
          actions={(
            <Group gap="sm">
              <Button variant="light" color="gray" leftSection={<Refresh size={14} />} onClick={() => void load()}>
                Refresh
              </Button>
            </Group>
          )}
        />

        <PipelineAccentHeader activeKey="review" title="Project Delivery Flow" icon={Checklist} />

        <UnifiedCardSection tone="review">
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Stack gap={4}>
                <Text size="sm">Create a simple project card</Text>
                <Text size="xs" c="dimmed">Cards are intentionally minimal for low-latency execution flow management.</Text>
              </Stack>
              <Badge variant="light" color="review">{items.length} active cards</Badge>
            </Group>
            <Group align="flex-end">
              <TextInput
                label="Title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.currentTarget.value)}
                placeholder="Deliver shared board runtime"
                style={{ flex: 1 }}
              />
              <Textarea
                label="Description"
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.currentTarget.value)}
                placeholder="Optional operating notes"
                autosize
                minRows={2}
                style={{ flex: 1 }}
              />
              <Button leftSection={<Plus size={14} />} onClick={() => void createCard()}>
                Add Card
              </Button>
            </Group>
          </Stack>
        </UnifiedCardSection>

        <Box style={{ overflowX: "auto", overflowY: "hidden" }}>
          <SharedBoard
            columns={PROJECT_BOARD_COLUMNS}
            items={items}
            onMove={async (request, nextItems) => {
              setItems(nextItems);
              try {
                await fetch("/api/board-items", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    companyId,
                    boardKey: "UNIT_PROJECT",
                    id: request.itemId,
                    sourceColumn: request.sourceColumn,
                    destinationColumn: request.destinationColumn,
                    beforeId: request.beforeId,
                    afterId: request.afterId,
                  }),
                });
              } catch {
                await load();
              }
            }}
            renderCard={(item) => (
              <UnifiedCardBody>
                <Stack gap="xs" onClick={() => {
                  setSelectedId(item.id);
                  setDraftTitle(item.title);
                  setDraftDescription(item.description ?? "");
                  setModalOpen(true);
                }}>
                  <Text size="sm" lineClamp={2}>{item.title}</Text>
                  {item.description ? (
                    <Text size="xs" c="dimmed" lineClamp={3}>{item.description}</Text>
                  ) : null}
                  <Group justify="space-between">
                    <Badge size="xs" variant="light" color="review">
                      {item.createdBy || "webapp-user"}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ""}
                    </Text>
                  </Group>
                </Stack>
              </UnifiedCardBody>
            )}
          />
        </Box>
      </Stack>

      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={selected ? "Edit project card" : "Project card"}
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.currentTarget.value)}
          />
          <Textarea
            label="Description"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.currentTarget.value)}
            autosize
            minRows={4}
          />
          <Group justify="space-between">
            <Button variant="subtle" color="review" onClick={() => selected && void archiveCard(selected.id)}>
              Archive
            </Button>
            <Button onClick={() => void updateCard()}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageShell>
  );
}
