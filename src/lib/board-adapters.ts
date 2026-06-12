import { PROJECT_BOARD_COLUMNS, type BoardColumn } from "./board-system";

export type BoardSurfaceKey =
  | "unitBoard"
  | "aiQueue"
  | "goals"
  | "topics"
  | "data"
  | "knowmore"
  | "review"
  | "tactical"
  | "sales";

export type BoardModuleKey =
  | "unit-board"
  | "pipeline"
  | "goals"
  | "topics"
  | "data"
  | "knowmore"
  | "review"
  | "tactical"
  | "sales";

export type BoardAdapterResolutionSource =
  | "surface"
  | "module"
  | "boardKey"
  | "entityType"
  | "legacy-default"
  | "fallback";

export type BoardAdapterReasonCode =
  | "board-adapter-resolved"
  | "board-adapter-legacy-default"
  | "board-adapter-module-fallback"
  | "board-adapter-unsupported-combination";

export type BoardAdapterConfig = {
  surface: BoardSurfaceKey;
  module: BoardModuleKey;
  boardKey: string;
  entityType: string;
  sourceProfile: "NONE" | "COMPARE" | "ANY";
  targetProfile: "NONE" | "COMPARE" | "ANY";
  allowWrite: boolean;
  columns: BoardColumn[];
  aliases: string[];
  statusMap: Record<string, string>;
};

export type BoardAdapterDiagnostics = {
  reasonCode: BoardAdapterReasonCode;
  retryable: boolean;
  recovered: boolean;
  warnings: string[];
  requested: {
    surface?: string;
    module?: string;
    boardKey?: string;
    entityType?: string;
  };
};

export type ResolvedBoardAdapter = {
  surface: BoardSurfaceKey;
  module: BoardModuleKey;
  config: BoardAdapterConfig;
  boardKey: string;
  columns: BoardColumn[];
  allowWrite: boolean;
  resolvedBy: BoardAdapterResolutionSource;
  diagnostics: BoardAdapterDiagnostics;
};

export type BoardAdapterTelemetryPayload = {
  event: "BOARD_ADAPTER_RESOLUTION";
  unitId?: string;
  companyId?: string;
  surface: BoardSurfaceKey;
  module: BoardModuleKey;
  boardKey: string;
  sourceProfile: BoardAdapterConfig["sourceProfile"];
  targetProfile: BoardAdapterConfig["targetProfile"];
  capabilitiesVersion?: string;
  reasonCode: BoardAdapterReasonCode;
  retryable: boolean;
  recovered: boolean;
  warnings: string[];
};

export type AdaptedBoardCardProjection = {
  id: string;
  title: string;
  description: string;
  priority: string;
  columnKey: string;
  metadata: Record<string, unknown>;
};

type BoardAdapterInput = URLSearchParams | Record<string, unknown> | null | undefined;

const DEFAULT_STATUS_MAP: Record<string, string> = {
  backlog: "BACKLOG",
  todo: "TODO",
  queued: "TODO",
  ready: "TODO",
  active: "IN_PROGRESS",
  running: "IN_PROGRESS",
  processing: "IN_PROGRESS",
  in_progress: "IN_PROGRESS",
  "in-progress": "IN_PROGRESS",
  blocked: "BLOCKED",
  failed: "BLOCKED",
  retrying: "BLOCKED",
  done: "DONE",
  complete: "DONE",
  completed: "DONE",
  published: "DONE",
};

const UNIT_BOARD_CONFIG: BoardAdapterConfig = {
  surface: "unitBoard",
  module: "unit-board",
  boardKey: "UNIT_PROJECT",
  entityType: "BOARD_CARD",
  sourceProfile: "ANY",
  targetProfile: "ANY",
  allowWrite: true,
  columns: PROJECT_BOARD_COLUMNS,
  aliases: ["unitBoard", "unit-board", "unit_board", "UNIT_PROJECT"],
  statusMap: DEFAULT_STATUS_MAP,
};

