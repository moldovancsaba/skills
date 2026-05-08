import type { CSSProperties } from "react";

export type ModuleTone =
  | "ingress"
  | "synthesis"
  | "knowmore"
  | "strategy"
  | "checklist"
  | "tactical"
  | "review"
  | "neutral";

type ModuleDefinition = {
  color: string;
  surface: string;
  hoverSurface: string;
  glow: string;
  border: string;
  rgb: string;
};

export const MODULE_THEME: Record<ModuleTone, ModuleDefinition> = {
  ingress: {
    color: "#3B82F6",
    surface: "#10243F",
    hoverSurface: "#143154",
    glow: "rgba(59,130,246,0.18)",
    border: "rgba(59,130,246,0.22)",
    rgb: "59,130,246",
  },
  synthesis: {
    color: "#6366F1",
    surface: "#1A1D4A",
    hoverSurface: "#232864",
    glow: "rgba(99,102,241,0.18)",
    border: "rgba(99,102,241,0.22)",
    rgb: "99,102,241",
  },
  knowmore: {
    color: "#10B981",
    surface: "#0F2D27",
    hoverSurface: "#153D35",
    glow: "rgba(16,185,129,0.18)",
    border: "rgba(16,185,129,0.22)",
    rgb: "16,185,129",
  },
  strategy: {
    color: "#8B5CF6",
    surface: "#24163F",
    hoverSurface: "#312058",
    glow: "rgba(139,92,246,0.18)",
    border: "rgba(139,92,246,0.22)",
    rgb: "139,92,246",
  },
  checklist: {
    color: "#0EA5E9",
    surface: "#102838",
    hoverSurface: "#16384C",
    glow: "rgba(14,165,233,0.18)",
    border: "rgba(14,165,233,0.22)",
    rgb: "14,165,233",
  },
  tactical: {
    color: "#14B8A6",
    surface: "#102D2A",
    hoverSurface: "#17403C",
    glow: "rgba(20,184,166,0.18)",
    border: "rgba(20,184,166,0.22)",
    rgb: "20,184,166",
  },
  review: {
    color: "#F59E0B",
    surface: "#3B2A12",
    hoverSurface: "#513A18",
    glow: "rgba(245,158,11,0.18)",
    border: "rgba(245,158,11,0.22)",
    rgb: "245,158,11",
  },
  neutral: {
    color: "#9AA4B2",
    surface: "#161C24",
    hoverSurface: "#1B2430",
    glow: "rgba(154,164,178,0.12)",
    border: "rgba(154,164,178,0.18)",
    rgb: "154,164,178",
  },
};

export function getModuleTheme(tone: ModuleTone = "neutral") {
  return MODULE_THEME[tone];
}

export function getModuleCssVars(tone: ModuleTone = "neutral"): CSSProperties {
  const module = getModuleTheme(tone);
  return {
    ["--module-color" as string]: module.color,
    ["--module-surface" as string]: module.surface,
    ["--module-hover-surface" as string]: module.hoverSurface,
    ["--module-glow" as string]: module.glow,
    ["--module-border" as string]: module.border,
    ["--module-rgb" as string]: module.rgb,
  };
}

export function getSemanticSurfaceStyle(
  tone: ModuleTone = "neutral",
  {
    interactive = false,
    elevated = true,
  }: { interactive?: boolean; elevated?: boolean } = {},
): CSSProperties {
  const module = getModuleTheme(tone);

  return {
    ...getModuleCssVars(tone),
    background: `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)), ${module.surface}`,
    border: `1px solid ${module.border}`,
    boxShadow: elevated
      ? `0 4px 12px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255,255,255,0.03)`
      : `0 1px 0 rgba(255,255,255,0.03) inset`,
  };
}

export function getSemanticHoverStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const module = getModuleTheme(tone);

  return {
    background: `linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015)), ${module.hoverSurface}`,
    boxShadow: `0 0 0 1px rgba(${module.rgb},0.24), 0 10px 24px ${module.glow}`,
  };
}

export function getSidebarActiveStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const module = getModuleTheme(tone);
  return {
    background: `linear-gradient(90deg, rgba(${module.rgb},0.22), rgba(${module.rgb},0.06))`,
    borderLeft: `2px solid rgb(${module.rgb})`,
  };
}

export function getSidebarHoverStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const module = getModuleTheme(tone);
  return {
    background: `linear-gradient(90deg, rgba(${module.rgb},0.12), rgba(${module.rgb},0.03))`,
  };
}
