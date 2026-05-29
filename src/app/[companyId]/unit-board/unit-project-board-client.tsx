'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChecklist as Checklist, IconPlus as Plus, IconRefresh as Refresh } from "@tabler/icons-react";
import { SharedBoard } from "@/components/board/shared-board";
import { Notice, PageHeader, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCardBody } from "@/components/ui/unified-card";
import { Text } from "@/components/ui/typography";
import type { BoardColumn } from "@/lib/board-system";
import { PROJECT_BOARD_COLUMNS, sortBoardRecords } from "@/lib/board-system";

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
  assignee?: string | null;
  dueDate?: string | null;
  estimatedEffort?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
  notes?: string | null;
};

const RECENT_CREATE_TTL_MS = 45_000;
type BoardFilter = {
  priority: string;
  sourceType: string;
};

const PRIORITY_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "0", label: "Priority 0" },
  { value: "1", label: "Priority 1" },
  { value: "2", label: "Priority 2" },
  { value: "3", label: "Priority 3" },
];

const SOURCE_TYPE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "TASK", label: "Task" },
  { value: "GOAL", label: "Goal" },
  { value: "TOPIC", label: "Topic" },
  { value: "DATA", label: "Data" },
  { value: "AI_QUEUE", label: "AI Queue" },
];

function normalizeDraftPriority(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(3, Math.round(parsed)));
}

