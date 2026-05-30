export const UNIT_MODULE_KEYS = [
  "content",
  "data",
  "checklist",
  "analytics",
  "goals",
  "knowmore",
  "pipeline",
  "review",
  "sales",
  "tactical",
  "topics",
  "unit-board",
  "webapp",
] as const;

export type UnitModuleKey = (typeof UNIT_MODULE_KEYS)[number];

export type UnitWebappProfile = "NONE" | "CLASSSCOUT" | "COMPARE";

export type RawWorkerUnitCapabilities = {
  webappProfile?: string;
  modules?: Partial<Record<UnitModuleKey, boolean>>;
};

export type UnitModuleDefinition = {
  key: UnitModuleKey;
  label: string;
  description: string;
  route?: string;
  enabledByDefault: boolean;
  availableByDefault?: boolean;
};

export type ResolvedUnitCapabilityConfig = {
  profile: UnitWebappProfile;
  modules: Record<UnitModuleKey, boolean>;
  source: "auto" | "custom";
};

export const UNIT_MODULE_DEFINITIONS: UnitModuleDefinition[] = [
  { key: "webapp", label: "Webapp", description: "Optional dedicated webapp profile", route: undefined, enabledByDefault: true },
  { key: "content", label: "Content", description: "Content lifecycle and curation", enabledByDefault: false, route: undefined },
  { key: "data", label: "Data", description: "Raw source data and uploads", enabledByDefault: true, route: "data" },
  { key: "checklist", label: "Checklist", description: "AI-supported task list execution", enabledByDefault: true, route: "checklist" },
  { key: "analytics", label: "Analytics", description: "Health and score telemetry", enabledByDefault: true, route: "analytics" },
  { key: "goals", label: "Goals", description: "Goal cards and planning context", enabledByDefault: true, route: "goals" },
  { key: "knowmore", label: "Knowmore", description: "Knowledge mining and discovery", enabledByDefault: true, route: "knowmore" },
  { key: "pipeline", label: "AI Queue", description: "Global and unit pipeline control", enabledByDefault: true, route: "pipeline" },
  { key: "review", label: "Review", description: "Review queue and quality controls", enabledByDefault: true, route: "review" },
  { key: "sales", label: "Sales", description: "Lead acquisition and opportunity workflows", enabledByDefault: true, route: "sales" },
  { key: "tactical", label: "Tactical", description: "Execution and tactical follow-ups", enabledByDefault: true, route: "tactical" },
  { key: "topics", label: "Topics", description: "Topic intelligence surface", enabledByDefault: true, route: "topics" },
  { key: "unit-board", label: "Project Board", description: "Shared execution card board", enabledByDefault: true, route: "unit-board" },
];

const BASE_DEFAULT_MODULES: Record<UnitModuleKey, boolean> = {
  webapp: true,
  content: false,
  data: true,
  checklist: true,
  analytics: true,
  goals: true,
  knowmore: true,
  pipeline: true,
  review: true,
  sales: true,
  tactical: true,
  topics: true,
  "unit-board": true,
};

const MODULE_PRESET_BY_WEBAPP: Record<UnitWebappProfile, Partial<Record<UnitModuleKey, boolean>>> = {
  NONE: BASE_DEFAULT_MODULES,
  CLASSSCOUT: {
    ...BASE_DEFAULT_MODULES,
    content: true,
    goals: true,
    sales: true,
    review: true,
    topics: true,
    tactical: true,
    "unit-board": true,
  },
  COMPARE: {
    ...BASE_DEFAULT_MODULES,
    goals: false,
    review: false,
    topics: false,
    tactical: false,
    "unit-board": false,
    content: true,
    sales: false,
  },
};

const ROUTER_DEFAULT_WEBAPP_PROFILE: UnitWebappProfile = "NONE";

