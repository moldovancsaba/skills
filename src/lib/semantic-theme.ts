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

export type SemanticColor =
  | ModuleTone
  | "gray";

type ModuleDefinition = {
  color: string;
  surface: string;
  hoverSurface: string;
  glow: string;
  border: string;
  rgb: string;
};

const warnedSemanticValues = new Set<string>();

function buildModuleDefinition(tone: ModuleTone): ModuleDefinition {
  return {
    color: `var(--module-${tone}-color)`,
    surface: `var(--module-${tone}-surface)`,
    hoverSurface: `var(--module-${tone}-hover-surface)`,
    glow: `var(--module-${tone}-glow)`,
    border: `var(--module-${tone}-border)`,
    rgb: `var(--module-${tone}-rgb)`,
  };
}

export function getModuleTheme(tone: ModuleTone = "neutral") {
  return buildModuleDefinition(tone);
}

export function resolveModuleTone(color?: SemanticColor | string): ModuleTone {
  switch (color) {
    case "ingress":
      return "ingress";
    case "synthesis":
      return "synthesis";
    case "knowmore":
      return "knowmore";
    case "strategy":
      return "strategy";
    case "checklist":
      return "checklist";
    case "tactical":
      return "tactical";
    case "review":
      return "review";
    case "gray":
      return "neutral";
    default:
      if (typeof color === "string" && color.trim() && !warnedSemanticValues.has(color)) {
        warnedSemanticValues.add(color);
        console.warn(`[semantic-theme] Unknown semantic color "${color}" received. Falling back to neutral.`);
      }
      return "neutral";
  }
}

export function toneToMantineColor(tone: ModuleTone): ModuleTone | "gray" {
  return tone === "neutral" ? "gray" : tone;
}

export function resolveMantineColor(color?: SemanticColor | string): ModuleTone | "gray" {
  return toneToMantineColor(resolveModuleTone(color));
}

export function getModuleCssVars(tone: ModuleTone = "neutral"): CSSProperties {
  const toneTheme = getModuleTheme(tone);
  return {
    ["--module-color" as string]: toneTheme.color,
    ["--module-surface" as string]: toneTheme.surface,
    ["--module-hover-surface" as string]: toneTheme.hoverSurface,
    ["--module-glow" as string]: toneTheme.glow,
    ["--module-border" as string]: toneTheme.border,
    ["--module-rgb" as string]: toneTheme.rgb,
  };
}

export function getSemanticSurfaceStyle(
  tone: ModuleTone = "neutral",
  {
    elevated = true,
  }: { interactive?: boolean; elevated?: boolean } = {},
): CSSProperties {
  const toneTheme = getModuleTheme(tone);

  return {
    ...getModuleCssVars(tone),
    background: `linear-gradient(180deg, var(--surface-gradient-top), var(--surface-gradient-bottom)), ${toneTheme.surface}`,
    border: `1px solid ${toneTheme.border}`,
    boxShadow: elevated ? "var(--surface-shadow-elevated)" : "var(--surface-shadow-flat)",
  };
}

export function getSemanticHoverStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const toneTheme = getModuleTheme(tone);

  return {
    background: `linear-gradient(180deg, var(--surface-hover-top), var(--surface-hover-bottom)), ${toneTheme.hoverSurface}`,
    boxShadow: `0 0 0 1px rgba(${toneTheme.rgb},0.24), 0 10px 24px ${toneTheme.glow}`,
  };
}

export function getSemanticInsetStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const toneTheme = getModuleTheme(tone);

  return {
    ...getModuleCssVars(tone),
    background: `linear-gradient(180deg, var(--surface-hover-top), var(--surface-hover-bottom)), ${toneTheme.hoverSurface}`,
    border: "1px solid var(--surface-section-border)",
    boxShadow: "var(--surface-shadow-flat)",
  };
}

export function getSemanticCalloutStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const toneTheme = getModuleTheme(tone);

  return {
    ...getSemanticInsetStyle(tone),
    borderLeft: `4px solid rgb(${toneTheme.rgb})`,
  };
}

export function getSemanticClusterStyle(tone: ModuleTone = "neutral"): CSSProperties {
  return {
    borderRadius: "var(--mantine-radius-md)",
    ...getSemanticInsetStyle(tone),
  };
}

export function getSemanticDropzoneStyle(
  tone: ModuleTone = "neutral",
  active = false,
): CSSProperties {
  const toneTheme = getModuleTheme(tone);
  return {
    border: active ? `2px dashed rgba(${toneTheme.rgb},0.45)` : "2px dashed transparent",
    background: active ? `rgba(${toneTheme.rgb},0.08)` : "transparent",
  };
}

export function getSemanticIndicatorStyle(
  tone: ModuleTone = "neutral",
  {
    active = true,
    shape = "line",
    opacity = 1,
  }: {
    active?: boolean;
    shape?: "line" | "dot" | "bar";
    opacity?: number;
  } = {},
): CSSProperties {
  const toneTheme = getModuleTheme(tone);
  const neutralTheme = getModuleTheme("neutral");
  const background = active ? toneTheme.color : neutralTheme.border;

  if (shape === "dot") {
    return {
      borderRadius: "50%",
      backgroundColor: background,
      opacity,
    };
  }

  if (shape === "bar") {
    return {
      backgroundColor: background,
      opacity,
      borderRadius: "2px 2px 0 0",
    };
  }

  return {
    borderRadius: "var(--mantine-radius-xs)",
    backgroundColor: background,
    opacity,
  };
}

export function getSemanticBulletStyle(tone: ModuleTone = "neutral"): CSSProperties {
  return {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: getModuleTheme(tone).color,
  };
}

export function getSemanticDividerStyle(
  tone: ModuleTone = "neutral",
  { width = 1, opacity = 1 }: { width?: number; opacity?: number } = {},
): CSSProperties {
  return {
    backgroundColor: getModuleTheme(tone).border,
    opacity,
    width,
  };
}

export function getSemanticOverlayShadowStyle(tone: ModuleTone = "neutral"): CSSProperties {
  return {
    boxShadow: `var(--surface-shadow-elevated), 0 0 0 1px ${getModuleTheme(tone).border}`,
  };
}

export function getSemanticAccentBandStyle(tone: ModuleTone = "neutral"): CSSProperties {
  return {
    borderTop: `4px solid ${getModuleTheme(tone).color}`,
  };
}

export function getSidebarActiveStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const toneTheme = getModuleTheme(tone);
  return {
    background: `linear-gradient(90deg, rgba(${toneTheme.rgb},0.22), rgba(${toneTheme.rgb},0.06))`,
    borderLeft: `2px solid rgb(${toneTheme.rgb})`,
  };
}

export function getSidebarHoverStyle(tone: ModuleTone = "neutral"): CSSProperties {
  const toneTheme = getModuleTheme(tone);
  return {
    background: `linear-gradient(90deg, rgba(${toneTheme.rgb},0.12), rgba(${toneTheme.rgb},0.03))`,
  };
}

export function getSidebarShellStyle(): CSSProperties {
  return {
    borderRight: "1px solid var(--border-primary)",
    backgroundColor: "var(--sidebar-bg)",
  };
}
