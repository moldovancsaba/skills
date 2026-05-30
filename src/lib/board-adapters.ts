import type { BoardColumn } from "@/lib/board-system";
import { PROJECT_BOARD_COLUMNS } from "@/lib/board-system";
import { SURFACE_BOARD_CONFIG, type SurfaceBoardConfig } from "@/lib/board-state";

export type BoardSurfaceKey = keyof typeof SURFACE_BOARD_CONFIG;

export type ResolvedBoardAdapter = {
  surface: BoardSurfaceKey;
  config: SurfaceBoardConfig;
  boardKey: string;
  columns: BoardColumn[];
  allowWrite: boolean;
};

const SURFACE_COLUMN_MAP: Record<BoardSurfaceKey, BoardColumn[]> = {
  unitBoard: PROJECT_BOARD_COLUMNS,
  goals: PROJECT_BOARD_COLUMNS,
  topics: PROJECT_BOARD_COLUMNS,
  data: PROJECT_BOARD_COLUMNS,
  pipeline: PROJECT_BOARD_COLUMNS,
};

const BOARD_KEY_TO_SURFACE: Record<string, BoardSurfaceKey> = {
  UNIT_PROJECT: "unitBoard",
  GOALS_STATUS: "goals",
  TOPICS_STATUS: "topics",
  DATA_STATUS: "data",
  PIPELINE_STATUS: "pipeline",
};

const SURFACE_BY_MODULE: Record<string, BoardSurfaceKey> = {
  unitboard: "unitBoard",
  "unit-board": "unitBoard",
  unit: "unitBoard",
  goals: "goals",
  topics: "topics",
  data: "data",
  pipeline: "pipeline",
  "project-board": "unitBoard",
  "unit-project": "unitBoard",
};

const SURFACE_ALIASES = {
  ...SURFACE_BY_MODULE,
  ...Object.fromEntries(
    Object.entries(BOARD_KEY_TO_SURFACE).map(([key, surface]) => [key.toLowerCase(), surface]),
  ),
} satisfies Record<string, BoardSurfaceKey>;

function normalizeBoardSurfaceToken(value?: unknown): BoardSurfaceKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) return null;
  return SURFACE_ALIASES[normalized] ?? null;
}

function getDefaultReadWriteSupport(surface: BoardSurfaceKey) {
  if (surface === "unitBoard") return true;
  return false;
}

export function resolveBoardAdapter(input: { boardKey?: string | null; module?: string | null }): ResolvedBoardAdapter {
  const moduleSurface = normalizeBoardSurfaceToken(input.module);
  if (moduleSurface) {
    return {
      surface: moduleSurface,
      config: SURFACE_BOARD_CONFIG[moduleSurface],
      boardKey: SURFACE_BOARD_CONFIG[moduleSurface].boardKey,
      columns: SURFACE_COLUMN_MAP[moduleSurface],
      allowWrite: getDefaultReadWriteSupport(moduleSurface),
    } satisfies ResolvedBoardAdapter;
  }

  const boardKey = typeof input.boardKey === "string" ? input.boardKey.trim().toUpperCase() : null;
  const byBoardKey = boardKey ? BOARD_KEY_TO_SURFACE[boardKey] : null;
  if (byBoardKey) {
    return {
      surface: byBoardKey,
      config: SURFACE_BOARD_CONFIG[byBoardKey],
      boardKey: SURFACE_BOARD_CONFIG[byBoardKey].boardKey,
      columns: SURFACE_COLUMN_MAP[byBoardKey],
      allowWrite: getDefaultReadWriteSupport(byBoardKey),
    } satisfies ResolvedBoardAdapter;
  }

  // Backward-compatible default for existing unit board clients.
  return {
    surface: "unitBoard",
    config: SURFACE_BOARD_CONFIG.unitBoard,
    boardKey: SURFACE_BOARD_CONFIG.unitBoard.boardKey,
    columns: SURFACE_COLUMN_MAP.unitBoard,
    allowWrite: true,
  };
}
