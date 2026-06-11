import type { PrismaClient } from "@prisma/client";
import { PROJECT_BOARD_COLUMNS, sortBoardRecords } from "@/lib/board-system";
import { checksumSurfacePayload, type SurfaceReadModel, type SurfaceReadModelAction } from "@/lib/surface-projections";

export const UNIT_BOARD_PROJECT_SURFACE_KEY = "unitBoard.project";
export const UNIT_BOARD_PROJECT_CONTRACT_VERSION = 1;
export const UNIT_BOARD_PROJECT_BOARD_KEY = "UNIT_PROJECT";
export const UNIT_BOARD_PROJECT_ENTITY_TYPE = "BOARD_CARD";

export type UnitBoardProjectionAction = "create" | "update" | "move" | "archive" | "restore" | "refreshProjection";

export type UnitBoardProjectionItem = {
  id: string;
  title: string;
  description: string | null;
  columnKey: string;
  orderRank: number;
  priority: number;
  badges: Array<{ key: string; label: string; tone: string }>;
  accessibleLabel: string;
  allowedActions: SurfaceReadModelAction<UnitBoardProjectionAction>[];
  metadata: {
    assignee: string | null;
    dueDate: string | null;
    estimatedEffort: number | null;
    sourceType: string | null;
    sourceId: string | null;
    notes: string | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
  };
};

type BoardCardMetadata = {
  assignee?: unknown;
  dueDate?: unknown;
  estimatedEffort?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  notes?: unknown;
};

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeMetadata(value: unknown): Required<BoardCardMetadata> {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as BoardCardMetadata : {};
  return {
    assignee: normalizeString(record.assignee),
    dueDate: normalizeString(record.dueDate),
    estimatedEffort: normalizeNumber(record.estimatedEffort),
    sourceType: normalizeString(record.sourceType),
    sourceId: normalizeString(record.sourceId),
    notes: normalizeString(record.notes),
  };
}

function buildItemActions(item: { id: string; title: string }): SurfaceReadModelAction<UnitBoardProjectionAction>[] {
  return [
    { key: "update", label: "Update", enabled: true },
    { key: "move", label: "Move", enabled: true },
    {
      key: "archive",
      label: "Archive",
      enabled: true,
      confirm: {
        title: "Archive project card",
        body: `Archive "${item.title}" from the Unit Project Board.`,
        destructive: true,
      },
    },
  ];
}

function buildAccessibleLabel(item: {
  title: string;
  columnLabel: string;
  priority: number;
  assignee: string | null;
}) {
  const owner = item.assignee ? `Assigned to ${item.assignee}.` : "Unassigned.";
  return `${item.title}. ${item.columnLabel}. Priority ${item.priority}. ${owner}`;
}