function normalizeRawProfile(raw: unknown): UnitWebappProfile {
  if (raw === "CLASSSCOUT") return "CLASSSCOUT";
  if (raw === "COMPARE") return "COMPARE";
  if (raw === "NONE") return "NONE";
  return ROUTER_DEFAULT_WEBAPP_PROFILE;
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function normalizeModuleOverrides(raw: unknown): Partial<Record<UnitModuleKey, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const normalized: Partial<Record<UnitModuleKey, boolean>> = {};
  UNIT_MODULE_KEYS.forEach((key) => {
    const value = coerceBoolean((raw as Record<string, unknown>)[key]);
    if (value !== null) {
      normalized[key] = value;
    }
  });
  return normalized;
}

function buildMergedModules(profile: UnitWebappProfile, rawModules: Partial<Record<UnitModuleKey, boolean>>) {
  const preset = MODULE_PRESET_BY_WEBAPP[profile] as Record<UnitModuleKey, boolean>;
  return UNIT_MODULE_KEYS.reduce<Record<UnitModuleKey, boolean>>((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(rawModules, key)) {
      acc[key] = Boolean(rawModules[key]);
    } else {
      acc[key] = preset[key];
    }
    return acc;
  }, {} as Record<UnitModuleKey, boolean>);
}

export function resolveUnitCapabilities(input: {
  workerConfig?: unknown;
  hasClassScoutDestination: boolean;
  hasCompareDestination: boolean;
}) {
  const resolvedAutoProfile: UnitWebappProfile = input.hasCompareDestination
    ? "COMPARE"
    : input.hasClassScoutDestination
      ? "CLASSSCOUT"
      : "NONE";

  const workerModules =
    (typeof input.workerConfig === "object" && input.workerConfig !== null
      ? (input.workerConfig as { unitCapabilities?: RawWorkerUnitCapabilities }).unitCapabilities
      : undefined) as RawWorkerUnitCapabilities | undefined;

  if (!workerModules) {
    return {
      profile: resolvedAutoProfile,
      modules: buildMergedModules(resolvedAutoProfile, {}),
      source: "auto",
    } as ResolvedUnitCapabilityConfig;
  }

  const profile = normalizeRawProfile(workerModules.webappProfile);
  const resolvedProfile = profile || resolvedAutoProfile;
  const normalizedModules = normalizeModuleOverrides(workerModules.modules);
  const hasAnyOverride = Object.keys(normalizedModules).length > 0;

  return {
    profile: resolvedProfile,
    modules: buildMergedModules(resolvedProfile, hasAnyOverride ? normalizedModules : {}),
    source: hasAnyOverride ? "custom" : "auto",
  } as ResolvedUnitCapabilityConfig;
}

export function normalizeUnitCapabilitiesPayload(raw: unknown): {
  profile: UnitWebappProfile;
  modules: Record<UnitModuleKey, boolean>;
} {
  if (!raw || typeof raw !== "object") {
    return {
      profile: ROUTER_DEFAULT_WEBAPP_PROFILE,
      modules: BASE_DEFAULT_MODULES,
    };
  }
  const payload = raw as RawWorkerUnitCapabilities;
  const profile = normalizeRawProfile(payload.webappProfile);
  const modules = buildMergedModules(profile, normalizeModuleOverrides(payload.modules));
  return { profile, modules };
}

export function formatCapabilityPayload(input: {
  profile: UnitWebappProfile;
  modules: Partial<Record<UnitModuleKey, boolean>>;
}) {
  return {
    profile: input.profile,
    modules: {
      ...normalizeModuleOverrides(input.modules),
    },
  };
}

export function getWebappProfileLabel(profile: UnitWebappProfile) {
  return profile === "CLASSSCOUT" ? "ClassScout" : profile === "COMPARE" ? "Compare" : "No Webapp";
}

export function getWebappRoute(profile: UnitWebappProfile) {
  return profile === "CLASSSCOUT" ? "classscout" : profile === "COMPARE" ? "compare" : null;
}

export const UNIT_WEBAPP_PROFILE_DESCRIPTIONS: Record<UnitWebappProfile, string> = {
  NONE: "No dedicated webapp surface; this unit uses the general dashboard and shared modules.",
  CLASSSCOUT: "ClassScout operator surface with review, goals, and active workflow context.",
  COMPARE: "Compare surface focused on competitive comparison and signal analysis.",
};
