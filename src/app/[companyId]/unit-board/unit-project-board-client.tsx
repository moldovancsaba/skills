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
import { IconChecklist as ChecklistIcon, IconPlus as Plus, IconRefresh as Refresh } from "@tabler/icons-react";
import { SharedBoard } from "@/components/board/shared-board";
import { Notice, PageHeader, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCardBody } from "@/components/ui/unified-card";
import { Text } from "@/components/ui/typography";
import type { BoardColumn } from "@/lib/board-system";
import { BOARD_RANK_STEP, PROJECT_BOARD_COLUMNS, sortBoardRecords } from "@/lib/board-system";

const DEFAULT_BOARD_MODULE = "unit-board";
const BOARD_API_KEY = "UNIT_PROJECT";

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
  syncState?: "saving" | "error";
  syncError?: string | null;
};

type UnitBoardDraftCard = UnitBoardItem & {
  isOptimistic: true;
};

type PendingBoardCard = {
  createdAt: number;
  item: UnitBoardItem;
  replacementId?: string;
};

const RECENT_CREATE_TTL_MS = 180_000;
const BOARD_REQUEST_TIMEOUT_MS = 12_000;
const BOARD_RETRY_MAX_ATTEMPTS = 3;
const BOARD_RETRY_BASE_MS = 500;
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

function buildOptimisticCard(params: {
  id: string;
  title: string;
  description: string;
  columnKey: string;
  priority: number;
  assignee: string;
  dueDate: string;
  estimatedEffort: string;
  sourceType: string;
  sourceId: string;
  notes: string;
  columnCards: UnitBoardItem[];
}) {
  const now = new Date().toISOString();
  const columnRanks = params.columnCards
    .map((item) => item.orderRank)
    .filter((value): value is number => Number.isFinite(value))
    .sort((left, right) => left - right);
  const orderRank = columnRanks.length > 0
    ? columnRanks[columnRanks.length - 1] + BOARD_RANK_STEP
    : BOARD_RANK_STEP;

  return {
    id: params.id,
    entityType: "BOARD_CARD" as const,
    boardKey: BOARD_API_KEY,
    title: params.title,
    description: params.description || null,
    createdBy: "webapp-user",
    createdAt: now,
    updatedAt: now,
    columnKey: params.columnKey,
    orderRank,
    priority: params.priority,
    assignee: params.assignee || null,
    dueDate: params.dueDate || null,
    estimatedEffort: params.estimatedEffort ? Number(params.estimatedEffort) : null,
    sourceType: params.sourceType || null,
    sourceId: params.sourceId || null,
    notes: params.notes || null,
    syncState: "saving",
    syncError: null,
    isOptimistic: true,
  } satisfies UnitBoardDraftCard;
}

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

type BoardWritePayload = {
  error?: string;
  detail?: string;
  retryable?: boolean;
  reasonCode?: string;
  retryAfterMs?: number;
  [key: string]: unknown;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function calculateBoardRetryDelayMs(attemptIndex: number) {
  return BOARD_RETRY_BASE_MS * (2 ** (attemptIndex - 1));
}

function isRetryableBoardFailure(payload: BoardWritePayload | null, status: number) {
  if (payload?.retryable === true) return true;
  return status === 503 || (status >= 500 && status !== 501);
}

function normalizeBoardErrorPayload(payload: BoardWritePayload | null, fallback: string, traceId: string) {
  const message = payload?.error || fallback;
  const detail = payload?.detail ? ` ${payload.detail}` : "";
  return `${message}${detail} (traceId ${traceId})`;
}

function parseBoardPayload(response: Response) {
  return response.json().catch(() => null) as Promise<BoardWritePayload | null>;
}

function describeBoardError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request timed out";
  }
  if (error instanceof Error) return error.message || "Network error";
  return "Network error";
}