const BOARD_ADAPTERS: BoardAdapterConfig[] = [
  UNIT_BOARD_CONFIG,
  {
    surface: "aiQueue",
    module: "pipeline",
    boardKey: "PIPELINE_QUEUE",
    entityType: "PIPELINE_JOB",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["aiQueue", "ai-queue", "pipeline", "PIPELINE_QUEUE", "PIPELINE_JOB"],
    statusMap: DEFAULT_STATUS_MAP,
  },
  {
    surface: "goals",
    module: "goals",
    boardKey: "GOALS",
    entityType: "GOALCARD",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["goals", "GOALS", "GOALCARD"],
    statusMap: DEFAULT_STATUS_MAP,
  },
  {
    surface: "topics",
    module: "topics",
    boardKey: "TOPICS",
    entityType: "TOPIC",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["topics", "TOPICS", "TOPIC"],
    statusMap: DEFAULT_STATUS_MAP,
  },
  {
    surface: "data",
    module: "data",
    boardKey: "DATA_SOURCES",
    entityType: "SOURCE",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["data", "sources", "DATA_SOURCES", "SOURCE"],
    statusMap: DEFAULT_STATUS_MAP,
  },
  {
    surface: "knowmore",
    module: "knowmore",
    boardKey: "KNOWMORE",
    entityType: "KNOWMORE_PACKET",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["knowmore", "know-more", "KNOWMORE", "KNOWMORE_PACKET"],
    statusMap: DEFAULT_STATUS_MAP,
  },
  {
    surface: "review",
    module: "review",
    boardKey: "REVIEW",
    entityType: "REVIEW_ITEM",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["review", "REVIEW", "REVIEW_ITEM"],
    statusMap: DEFAULT_STATUS_MAP,
  },
  {
    surface: "tactical",
    module: "tactical",
    boardKey: "TACTICAL",
    entityType: "TACTICAL_TASK",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["tactical", "TACTICAL", "TACTICAL_TASK"],
    statusMap: DEFAULT_STATUS_MAP,
  },
  {
    surface: "sales",
    module: "sales",
    boardKey: "SALES",
    entityType: "OPPORTUNITYCARD",
    sourceProfile: "ANY",
    targetProfile: "ANY",
    allowWrite: false,
    columns: PROJECT_BOARD_COLUMNS,
    aliases: ["sales", "SALES", "OPPORTUNITYCARD"],
    statusMap: DEFAULT_STATUS_MAP,
  },
];

