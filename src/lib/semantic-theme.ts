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
  | "brand"
  | "blue"
  | "indigo"
  | "teal"
  | "green"
  | "violet"
  | "purple"
  | "cyan"
  | "orange"
  | "amber"
  | "knowledge"
  | "execution";

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
    case "blue":
    case "brand":
      return "ingress";
    case "synthesis":
    case "indigo":
      return "synthesis";
    case "knowmore":
    case "teal":
    case "green":
    case "knowledge":
      return "knowmore";
    case "strategy":
    case "violet":
    case "purple":
      return "strategy";
    case "checklist":
    case "cyan":
    case "execution":
      return "checklist";
    case "tactical":
      return "tactical";
    case "review":
    case "orange":
    case "amber":
      return "review";
    case "gray":
    case "dark":
    case "red":
    case "yellow":
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
