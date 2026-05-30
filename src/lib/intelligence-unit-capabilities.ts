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

export type UnitCapabilityBlock = "CHECKLIST" | "SALES" | "CONTENT" | "PROJECT";

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
  block: UnitCapabilityBlock;
};

export type ResolvedUnitCapabilityConfig = {
  profile: UnitWebappProfile;
  modules: Record<UnitModuleKey, boolean>;
  source: "auto" | "custom";
};

const LEGACY_MODULE_KEY_BY_ALIAS: Partial<Record<string, UnitModuleKey>> = {
  unitBoard: "unit-board",
};

export const UNIT_MODULE_DEFINITIONS: UnitModuleDefinition[] = [
  {
    key: "webapp",
    label: "Webapp",
    description: "Optional dedicated webapp profile",
    route: undefined,
    enabledByDefault: true,
    block: "CHECKLIST",
  },
  {
    key: "content",
    label: "Content",
    description: "Content lifecycle and curation",
    enabledByDefault: false,
    route: undefined,
    block: "CONTENT",
  },
  {
    key: "data",
    label: "Data",
    description: "Raw source data and uploads",
    enabledByDefault: true,
    route: "data",
    block: "CHECKLIST",
  },
  {
    key: "checklist",
    label: "Checklist",
    description: "AI-supported task list execution",
    enabledByDefault: true,
    route: "checklist",
    block: "CHECKLIST",
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Health and score telemetry",
    enabledByDefault: true,
    route: "analytics",
    block: "CHECKLIST",
  },
  {
    key: "goals",
    label: "Goals",
    description: "Goal cards and planning context",
    enabledByDefault: true,
    route: "goals",
    block: "CHECKLIST",
  },
  {
    key: "knowmore",
    label: "Knowmore",
    description: "Knowledge mining and discovery",
    enabledByDefault: true,
    route: "knowmore",
    block: "CHECKLIST",
  },
  {
    key: "pipeline",
    label: "AI Queue",
    description: "Global and unit pipeline control",
    enabledByDefault: true,
    route: "pipeline",
    block: "CHECKLIST",
  },
  {
    key: "review",
    label: "Review",
    description: "Review queue and quality controls",
    enabledByDefault: true,
    route: "review",
    block: "SALES",
  },
  {
    key: "sales",
    label: "Sales",
    description: "Lead acquisition and opportunity workflows",
    enabledByDefault: true,
    route: "sales",
    block: "SALES",
  },
  {
    key: "tactical",
    label: "Tactical",
    description: "Execution and tactical follow-ups",
    enabledByDefault: true,
    route: "tactical",
    block: "CHECKLIST",
  },
  {
    key: "topics",
    label: "Topics",
    description: "Topic intelligence surface",
    enabledByDefault: true,
    route: "topics",
    block: "CHECKLIST",
  },
  {
    key: "unit-board",
    label: "Project Board",
    description: "Shared execution card board",
    enabledByDefault: true,
    route: "unit-board",
    block: "PROJECT",
  },
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

export type UnitModuleBlockDefinition = {
  key: UnitCapabilityBlock;
  label: string;
  description: string;
  moduleKeys: UnitModuleKey[];
};

export const UNIT_MODULE_BLOCKS: UnitModuleBlockDefinition[] = [
  {
    key: "CHECKLIST",
    label: "Checklist Block",
    description: "Execution core: data, topics, goals, review, knowmore, analytics, tactical, checklist, pipeline, project board",
    moduleKeys: ["data", "topics", "goals", "review", "knowmore", "analytics", "tactical", "checklist", "pipeline", "unit-board"],
  },
  {
    key: "SALES",
    label: "Sales Block",
    description: "Sales-oriented unit configuration: data, knowmore, analytics, AI queue, sales, checklist, review",
    moduleKeys: ["data", "knowmore", "analytics", "pipeline", "sales", "checklist", "review"],
  },
  {
    key: "CONTENT",
    label: "Content Block",
    description: "Content governance with data, knowmore, analytics, content, and project board",
    moduleKeys: ["data", "knowmore", "analytics", "content", "unit-board"],
  },
  {
    key: "PROJECT",
    label: "Project Block",
    description: "Board-only surface with Unit Board",
    moduleKeys: ["unit-board"],
  },
];

const UNIT_MODULE_PRESET_BY_WEBAPP: Record<UnitWebappProfile, Record<UnitModuleKey, boolean>> = {
  NONE: { ...BASE_DEFAULT_MODULES },
  CLASSSCOUT: {
    ...BASE_DEFAULT_MODULES,
    content: true,
    sales: true,
  },
  COMPARE: {
    ...BASE_DEFAULT_MODULES,
    sales: false,
    goals: false,
    topics: false,
    tactical: false,
    content: true,
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

  Object.entries(LEGACY_MODULE_KEY_BY_ALIAS as Record<string, UnitModuleKey>).forEach(([legacyKey, normalizedKey]) => {
    if (Object.prototype.hasOwnProperty.call(raw as Record<string, unknown>, legacyKey)) {
      const legacyValue = coerceBoolean((raw as Record<string, unknown>)[legacyKey]);
      if (legacyValue !== null) {
        normalized[normalizedKey] = legacyValue;
      }
    }
  });
  return normalized;
}

function buildMergedModules(profile: UnitWebappProfile, rawModules: Partial<Record<UnitModuleKey, boolean>>) {
  const preset = UNIT_MODULE_PRESET_BY_WEBAPP[profile];
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

  const hasExplicitProfile = Object.prototype.hasOwnProperty.call(workerModules ?? {}, "webappProfile");
  const hasExplicitModules = Object.prototype.hasOwnProperty.call(workerModules ?? {}, "modules");
  const normalizedModules = normalizeModuleOverrides(hasExplicitModules ? workerModules?.modules : {});
  const hasAnyModuleOverride = Object.keys(normalizedModules).length > 0;

  if (!workerModules) {
    return {
      profile: resolvedAutoProfile,
      modules: buildMergedModules(resolvedAutoProfile, {}),
      source: "auto",
    } as ResolvedUnitCapabilityConfig;
  }

  const profile = hasExplicitProfile ? normalizeRawProfile(workerModules?.webappProfile) : resolvedAutoProfile;

  return {
    profile,
    modules: buildMergedModules(profile, normalizedModules),
    source: hasExplicitProfile || hasAnyModuleOverride ? "custom" : "auto",
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
  const hasExplicitProfile = Object.prototype.hasOwnProperty.call(payload, "webappProfile");
  const hasExplicitModules = Object.prototype.hasOwnProperty.call(payload, "modules");
  const resolvedProfile = hasExplicitProfile ? normalizeRawProfile(payload.webappProfile) : ROUTER_DEFAULT_WEBAPP_PROFILE;
  const modules = buildMergedModules(resolvedProfile, hasExplicitModules ? normalizeModuleOverrides(payload.modules) : {});
  return { profile: resolvedProfile, modules };
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