function readInput(input: BoardAdapterInput, key: string): string | undefined {
  if (!input) return undefined;
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeLookup(value: string | undefined): string | null {
  return value ? value.trim().toLowerCase() : null;
}

function buildDiagnostics(
  input: BoardAdapterInput,
  reasonCode: BoardAdapterReasonCode,
  warnings: string[] = [],
): BoardAdapterDiagnostics {
  return {
    reasonCode,
    retryable: reasonCode === "board-adapter-module-fallback",
    recovered: reasonCode === "board-adapter-module-fallback" || reasonCode === "board-adapter-legacy-default",
    warnings,
    requested: {
      surface: readInput(input, "surface"),
      module: readInput(input, "module"),
      boardKey: readInput(input, "boardKey"),
      entityType: readInput(input, "entityType"),
    },
  };
}

function resolveByAlias(value: string | undefined): BoardAdapterConfig | null {
  const lookup = normalizeLookup(value);
  if (!lookup) return null;
  return BOARD_ADAPTERS.find((adapter) => adapter.aliases.some((alias) => alias.toLowerCase() === lookup)) ?? null;
}

function resolveByField<K extends keyof Pick<BoardAdapterConfig, "surface" | "module" | "boardKey" | "entityType">>(
  field: K,
  value: string | undefined,
): BoardAdapterConfig | null {
  const lookup = normalizeLookup(value);
  if (!lookup) return null;
  return BOARD_ADAPTERS.find((adapter) => String(adapter[field]).toLowerCase() === lookup) ?? null;
}

function toResolvedBoardAdapter(
  config: BoardAdapterConfig,
  input: BoardAdapterInput,
  resolvedBy: BoardAdapterResolutionSource,
  diagnostics: BoardAdapterDiagnostics,
): ResolvedBoardAdapter {
  return {
    surface: config.surface,
    module: config.module,
    config,
    boardKey: config.boardKey,
    columns: config.columns,
    allowWrite: config.allowWrite,
    resolvedBy,
    diagnostics,
  };
}

export function listBoardAdapters(): BoardAdapterConfig[] {
  return BOARD_ADAPTERS.map((adapter) => ({ ...adapter, columns: [...adapter.columns], aliases: [...adapter.aliases] }));
}

export function resolveBoardAdapter(input: BoardAdapterInput = null): ResolvedBoardAdapter {
  const explicitSurface = readInput(input, "surface");
  const explicitModule = readInput(input, "module");
  const explicitBoardKey = readInput(input, "boardKey");
  const explicitEntityType = readInput(input, "entityType");

  const bySurface = resolveByField("surface", explicitSurface) ?? resolveByAlias(explicitSurface);
  if (bySurface) {
    return toResolvedBoardAdapter(bySurface, input, "surface", buildDiagnostics(input, "board-adapter-resolved"));
  }

  const byModule = resolveByField("module", explicitModule) ?? resolveByAlias(explicitModule);
  if (byModule) {
    return toResolvedBoardAdapter(byModule, input, "module", buildDiagnostics(input, "board-adapter-resolved"));
  }

  const byBoardKey = resolveByField("boardKey", explicitBoardKey) ?? resolveByAlias(explicitBoardKey);
  if (byBoardKey) {
    return toResolvedBoardAdapter(byBoardKey, input, "boardKey", buildDiagnostics(input, "board-adapter-resolved"));
  }

  const byEntityType = resolveByField("entityType", explicitEntityType) ?? resolveByAlias(explicitEntityType);
  if (byEntityType) {
    return toResolvedBoardAdapter(byEntityType, input, "entityType", buildDiagnostics(input, "board-adapter-resolved"));
  }

  if (explicitSurface || explicitModule || explicitBoardKey || explicitEntityType) {
    const fallbackConfig: BoardAdapterConfig = {
      ...UNIT_BOARD_CONFIG,
      allowWrite: false,
    };
    return toResolvedBoardAdapter(
      fallbackConfig,
      input,
      "fallback",
      buildDiagnostics(input, "board-adapter-module-fallback", [
        "Unsupported board adapter combination resolved to read-only unit board fallback.",
      ]),
    );
  }

  return toResolvedBoardAdapter(
    UNIT_BOARD_CONFIG,
    input,
    "legacy-default",
    buildDiagnostics(input, "board-adapter-legacy-default", [
      "No board adapter selector was provided; legacy unit-board default was used.",
    ]),
  );
}

export function resolveBoardAdapterDiagnostics(input: BoardAdapterInput = null): BoardAdapterDiagnostics {
  return resolveBoardAdapter(input).diagnostics;
}

export function normalizeBoardTargetForModule(module: string, rawStatus: string | null | undefined): string {
  const adapter = resolveBoardAdapter({ module });
  const status = normalizeLookup(rawStatus ?? undefined);
  if (!status) {
    return adapter.columns[0]?.key ?? "BACKLOG";
  }
  return adapter.config.statusMap[status] ?? adapter.columns[0]?.key ?? "BACKLOG";
}

export function adaptDomainRowToBoardCard(
  module: string,
  row: Record<string, unknown>,
): AdaptedBoardCardProjection {
  const id = typeof row.id === "string" ? row.id : `${module}:${String(row.slug ?? row.name ?? "unknown")}`;
  const title = typeof row.title === "string"
    ? row.title
    : typeof row.name === "string"
      ? row.name
      : id;
  const description = typeof row.description === "string"
    ? row.description
    : typeof row.summary === "string"
      ? row.summary
      : "";
  const priority = typeof row.priority === "string" ? row.priority : "normal";
  const status = typeof row.status === "string" ? row.status : typeof row.state === "string" ? row.state : null;

  return {
    id,
    title,
    description,
    priority,
    columnKey: normalizeBoardTargetForModule(module, status),
    metadata: {
      module,
      sourceStatus: status,
      sourceEntityType: resolveBoardAdapter({ module }).config.entityType,
      sourceRow: row,
    },
  };
}

export function buildBoardAdapterTelemetry(
  adapter: ResolvedBoardAdapter,
  context: {
    unitId?: string;
    companyId?: string;
    capabilitiesVersion?: string;
  } = {},
): BoardAdapterTelemetryPayload {
  return {
    event: "BOARD_ADAPTER_RESOLUTION",
    unitId: context.unitId,
    companyId: context.companyId,
    surface: adapter.surface,
    module: adapter.module,
    boardKey: adapter.boardKey,
    sourceProfile: adapter.config.sourceProfile,
    targetProfile: adapter.config.targetProfile,
    capabilitiesVersion: context.capabilitiesVersion,
    reasonCode: adapter.diagnostics.reasonCode,
    retryable: adapter.diagnostics.retryable,
    recovered: adapter.diagnostics.recovered,
    warnings: adapter.diagnostics.warnings,
  };
}