function makeBoardTraceId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function UnitProjectBoardClient({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UnitBoardItem[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftColumnKey, setDraftColumnKey] = useState<string>("IDEABANK");
  const [draftPriority, setDraftPriority] = useState("1");
  const [draftAssignee, setDraftAssignee] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [draftEstimatedEffort, setDraftEstimatedEffort] = useState("");
  const [draftSourceType, setDraftSourceType] = useState("");
  const [draftSourceId, setDraftSourceId] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const recentlyCreatedCards = useRef<Map<string, { createdAt: number; item: UnitBoardItem }>>(new Map());
  const loadRequestIdRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [boardFilter, setBoardFilter] = useState<BoardFilter>({ priority: "all", sourceType: "all" });

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (query) {
        const haystack = `${item.title} ${item.description ?? ""} ${item.assignee ?? ""} ${item.sourceId ?? ""} ${item.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      if (boardFilter.priority !== "all" && String(item.priority) !== boardFilter.priority) {
        return false;
      }

      if (boardFilter.sourceType !== "all") {
        if ((item.sourceType ?? "") !== boardFilter.sourceType) return false;
      }

      return true;
    });
  }, [boardFilter.priority, boardFilter.sourceType, items, searchQuery]);

  const presentBoardError = useCallback((payload: { error?: string; detail?: string } | null, fallback: string) => {
    const message = payload?.error || fallback;
    const detail = payload?.detail || null;
    const combined = detail ? `${message} ${detail}` : message;
    setBoardError(combined);
    notifications.show({
      title: "Project board unavailable",
      message: combined,
      color: "review",
    });
  }, []);

  const traceEnabled = useMemo(() => process.env.NODE_ENV !== "production", []);

  const requestBoardItems = useCallback(async (
    url: string,
    init: RequestInit & { headers?: HeadersInit } = {},
    traceId?: string,
  ) => {
    const requestTraceId = traceId || makeBoardTraceId();
    const headers = new Headers(init.headers ?? {});
    headers.set("x-board-items-trace-id", requestTraceId);
    if (traceEnabled) {
      headers.set("x-board-items-debug", "1");
    }

    const normalizedUrl = `${url}${url.includes("?") ? "&" : "?"}traceId=${encodeURIComponent(requestTraceId)}${
      traceEnabled ? "&debug=1" : ""
    }`;

    const response = await fetch(normalizedUrl, {
      ...init,
      headers,
    });

    return {
      response,
      traceId: response.headers.get("X-Board-Trace-Id") ?? requestTraceId,
    };
  }, [traceEnabled]);

  const reconcileLoadedItems = useCallback((loadedItems: UnitBoardItem[]) => {
    const now = Date.now();
    const nextItems = [...loadedItems];
    const seen = new Set(nextItems.map((item) => item.id));
    const nextRecent = new Map<string, { createdAt: number; item: UnitBoardItem }>();

    recentlyCreatedCards.current.forEach((value, id) => {
      if (now - value.createdAt > RECENT_CREATE_TTL_MS) {
        return;
      }
      if (!seen.has(id)) {
        nextItems.push(value.item);
      }
      nextRecent.set(id, value);
    });

    if (nextRecent.size !== recentlyCreatedCards.current.size) {
      recentlyCreatedCards.current = nextRecent;
    }

    return sortBoardRecords(nextItems);
  }, []);

  const load = useCallback(async (traceId?: string, options: { suppressLoading?: boolean } = {}) => {
    const requestId = ++loadRequestIdRef.current;
    const traceEnabledLoading = !options.suppressLoading;
    if (traceEnabledLoading) {
      setLoading(true);
    }
    try {
      const { response } = await requestBoardItems(
        `/api/board-items?companyId=${encodeURIComponent(companyId)}&boardKey=UNIT_PROJECT&_=${Date.now()}`,
        { cache: "no-store" },
        traceId,
      );
      if (requestId !== loadRequestIdRef.current) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        presentBoardError(payload, "Unable to load the project board.");
        return;
      }
      const data = await response.json();
      setBoardError(null);
      const loadedItems: UnitBoardItem[] = Array.isArray(data.items) ? (data.items as UnitBoardItem[]) : [];
      setItems(reconcileLoadedItems(loadedItems));

      const now = Date.now();
      const loadedIds = new Set(loadedItems.map((item) => item.id));
      if (recentlyCreatedCards.current.size > 0) {
        const nextRecent = new Map<string, { createdAt: number; item: UnitBoardItem }>();
        recentlyCreatedCards.current.forEach((value, id) => {
          if (loadedIds.has(id)) {
            return;
          }
          if (now - value.createdAt <= RECENT_CREATE_TTL_MS) {
            nextRecent.set(id, value);
          }
        });
        recentlyCreatedCards.current = nextRecent;
      }
    } finally {
      if (requestId === loadRequestIdRef.current && traceEnabledLoading) {
        setLoading(false);
      }
    }
  }, [companyId, presentBoardError, reconcileLoadedItems, requestBoardItems]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const resetDraft = useCallback((columnKey = "IDEABANK") => {
    setSelectedId(null);
    setDraftTitle("");
    setDraftDescription("");
    setDraftPriority("1");
    setDraftAssignee("");
    setDraftDueDate("");
    setDraftEstimatedEffort("");
    setDraftSourceType("");
    setDraftSourceId("");
    setDraftNotes("");
    setDraftColumnKey(columnKey);
  }, []);

  const openCreateModal = useCallback((columnKey = "IDEABANK") => {
    resetDraft(columnKey);
    setModalOpen(true);
  }, [resetDraft]);

  const openEditModal = useCallback((item: UnitBoardItem) => {
    setSelectedId(item.id);
    setDraftTitle(item.title);
    setDraftDescription(item.description ?? "");
    setDraftPriority(String(item.priority ?? 1));
    setDraftAssignee(item.assignee ?? "");
    setDraftDueDate(item.dueDate ? item.dueDate.slice(0, 10) : "");
    setDraftEstimatedEffort(item.estimatedEffort != null ? String(item.estimatedEffort) : "");
    setDraftSourceType(item.sourceType ?? "");
    setDraftSourceId(item.sourceId ?? "");
    setDraftNotes(item.notes ?? "");
    setDraftColumnKey(item.columnKey);
    setModalOpen(true);
  }, []);

  const createCard = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) return;
    const traceId = makeBoardTraceId();
    const { response } = await requestBoardItems("/api/board-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        boardKey: "UNIT_PROJECT",
        title,
        description: draftDescription,
        columnKey: draftColumnKey,
        priority: normalizeDraftPriority(draftPriority),
        assignee: draftAssignee.trim(),
        dueDate: draftDueDate || null,
        estimatedEffort: draftEstimatedEffort ? Number(draftEstimatedEffort) : null,
        sourceType: draftSourceType || null,
        sourceId: draftSourceId.trim() || null,
        notes: draftNotes.trim(),
      }),
    }, traceId);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      presentBoardError(payload, "Unable to create the project card.");
      setBoardError(`Unable to create the project card. TraceId: ${traceId}`);
      return;
    }
    const payload = await response.json().catch(() => null);
    const createdItem = payload?.item as UnitBoardItem | undefined;
    if (createdItem) {
      recentlyCreatedCards.current.set(createdItem.id, {
        createdAt: Date.now(),
        item: createdItem,
      });
      setItems((current) => sortBoardRecords([...current, createdItem]));
    }
    setModalOpen(false);
    resetDraft();
    setBoardError(null);
    await load(traceId);
  }, [companyId, draftAssignee, draftColumnKey, draftDescription, draftDueDate, draftEstimatedEffort, draftNotes, draftPriority, draftSourceId, draftSourceType, draftTitle, load, presentBoardError, requestBoardItems, resetDraft]);

  const updateCard = useCallback(async () => {
    if (!selected) return;
    const traceId = makeBoardTraceId();
    const { response: updateResponse } = await requestBoardItems("/api/board-items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        boardKey: "UNIT_PROJECT",
        id: selected.id,
        title: draftTitle,
        description: draftDescription,
        columnKey: draftColumnKey,
        priority: normalizeDraftPriority(draftPriority),
        assignee: draftAssignee.trim(),
        dueDate: draftDueDate || null,
        estimatedEffort: draftEstimatedEffort ? Number(draftEstimatedEffort) : null,
        sourceType: draftSourceType || null,
        sourceId: draftSourceId.trim() || null,
        notes: draftNotes.trim(),
      }),
    }, traceId);
    if (!updateResponse.ok) {
      const payload = await updateResponse.json().catch(() => null);
      presentBoardError(payload, "Unable to update the project card.");
      setBoardError(`Unable to update the project card. TraceId: ${traceId}`);
      return;
    }
    if (draftColumnKey !== selected.columnKey) {
      const { response: moveResponse } = await requestBoardItems("/api/board-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          boardKey: "UNIT_PROJECT",
          id: selected.id,
          destinationColumn: draftColumnKey,
          beforeId: null,
          afterId: null,
        }),
      }, traceId);
      if (!moveResponse.ok) {
        const payload = await moveResponse.json().catch(() => null);
        presentBoardError(payload, "Unable to move the project card.");
        setBoardError(`Unable to move the project card. TraceId: ${traceId}`);
        return;
      }
    }
    setModalOpen(false);
    resetDraft();
    setBoardError(null);
    await load(traceId);
  }, [companyId, draftAssignee, draftColumnKey, draftDescription, draftDueDate, draftEstimatedEffort, draftNotes, draftPriority, draftSourceId, draftSourceType, draftTitle, load, presentBoardError, requestBoardItems, resetDraft, selected]);

  const archiveCard = useCallback(async (id: string) => {
    const traceId = makeBoardTraceId();
    const { response } = await requestBoardItems(
      `/api/board-items?companyId=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
      traceId,
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      presentBoardError(payload, "Unable to archive the project card.");
      setBoardError(`Unable to archive the project card. TraceId: ${traceId}`);
      return;
    }
    if (selectedId === id) {
      setModalOpen(false);
      resetDraft();
    }
    setBoardError(null);
    await load(traceId);
  }, [companyId, load, presentBoardError, requestBoardItems, resetDraft, selectedId]);

  const submitCard = useCallback(async () => {
    if (selected) {
      await updateCard();
      return;
    }
    await createCard();
  }, [createCard, selected, updateCard]);

  const handleMove = useCallback(async (
    request: {
      itemId: string;
      sourceColumn: string;
      destinationColumn: string;
      beforeId: string | null;
      afterId: string | null;
    },
    nextItems: UnitBoardItem[],
  ) => {
    const traceId = makeBoardTraceId();
    setItems((current) => {
      const nextSet = new Set(nextItems.map((item) => item.id));
      const merged = [
        ...current.filter((item) => !nextSet.has(item.id)),
        ...nextItems,
      ];
      return sortBoardRecords(merged);
    });
    try {
      const { response } = await requestBoardItems(
        "/api/board-items",
        {
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
        },
        traceId,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        presentBoardError(payload, "Unable to move the project card.");
        await load(traceId);
        return;
      }

      setBoardError(null);
    } catch {
      await load(traceId);
    }
  }, [companyId, load, presentBoardError, requestBoardItems]);

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
        {boardError ? (
          <Notice title="Project board writes are currently unavailable" variant="destructive">
            {boardError}
          </Notice>
        ) : null}

        <PageHeader
          title="Unit Project Board"
          description="Independent project execution board for this intelligence unit, driven by the canonical board API."
          actions={(
            <Group gap="sm">
              <Button variant="light" color="gray" leftSection={<Refresh size={14} />} onClick={() => void load()}>
                Refresh
              </Button>
            </Group>
          )}
        />

        <PipelineAccentHeader activeKey="review" title="Project Delivery Flow" icon={Checklist} />

        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput
              style={{ minWidth: 260 }}
              label="Search cards"
              placeholder="Title, assignee, notes..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />
            <Select
              label="Priority"
              style={{ minWidth: 190 }}
              data={PRIORITY_OPTIONS}
              value={boardFilter.priority}
              onChange={(value) => {
                if (value) {
                  setBoardFilter((current) => ({ ...current, priority: value }));
                }
              }}
            />
            <Select
              label="Source type"
              style={{ minWidth: 200 }}
              data={SOURCE_TYPE_OPTIONS}
              value={boardFilter.sourceType}
              onChange={(value) => {
                if (value) {
                  setBoardFilter((current) => ({ ...current, sourceType: value }));
                }
              }}
            />
            <Button
              variant="subtle"
              onClick={() => {
                setSearchQuery("");
                setBoardFilter({ priority: "all", sourceType: "all" });
              }}
            >
              Clear filters
            </Button>
          </Group>
        </Stack>
        <Divider />

        <SharedBoard
          columns={PROJECT_BOARD_COLUMNS}
          items={visibleItems}
          renderColumnContent={(column: BoardColumn) => (
            column.key === "IDEABANK" ? (
              <Button
                variant="light"
                color="review"
                leftSection={<Plus size={14} />}
                onClick={() => openCreateModal(column.key)}
              >
                Add Card
              </Button>
            ) : null
          )}
          onMove={handleMove}
          renderCard={(item) => (
            <UnifiedCardBody>
              <Stack gap="xs" onClick={() => openEditModal(item)}>
                <Text size="sm" lineClamp={2}>{item.title}</Text>
                {item.description ? (
                  <Text size="xs" c="dimmed" lineClamp={3}>{item.description}</Text>
                ) : null}
                <Group gap="xs" wrap="nowrap">
                  <Badge size="xs" variant="light" color="review">
                    P{item.priority}
                  </Badge>
                  {item.sourceType ? (
                    <Badge size="xs" variant="outline">
                      {item.sourceType}
                    </Badge>
                  ) : null}
                  {item.assignee ? (
                    <Badge size="xs" variant="outline" color="dimmed">
                      {item.assignee}
                    </Badge>
                  ) : null}
                </Group>
                {item.dueDate ? (
                  <Text size="xs" c="dimmed">
                    Due: {new Date(item.dueDate).toLocaleDateString()}
                  </Text>
                ) : null}
                {item.estimatedEffort != null ? (
                  <Text size="xs" c="dimmed">
                    Effort: {item.estimatedEffort}
                  </Text>
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
      </Stack>

      <Modal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetDraft();
        }}
        title={selected ? "Edit project card" : "Create project card"}
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.currentTarget.value)}
            placeholder="Deliver shared board runtime"
          />
          <Textarea
            label="Description"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.currentTarget.value)}
            placeholder="Optional operating notes"
            autosize
            minRows={4}
          />
          <Group grow>
            <Select
              label="Priority"
              data={PRIORITY_OPTIONS.filter((entry) => entry.value !== "all")}
              value={draftPriority}
              onChange={(value) => {
                if (value) setDraftPriority(value);
              }}
            />
            <TextInput
              label="Assignee"
              value={draftAssignee}
              onChange={(event) => setDraftAssignee(event.currentTarget.value)}
              placeholder="Owner handle"
            />
          </Group>
          <Group grow>
            <TextInput
              label="Due date"
              type="date"
              value={draftDueDate}
              onChange={(event) => setDraftDueDate(event.currentTarget.value)}
            />
            <TextInput
              label="Effort"
              type="number"
              min={0}
              value={draftEstimatedEffort}
              onChange={(event) => setDraftEstimatedEffort(event.currentTarget.value)}
              placeholder="Optional"
            />
          </Group>
          <Group grow>
            <Select
              label="Source type"
              data={SOURCE_TYPE_OPTIONS}
              searchable
              value={draftSourceType}
              onChange={(value) => setDraftSourceType(value ?? "")}
            />
            <TextInput
              label="Source ID"
              value={draftSourceId}
              onChange={(event) => setDraftSourceId(event.currentTarget.value)}
              placeholder="Optional source identifier"
            />
          </Group>
          <Textarea
            label="Notes"
            value={draftNotes}
            onChange={(event) => setDraftNotes(event.currentTarget.value)}
            placeholder="Optional notes"
            autosize
            minRows={2}
          />
          <Select
            label="Column"
            data={PROJECT_BOARD_COLUMNS.map((column) => ({
              value: column.key,
              label: column.label,
            }))}
            value={draftColumnKey}
            onChange={(value) => {
              if (value) setDraftColumnKey(value);
            }}
          />
          <Group justify="space-between">
            {selected ? (
              <Button variant="subtle" color="review" onClick={() => void archiveCard(selected.id)}>
                Archive
              </Button>
            ) : (
              <Box />
            )}
            <Button onClick={() => void submitCard()}>
              {selected ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageShell>
  );
}
