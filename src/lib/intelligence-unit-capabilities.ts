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
  v?: number;
  payload?: unknown;
};

export type UnitCapabilityPayloadV2 = {
  v: 2;
  profile: UnitWebappProfile;
  modules: Record<UnitModuleKey, boolean>;
};

export type UnitCapabilitiesEnvelope = {
  schemaVersion: 2;
  payload: UnitCapabilityPayloadV2;
};

export const UNIT_CAPABILITIES_SCHEMA_VERSION = 2;
export const UNIT_CAPABILITY_PAYLOAD_VERSION = 2;

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
  sourceEnvelopeVersion: number;
  schemaVersion: number;
  normalized: UnitCapabilityPayloadV2;
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

function normalizeStoredPayload(profileCandidate: unknown, modulesCandidate: unknown): UnitCapabilityPayloadV2 {
  const profile = normalizeRawProfile(profileCandidate);
  const modules = normalizeModuleOverrides(modulesCandidate);
  return {
    v: UNIT_CAPABILITY_PAYLOAD_VERSION,
    profile,
    modules: buildMergedModules(profile, modules),
  };
}

function parseUnitCapabilitiesEnvelope(raw: unknown): UnitCapabilityPayloadV2 | null {
  if (!raw || typeof raw !== "object") return null;

  const envelope = raw as Partial<UnitCapabilitiesEnvelope & { payload: unknown; schemaVersion: unknown; v: unknown }>;
  if (typeof envelope.schemaVersion !== "number" || envelope.schemaVersion !== UNIT_CAPABILITIES_SCHEMA_VERSION) {
    return null;
  }

  const payload = envelope.payload;
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<UnitCapabilityPayloadV2 & { profile: unknown; modules: unknown; v: unknown }>;

  if (typeof candidate.v !== "number" || candidate.v !== UNIT_CAPABILITY_PAYLOAD_VERSION) return null;

  const normalizedModules = normalizeModuleOverrides(candidate.modules);
  const profile = normalizeRawProfile(candidate.profile);
  return {
    v: UNIT_CAPABILITY_PAYLOAD_VERSION,
    profile,
    modules: buildMergedModules(profile, normalizedModules),
  };
}

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

  const workerCapabilitiesRaw =
    (typeof input.workerConfig === "object" && input.workerConfig !== null
      ? (input.workerConfig as { unitCapabilities?: RawWorkerUnitCapabilities }).unitCapabilities
      : undefined) as RawWorkerUnitCapabilities | undefined;

  const envelopePayload = parseUnitCapabilitiesEnvelope(workerCapabilitiesRaw);
  if (envelopePayload) {
    return {
      profile: envelopePayload.profile,
      modules: envelopePayload.modules,
      source: "custom",
      sourceEnvelopeVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      schemaVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      normalized: envelopePayload,
    };
  }

  if (typeof workerCapabilitiesRaw === "object" && workerCapabilitiesRaw !== null && Object.prototype.hasOwnProperty.call(workerCapabilitiesRaw, "v")) {
    const legacyWithVersion = workerCapabilitiesRaw as RawWorkerUnitCapabilities;
    if (legacyWithVersion.v && legacyWithVersion.v >= 1 && !Object.prototype.hasOwnProperty.call(legacyWithVersion, "payload")) {
      const normalized = normalizeStoredPayload(legacyWithVersion.webappProfile, legacyWithVersion.modules);
      return {
        profile: normalized.profile,
        modules: normalized.modules,
        source: "custom",
        sourceEnvelopeVersion: legacyWithVersion.v,
        schemaVersion: legacyWithVersion.v,
        normalized: normalized,
      };
    }
  }

  const hasExplicitProfile = Object.prototype.hasOwnProperty.call(workerCapabilitiesRaw ?? {}, "webappProfile");
  const hasExplicitModules = Object.prototype.hasOwnProperty.call(workerCapabilitiesRaw ?? {}, "modules");
  const normalizedModules = normalizeModuleOverrides(hasExplicitModules ? workerCapabilitiesRaw?.modules : {});
  const hasAnyModuleOverride = Object.keys(normalizedModules).length > 0;
  const legacyFallbackPayload = normalizeStoredPayload(
    hasExplicitProfile ? workerCapabilitiesRaw?.webappProfile : resolvedAutoProfile,
    hasExplicitModules ? normalizedModules : {},
  );

  if (!workerCapabilitiesRaw) {
    return {
      profile: resolvedAutoProfile,
      modules: legacyFallbackPayload.modules,
      source: "auto",
      sourceEnvelopeVersion: 0,
      schemaVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      normalized: normalizeStoredPayload(resolvedAutoProfile, {}),
    };
  }

  const profile = hasExplicitProfile ? normalizeRawProfile(workerCapabilitiesRaw?.webappProfile) : resolvedAutoProfile;

  return {
    profile,
    modules: buildMergedModules(profile, normalizedModules),
    source: hasExplicitProfile || hasAnyModuleOverride ? "custom" : "auto",
    sourceEnvelopeVersion: 1,
    schemaVersion: 1,
    normalized: legacyFallbackPayload,
  };
}

export function normalizeUnitCapabilitiesPayload(raw: unknown): {
  profile: UnitWebappProfile;
  modules: Record<UnitModuleKey, boolean>;
  v: number;
} {
  const envelopePayload = parseUnitCapabilitiesEnvelope(raw);
  if (envelopePayload) {
    return envelopePayload;
  }

  if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "v")) {
    const rawPayload = raw as RawWorkerUnitCapabilities;
    const normalized = normalizeStoredPayload(rawPayload.webappProfile, rawPayload.modules);
    return {
      profile: normalized.profile,
      modules: normalized.modules,
      v: normalized.v,
    };
  }

  if (!raw || typeof raw !== "object") {
    return {
      profile: ROUTER_DEFAULT_WEBAPP_PROFILE,
      modules: BASE_DEFAULT_MODULES,
      v: UNIT_CAPABILITY_PAYLOAD_VERSION,
    };
  }
  const payload = raw as RawWorkerUnitCapabilities;
  const hasExplicitProfile = Object.prototype.hasOwnProperty.call(payload, "webappProfile");
  const hasExplicitModules = Object.prototype.hasOwnProperty.call(payload, "modules");
  const resolvedProfile = hasExplicitProfile ? normalizeRawProfile(payload.webappProfile) : ROUTER_DEFAULT_WEBAPP_PROFILE;
  const modules = buildMergedModules(resolvedProfile, hasExplicitModules ? normalizeModuleOverrides(payload.modules) : {});
  return { profile: resolvedProfile, modules, v: UNIT_CAPABILITY_PAYLOAD_VERSION };
}

export function formatCapabilityPayload(input: {
  profile: UnitWebappProfile;
  modules: Partial<Record<UnitModuleKey, boolean>>;
}) {
  return {
    schemaVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
    payload: {
      ...normalizeStoredPayload(input.profile, input.modules),
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