export function UnitProjectBoardClient({
  companyId,
  boardModule,
}: {
  companyId: string;
  boardModule?: string;
}) {
  const allowedBoardModules = useMemo(
    () => new Set(["unit-board", "unitboard", "unit", "project-board", "unit-project"]),
    [],
  );
  const normalizedBoardModule = useMemo(() => {
    const normalized = boardModule?.trim().toLowerCase() || DEFAULT_BOARD_MODULE;
    if (normalized.length === 0) return DEFAULT_BOARD_MODULE;
    return allowedBoardModules.has(normalized) ? normalized : DEFAULT_BOARD_MODULE;
  }, [allowedBoardModules, boardModule]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UnitBoardItem[]>([]);
  const itemsRef = useRef<UnitBoardItem[]>([]);
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
  const [isSubmitting, setSubmitting] = useState(false);
  const recentlyCreatedCards = useRef<Map<string, PendingBoardCard>>(new Map());
  const loadRequestIdRef = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [boardFilter, setBoardFilter] = useState<BoardFilter>({ priority: "all", sourceType: "all" });

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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

  const appendBoardScope = useCallback((url: string) => {
    const connector = url.includes("?") ? "&" : "?";
    return `${url}${connector}module=${encodeURIComponent(normalizedBoardModule)}&boardKey=${encodeURIComponent(BOARD_API_KEY)}`;
  }, [normalizedBoardModule]);

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

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, BOARD_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(normalizedUrl, {
        ...init,
        headers,
        signal: controller.signal,
      });
      return {
        response,
        traceId: response.headers.get("X-Board-Trace-Id") ?? requestTraceId,
      };
    } finally {
      clearTimeout(timeout);
    }
  }, [traceEnabled]);

  const reconcileLoadedItems = useCallback((loadedItems: UnitBoardItem[]) => {
    const now = Date.now();
    const nextItems = [...loadedItems];
    const seen = new Set(nextItems.map((item) => item.id));
    const nextRecent = new Map<string, PendingBoardCard>();

    recentlyCreatedCards.current.forEach((value, id) => {
      if (now - value.createdAt > RECENT_CREATE_TTL_MS) {
        return;
      }

      const shouldKeepPending = !value.replacementId || !seen.has(value.replacementId);
      if (!shouldKeepPending) {
        return;
      }

      const itemId = value.item.id;
      if (!seen.has(itemId)) {
        nextItems.push(value.item);
        seen.add(itemId);
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
        appendBoardScope(`/api/board-items?companyId=${encodeURIComponent(companyId)}&_=${Date.now()}`),
        { cache: "no-store" },
        traceId,
      );
      if (requestId !== loadRequestIdRef.current) return;
      if (!response.ok) {
        const payload = await parseBoardPayload(response);
        presentBoardError(payload, "Unable to load the project board.");
        return;
      }
      const data = await parseBoardPayload(response);
      setBoardError(null);
      const loadedItems: UnitBoardItem[] = Array.isArray((data as { items?: unknown })?.items)
        ? ((data as { items?: UnitBoardItem[] }).items ?? [])
        : [];
      setItems(reconcileLoadedItems(loadedItems));

      const now = Date.now();
      const loadedIds = new Set(loadedItems.map((item) => item.id));
      if (recentlyCreatedCards.current.size > 0) {
        const nextRecent = new Map<string, PendingBoardCard>();
        recentlyCreatedCards.current.forEach((value, id) => {
          if (now - value.createdAt > RECENT_CREATE_TTL_MS) {
            return;
          }
          if (!value.replacementId && loadedIds.has(id)) {
            return;
          }
          if (value.replacementId && loadedIds.has(value.replacementId)) {
            return;
          }
          nextRecent.set(id, value);
        });
        recentlyCreatedCards.current = nextRecent;
      }
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      presentBoardError({ error: "Project board load failed", detail: describeBoardError(error) }, "Unable to load the project board.");
    } finally {
      if (requestId === loadRequestIdRef.current && traceEnabledLoading) {
        setLoading(false);
      }
    }
  }, [appendBoardScope, companyId, presentBoardError, reconcileLoadedItems, requestBoardItems]);

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
    if (!title || isSubmitting) return;

    const priority = normalizeDraftPriority(draftPriority);
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimisticCard = buildOptimisticCard({
      id: optimisticId,
      title,
      description: draftDescription,
      columnKey: draftColumnKey,
      priority,
      assignee: draftAssignee.trim(),
      dueDate: draftDueDate,
      estimatedEffort: draftEstimatedEffort,
      sourceType: draftSourceType,
      sourceId: draftSourceId,
      notes: draftNotes,
      columnCards: items.filter((item) => item.columnKey === draftColumnKey),
    });
    const requestBody = {
      companyId,
      boardKey: BOARD_API_KEY,
      module: normalizedBoardModule,
      title,
      description: draftDescription,
      columnKey: draftColumnKey,
      priority,
      assignee: draftAssignee.trim(),
      dueDate: draftDueDate || null,
      estimatedEffort: draftEstimatedEffort ? Number(draftEstimatedEffort) : null,
      sourceType: draftSourceType || null,
      sourceId: draftSourceId.trim() || null,
      notes: draftNotes.trim(),
    };
    const baseTraceId = makeBoardTraceId();
    const applySyncError = (syncError: string) => {
      setItems((current) => current.map((item) => (
        item.id === optimisticId ? {
          ...item,
          syncState: "error",
          syncError,
        } : item
      )));
    };

    setSubmitting(true);
    setBoardError(null);
    setItems((current) => sortBoardRecords([...current, optimisticCard]));
    recentlyCreatedCards.current.set(optimisticId, {
      createdAt: Date.now(),
      item: optimisticCard,
    });

    try {
      for (let attempt = 1; attempt <= BOARD_RETRY_MAX_ATTEMPTS; attempt += 1) {
        const requestTraceId = attempt === 1 ? baseTraceId : `${baseTraceId}-retry-${attempt - 1}`;
        try {
          const { response } = await requestBoardItems("/api/board-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          }, requestTraceId);
          const payload = await parseBoardPayload(response);
          if (!response.ok) {
            const message = normalizeBoardErrorPayload(payload, "Unable to create the project card.", requestTraceId);
            if (isRetryableBoardFailure(payload, response.status) && attempt < BOARD_RETRY_MAX_ATTEMPTS) {
              setBoardError(`Create request is retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${requestTraceId}`);
              await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
              continue;
            }
            presentBoardError(payload, "Unable to create the project card.");
            setBoardError(message);
            applySyncError(message);
            return;
          }

          const createdItem = payload?.item as UnitBoardItem | undefined;
          if (!createdItem || typeof createdItem.id !== "string" || createdItem.id.length === 0) {
            const message = normalizeBoardErrorPayload(payload, "Unable to read the created project card.", requestTraceId);
            presentBoardError(payload, "Unable to read the created project card.");
            setBoardError(message);
            applySyncError(message);
            return;
          }

          setItems((current) => current.map((item) => (item.id === optimisticId ? createdItem : item)));
          recentlyCreatedCards.current.set(optimisticId, {
            createdAt: Date.now(),
            item: createdItem,
            replacementId: createdItem.id,
          });
          setModalOpen(false);
          resetDraft();
          setBoardError(null);
          await load(requestTraceId);
          return;
        } catch (error) {
          const message = `Unable to create the project card. ${(error instanceof Error ? error.message : "Network issue")} (traceId ${requestTraceId})`;
          if (attempt < BOARD_RETRY_MAX_ATTEMPTS) {
            presentBoardError({ error: "Create request failed", detail: message }, "Unable to create the project card.");
            setBoardError(`Retrying create request. Attempt ${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}. TraceId ${requestTraceId}`);
            await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
            continue;
          }
          presentBoardError({ error: "Create request failed", detail: message }, "Unable to create the project card.");
          setBoardError(message);
          applySyncError(message);
          return;
        }
      }
    } finally {
      setSubmitting(false);
    }
  }, [companyId, draftAssignee, draftColumnKey, draftDescription, draftDueDate, draftEstimatedEffort, draftNotes, draftPriority, draftSourceId, draftSourceType, draftTitle, isSubmitting, items, load, normalizedBoardModule, presentBoardError, requestBoardItems, resetDraft]);

  const updateCard = useCallback(async () => {
    if (!selected) return;
    const traceId = makeBoardTraceId();
    const previousItems = itemsRef.current;
    const normalizedPriority = normalizeDraftPriority(draftPriority);
    const estimatedEffort = draftEstimatedEffort ? Number(draftEstimatedEffort) : null;
    setBoardError(null);
    setItems((current) => current.map((entry) => (entry.id !== selected.id ? entry : {
      ...entry,
      title: draftTitle,
      description: draftDescription,
      columnKey: draftColumnKey,
      priority: normalizedPriority,
      assignee: draftAssignee.trim() || null,
      dueDate: draftDueDate || null,
      estimatedEffort,
      sourceType: draftSourceType || null,
      sourceId: draftSourceId.trim() || null,
      notes: draftNotes.trim() || null,
    })));

    const updatePayload = {
      companyId,
      boardKey: BOARD_API_KEY,
      module: normalizedBoardModule,
      id: selected.id,
      title: draftTitle,
      description: draftDescription,
      columnKey: draftColumnKey,
      priority: normalizedPriority,
      assignee: draftAssignee.trim(),
      dueDate: draftDueDate || null,
      estimatedEffort,
      sourceType: draftSourceType || null,
      sourceId: draftSourceId.trim() || null,
      notes: draftNotes.trim(),
    };

    for (let attempt = 1; attempt <= BOARD_RETRY_MAX_ATTEMPTS; attempt += 1) {
      const requestTraceId = attempt === 1 ? traceId : `${traceId}-retry-${attempt - 1}`;
      try {
        const { response: updateResponse } = await requestBoardItems("/api/board-items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
        }, requestTraceId);
        const payload = await parseBoardPayload(updateResponse);
          if (!updateResponse.ok) {
            if (isRetryableBoardFailure(payload, updateResponse.status) && attempt < BOARD_RETRY_MAX_ATTEMPTS) {
              setBoardError(`Unable to update the project card. Retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${requestTraceId}`);
              await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
              continue;
            }
            presentBoardError(payload, "Unable to update the project card.");
            setBoardError(`Unable to update the project card. TraceId: ${requestTraceId}`);
            setItems(previousItems);
            return;
          }
          break;
        } catch (error) {
        if (attempt < BOARD_RETRY_MAX_ATTEMPTS) {
          setBoardError(`Unable to update the project card. Retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${requestTraceId}`);
          await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
          continue;
        }
        presentBoardError(
          {
            error: "Update request failed",
            detail: error instanceof Error ? error.message : "Network issue",
          },
          "Unable to update the project card.",
        );
        setBoardError(`Unable to update the project card. TraceId: ${requestTraceId}`);
        setItems(previousItems);
        return;
      }
    }

    if (draftColumnKey !== selected.columnKey) {
      const movePayload = {
        companyId,
        boardKey: BOARD_API_KEY,
        module: normalizedBoardModule,
        id: selected.id,
        destinationColumn: draftColumnKey,
        beforeId: null,
        afterId: null,
      };
      for (let attempt = 1; attempt <= BOARD_RETRY_MAX_ATTEMPTS; attempt += 1) {
        const moveTraceId = attempt === 1 ? traceId : `${traceId}-move-retry-${attempt - 1}`;
        try {
          const { response: moveResponse } = await requestBoardItems("/api/board-items", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(movePayload),
          }, moveTraceId);
          const payload = await parseBoardPayload(moveResponse);
          if (!moveResponse.ok) {
            if (isRetryableBoardFailure(payload, moveResponse.status) && attempt < BOARD_RETRY_MAX_ATTEMPTS) {
              setBoardError(`Unable to move the project card. Retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${moveTraceId}`);
              await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
              continue;
            }
            presentBoardError(payload, "Unable to move the project card.");
            setBoardError(`Unable to move the project card. TraceId: ${moveTraceId}`);
            setItems(previousItems);
            return;
          }
          break;
        } catch {
          if (attempt < BOARD_RETRY_MAX_ATTEMPTS) {
            setBoardError(`Unable to move the project card. Retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${moveTraceId}`);
            await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
            continue;
          }
          setBoardError(`Unable to move the project card. TraceId: ${moveTraceId}`);
          setItems(previousItems);
          return;
        }
      }
    }

    setModalOpen(false);
    resetDraft();
    setBoardError(null);
    await load(traceId);
  }, [companyId, draftAssignee, draftColumnKey, draftDescription, draftDueDate, draftEstimatedEffort, draftNotes, draftPriority, draftSourceId, draftSourceType, draftTitle, load, normalizedBoardModule, presentBoardError, requestBoardItems, resetDraft, selected]);

  const archiveCard = useCallback(async (id: string) => {
    const previousItems = itemsRef.current;
    const wasSelected = selectedId === id;
    setItems((current) => sortBoardRecords(current.filter((item) => item.id !== id)));
    const traceId = makeBoardTraceId();
    for (let attempt = 1; attempt <= BOARD_RETRY_MAX_ATTEMPTS; attempt += 1) {
      const requestTraceId = attempt === 1 ? traceId : `${traceId}-retry-${attempt - 1}`;
      try {
        const { response } = await requestBoardItems(
          appendBoardScope(`/api/board-items?companyId=${encodeURIComponent(companyId)}&id=${encodeURIComponent(id)}`),
          { method: "DELETE" },
          requestTraceId,
        );
        const payload = response.ok ? null : await parseBoardPayload(response);
        if (!response.ok) {
          if (isRetryableBoardFailure(payload, response.status) && attempt < BOARD_RETRY_MAX_ATTEMPTS) {
            setBoardError(`Unable to archive the project card. Retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${requestTraceId}`);
            await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
            continue;
          }
          presentBoardError(payload, "Unable to archive the project card.");
          setBoardError(`Unable to archive the project card. TraceId: ${requestTraceId}`);
          setItems(previousItems);
          return;
        }
        if (wasSelected) {
          setModalOpen(false);
          resetDraft();
        }
        setBoardError(null);
        await load(requestTraceId);
        return;
      } catch (error) {
        if (attempt < BOARD_RETRY_MAX_ATTEMPTS) {
          setBoardError(`Unable to archive the project card. Retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${requestTraceId}`);
          await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
          continue;
        }
        presentBoardError(
          {
            error: "Archive request failed",
            detail: error instanceof Error ? error.message : "Network issue",
          },
          "Unable to archive the project card.",
        );
        setBoardError(`Unable to archive the project card. TraceId: ${requestTraceId}`);
        setItems(previousItems);
      }
    }
  }, [appendBoardScope, companyId, load, presentBoardError, requestBoardItems, resetDraft, selectedId]);

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
    const previousItems = itemsRef.current;
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
  const movePayload = {
        companyId,
        boardKey: BOARD_API_KEY,
        module: normalizedBoardModule,
        id: request.itemId,
        sourceColumn: request.sourceColumn,
        destinationColumn: request.destinationColumn,
        beforeId: request.beforeId,
        afterId: request.afterId,
      };
      for (let attempt = 1; attempt <= BOARD_RETRY_MAX_ATTEMPTS; attempt += 1) {
        const requestTraceId = attempt === 1 ? traceId : `${traceId}-retry-${attempt - 1}`;
        const { response } = await requestBoardItems(
          "/api/board-items",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(movePayload),
          },
          requestTraceId,
        );
        const payload = await parseBoardPayload(response);
        if (!response.ok) {
          if (isRetryableBoardFailure(payload, response.status) && attempt < BOARD_RETRY_MAX_ATTEMPTS) {
            setBoardError(`Unable to move the project card. Retrying (${attempt}/${BOARD_RETRY_MAX_ATTEMPTS}). TraceId ${requestTraceId}`);
            await sleep(Math.min(calculateBoardRetryDelayMs(attempt), 5000));
            continue;
          }
          presentBoardError(payload, "Unable to move the project card.");
          setItems(previousItems);
          await load(requestTraceId);
          return;
        }
        setBoardError(null);
        return;
      }
      await load(traceId);
    } catch {
      setItems(previousItems);
      await load(traceId);
    }
  }, [companyId, load, normalizedBoardModule, presentBoardError, requestBoardItems]);

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

        <PipelineAccentHeader activeKey="review" title="Project Delivery Flow" icon={ChecklistIcon} />

        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput
              miw={260}
              label="Search cards"
              placeholder="Title, assignee, notes..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />
            <Select
              label="Priority"
              miw={190}
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
              miw={200}
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
                {item.syncState === "saving" ? (
                  <Text size="xs" c="dimmed">
                    Syncing...
                  </Text>
                ) : item.syncState === "error" ? (
                  <Text size="xs" c="review">
                    {item.syncError || "Sync issue"}
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
            <Button loading={isSubmitting && !selected} onClick={() => void submitCard()}>
              {selected ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </PageShell>
  );
}