export async function buildUnitBoardProjectReadModel(
  prisma: PrismaClient,
  companyId: string,
): Promise<SurfaceReadModel<UnitBoardProjectionItem, UnitBoardProjectionAction>> {
  const generatedAt = new Date().toISOString();
  const [cards, states] = await Promise.all([
    prisma.boardCard.findMany({
      where: { companyId, boardKey: UNIT_BOARD_PROJECT_BOARD_KEY, archivedAt: null },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.boardItemState.findMany({
      where: { companyId, boardKey: UNIT_BOARD_PROJECT_BOARD_KEY, entityType: UNIT_BOARD_PROJECT_ENTITY_TYPE },
      orderBy: { orderRank: "asc" },
    }),
  ]);

  const cardIdSet = new Set(cards.map((card) => card.id));
  const stateMap = new Map(
    states
      .filter((state) => cardIdSet.has(state.entityId))
      .map((state) => [state.entityId, state]),
  );
  const columnLabelByKey = new Map(PROJECT_BOARD_COLUMNS.map((column) => [column.key, column.label]));

  const items = sortBoardRecords(cards.map((card, index) => {
    const state = stateMap.get(card.id);
    const metadata = normalizeMetadata(state?.metadata ?? null);
    const columnKey = state?.columnKey ?? PROJECT_BOARD_COLUMNS[0].key;
    const priority = Number(state?.priority ?? 0);
    const sourceType = metadata.sourceType as string | null;
    const assignee = metadata.assignee as string | null;
    const item = {
      id: card.id,
      title: card.title,
      description: card.description,
      columnKey,
      orderRank: Number(state?.orderRank ?? (index + 1) * 1024),
      priority,
      badges: [
        { key: "priority", label: `P${priority}`, tone: "review" },
        ...(sourceType ? [{ key: "sourceType", label: sourceType, tone: "neutral" }] : []),
        ...(assignee ? [{ key: "assignee", label: assignee, tone: "neutral" }] : []),
      ],
      accessibleLabel: buildAccessibleLabel({
        title: card.title,
        columnLabel: columnLabelByKey.get(columnKey) ?? columnKey,
        priority,
        assignee,
      }),
      allowedActions: buildItemActions({ id: card.id, title: card.title }),
      metadata: {
        assignee,
        dueDate: metadata.dueDate as string | null,
        estimatedEffort: metadata.estimatedEffort as number | null,
        sourceType,
        sourceId: metadata.sourceId as string | null,
        notes: metadata.notes as string | null,
        createdBy: card.createdBy,
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
      },
    } satisfies UnitBoardProjectionItem;
    return item;
  }));

  const filters = [
    { key: "priority:all", label: "All priorities", count: items.length, selected: true },
    ...[0, 1, 2, 3].map((priority) => ({
      key: `priority:${priority}`,
      label: `Priority ${priority}`,
      count: items.filter((item) => item.priority === priority).length,
    })),
    ...Array.from(new Set(items.map((item) => item.metadata.sourceType).filter((value): value is string => Boolean(value))))
      .sort()
      .map((sourceType) => ({
        key: `sourceType:${sourceType}`,
        label: sourceType,
        count: items.filter((item) => item.metadata.sourceType === sourceType).length,
      })),
  ];

  const payloadWithoutChecksum = {
    contractVersion: UNIT_BOARD_PROJECT_CONTRACT_VERSION,
    generatedAt,
    companyId,
    surface: UNIT_BOARD_PROJECT_SURFACE_KEY,
    freshness: { status: "FRESH" as const, generatedAt, ageMinutes: 0 },
    summary: {
      itemCount: items.length,
      columnCount: PROJECT_BOARD_COLUMNS.length,
      archivedIncluded: false,
      serverOrdered: true,
    },
    filters,
    columns: PROJECT_BOARD_COLUMNS.map((column) => ({
      key: column.key,
      label: column.label,
      count: items.filter((item) => item.columnKey === column.key).length,
      itemIds: items.filter((item) => item.columnKey === column.key).map((item) => item.id),
    })),
    items,
    actions: [
      { key: "create" as const, label: "Create", enabled: true },
      { key: "refreshProjection" as const, label: "Refresh projection", enabled: true },
    ],
    states: {
      loading: "Loading Unit Project Board projection.",
      empty: "No project cards are ready for this Unit Project Board.",
      stale: "Unit Project Board projection is stale and needs refresh.",
      blocked: "Projection revision conflict. Reload before applying the action.",
      error: "Unit Project Board projection failed.",
      success: "Unit Project Board projection action completed.",
    },
    observability: {
      sourceRunId: `unit-board-project:${companyId}:${generatedAt}`,
      inputWatermark: items[0]?.metadata.updatedAt ?? null,
      checksum: null,
      staleAt: null,
      lastError: null,
    },
  };

  const checksum = checksumSurfacePayload(payloadWithoutChecksum);
  return {
    ...payloadWithoutChecksum,
    observability: {
      ...payloadWithoutChecksum.observability,
      checksum,
    },
  };
}
