import {
  getRequiredModulesForBlocks,
  isBlockKey,
  isModuleKey,
  type BlockKey as CanonicalBlockKey,
  type ModuleKey as CanonicalModuleKey,
} from "@/lib/check-foundation/registry";

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

export type UnitCapabilityValidationIssue = {
  code: string;
  field: string;
  value?: unknown;
  message: string;
};

export type UnitCapabilityValidation = {
  isValid: boolean;
  errors: UnitCapabilityValidationIssue[];
  warnings: UnitCapabilityValidationIssue[];
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

export const UNIT_CAPABILITIES_SCHEMA_VERSION: 2 = 2;
export const UNIT_CAPABILITY_PAYLOAD_VERSION: 2 = 2;

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

const KNOWN_UNIT_MODULE_KEYS = new Set<string>(UNIT_MODULE_KEYS);

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

const CANONICAL_MODULE_TO_LEGACY: Partial<Record<CanonicalModuleKey, UnitModuleKey>> = {
  data: "data",
  topics: "topics",
  goals: "goals",
  review: "review",
  knowmore: "knowmore",
  tactical: "tactical",
  analytics: "analytics",
  aiQueue: "pipeline",
  checklist: "checklist",
  sales: "sales",
  project: "unit-board",
  miniapp: "content",
};

function validateIssue(code: string, field: string, message: string, value?: unknown): UnitCapabilityValidationIssue {
  return { code, field, value, message };
}

function normalizeStoredPayload(
  profileCandidate: unknown,
  modulesCandidate: unknown,
  validation?: UnitCapabilityValidation,
): UnitCapabilityPayloadV2 {
  const profile = normalizeRawProfile(profileCandidate, validation);
  const modules = normalizeModuleOverrides(modulesCandidate, validation);
  const mergedModules = buildMergedModules(profile, modules);
  return {
    v: UNIT_CAPABILITY_PAYLOAD_VERSION,
    profile,
    modules: mergedModules,
  };
}

function parseUnitCapabilitiesEnvelope(
  raw: unknown,
): { payload: UnitCapabilityPayloadV2; validation: UnitCapabilityValidation } | null {
  if (!raw || typeof raw !== "object") return null;

  const envelope = raw as Partial<UnitCapabilitiesEnvelope & { payload: unknown; schemaVersion: unknown; v: unknown }>;
  if (typeof envelope.schemaVersion !== "number" || envelope.schemaVersion !== UNIT_CAPABILITIES_SCHEMA_VERSION) {
    return null;
  }

  const payload = envelope.payload;
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<UnitCapabilityPayloadV2 & { profile: unknown; modules: unknown; v: unknown }>;

  if (typeof candidate.v !== "number" || candidate.v !== UNIT_CAPABILITY_PAYLOAD_VERSION) return null;

  const validation: UnitCapabilityValidation = {
    isValid: true,
    errors: [],
    warnings: [],
  };
  const normalizedModules = normalizeModuleOverrides(candidate.modules, validation);
  const normalizedProfile = normalizeRawProfile(candidate.profile, validation);
  const normalized = {
    v: UNIT_CAPABILITY_PAYLOAD_VERSION,
    profile: normalizedProfile,
    modules: buildMergedModules(normalizedProfile, normalizedModules),
  };
  if (!validation.isValid) {
    return null;
  }
  return { payload: normalized, validation };
}

function parseUnitCapabilitiesV3Envelope(
  raw: unknown,
): { payload: UnitCapabilityPayloadV2; validation: UnitCapabilityValidation } | null {
  if (!raw || typeof raw !== "object") return null;

  const envelope = raw as {
    schemaVersion?: unknown;
    payload?: unknown;
    blocks?: unknown;
    modules?: unknown;
    miniapps?: unknown;
  };
  if (envelope.schemaVersion !== 3) {
    return null;
  }

  const candidate =
    envelope.payload && typeof envelope.payload === "object" && !Array.isArray(envelope.payload)
      ? envelope.payload as {
          blocks?: unknown;
          modules?: unknown;
          miniapps?: unknown;
        }
      : envelope;

  const blocksRecord =
    candidate.blocks && typeof candidate.blocks === "object" && !Array.isArray(candidate.blocks)
      ? candidate.blocks as Record<string, unknown>
      : null;
  if (!blocksRecord) return null;

  const validation: UnitCapabilityValidation = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  const enabledBlocks: CanonicalBlockKey[] = [];
  for (const [key, value] of Object.entries(blocksRecord)) {
    if (!isBlockKey(key)) {
      validation.warnings.push(
        validateIssue("unknown-block-key", `unitCapabilities.blocks.${key}`, `Ignoring unknown Block key ${key}`, key),
      );
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { enabled?: unknown }).enabled !== "boolean") {
      validation.warnings.push(
        validateIssue(
          "invalid-block-enabled",
          `unitCapabilities.blocks.${key}`,
          `Block ${key} must provide an enabled boolean`,
          value,
        ),
      );
      continue;
    }
    if ((value as { enabled: boolean }).enabled) {
      enabledBlocks.push(key);
    }
  }

  const requiredModules = new Set<CanonicalModuleKey>(getRequiredModulesForBlocks(enabledBlocks));
  const enabledCanonicalModules = new Set<CanonicalModuleKey>(requiredModules);

  const modulesRecord =
    candidate.modules && typeof candidate.modules === "object" && !Array.isArray(candidate.modules)
      ? candidate.modules as Record<string, unknown>
      : null;
  for (const [key, value] of Object.entries(modulesRecord ?? {})) {
    if (!isModuleKey(key)) {
      validation.warnings.push(
        validateIssue("unknown-module-key", `unitCapabilities.modules.${key}`, `Ignoring unknown canonical module ${key}`, key),
      );
      continue;
    }
    if (typeof value !== "boolean") {
      validation.warnings.push(
        validateIssue(
          "invalid-module-value",
          `unitCapabilities.modules.${key}`,
          `Module ${key} must be boolean`,
          value,
        ),
      );
      continue;
    }
    if (value) {
      enabledCanonicalModules.add(key);
      continue;
    }
    if (requiredModules.has(key)) {
      validation.warnings.push(
        validateIssue(
          "required-module-override-denied",
          `unitCapabilities.modules.${key}`,
          `Module ${key} cannot be disabled because enabled Blocks require it`,
          value,
        ),
      );
      continue;
    }
    enabledCanonicalModules.delete(key);
  }

  const miniappsRecord =
    candidate.miniapps && typeof candidate.miniapps === "object" && !Array.isArray(candidate.miniapps)
      ? candidate.miniapps as Record<string, unknown>
      : null;
  const classScoutEnabled = miniappsRecord?.classscout && typeof miniappsRecord.classscout === "object"
    ? (miniappsRecord.classscout as { enabled?: unknown }).enabled === true
    : false;
  const compareEnabled = miniappsRecord?.compare && typeof miniappsRecord.compare === "object"
    ? (miniappsRecord.compare as { enabled?: unknown }).enabled === true
    : false;

  if (classScoutEnabled && compareEnabled) {
    validation.warnings.push(
      validateIssue(
        "multi-miniapp-profile-projection",
        "unitCapabilities.miniapps",
        "Both classscout and compare were enabled; legacy profile projection defaults to CLASSSCOUT",
      ),
    );
  }

  const profile: UnitWebappProfile = compareEnabled && !classScoutEnabled
    ? "COMPARE"
    : classScoutEnabled
      ? "CLASSSCOUT"
      : "NONE";

  const modules: Record<UnitModuleKey, boolean> = { ...BASE_DEFAULT_MODULES };
  for (const legacyKey of Object.values(CANONICAL_MODULE_TO_LEGACY)) {
    if (legacyKey) modules[legacyKey] = false;
  }
  for (const canonicalKey of enabledCanonicalModules) {
    const legacyKey = CANONICAL_MODULE_TO_LEGACY[canonicalKey];
    if (legacyKey) modules[legacyKey] = true;
  }
  modules.webapp = true;

  return {
    payload: {
      v: UNIT_CAPABILITY_PAYLOAD_VERSION,
      profile,
      modules,
    },
    validation,
  };
}

function normalizeRawProfile(
  raw: unknown,
  validation?: UnitCapabilityValidation,
): UnitWebappProfile {
  if (raw === "CLASSSCOUT") return "CLASSSCOUT";
  if (raw === "COMPARE") return "COMPARE";
  if (raw === "NONE") return "NONE";
  if (validation && raw !== undefined) {
    validation.warnings.push(validateIssue(
      "invalid-webapp-profile",
      "webappProfile",
      `Unsupported profile ${String(raw)}; defaulting to ${ROUTER_DEFAULT_WEBAPP_PROFILE}`,
      raw,
    ));
  }
  return ROUTER_DEFAULT_WEBAPP_PROFILE;
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function normalizeModuleOverrides(
  raw: unknown,
  validation?: UnitCapabilityValidation,
): Partial<Record<UnitModuleKey, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (raw != null && validation) {
      validation.warnings.push(
        validateIssue("invalid-module-map", "modules", "modules must be an object; defaulting to preset modules", raw),
      );
    }
    return {};
  }
  const normalized: Partial<Record<UnitModuleKey, boolean>> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
    const canonicalKey = KNOWN_UNIT_MODULE_KEYS.has(key)
      ? (key as UnitModuleKey)
      : LEGACY_MODULE_KEY_BY_ALIAS[key];

    if (canonicalKey === undefined) {
      if (validation) {
        validation.warnings.push(validateIssue("unknown-module-key", `modules.${key}`, `Ignoring unknown module key ${key}`, key));
      }
      return;
    }

    const coerced = coerceBoolean(value);
    if (coerced === null) {
      if (validation) {
        validation.errors.push(
          validateIssue("invalid-module-value", `modules.${key}`, `Module ${canonicalKey} must be boolean`, value),
        );
      }
      return;
    }
    normalized[canonicalKey] = coerced;
  });

  Object.entries(LEGACY_MODULE_KEY_BY_ALIAS as Record<string, UnitModuleKey>).forEach(([legacyKey, normalizedKey]) => {
    if (Object.prototype.hasOwnProperty.call(raw as Record<string, unknown>, legacyKey)) {
      const legacyValue = coerceBoolean((raw as Record<string, unknown>)[legacyKey]);
      if (legacyValue !== null) {
        normalized[normalizedKey] = legacyValue;
      } else if (validation) {
        validation.errors.push(
          validateIssue(
            "invalid-module-value",
            `modules.${legacyKey}`,
            `Legacy module alias ${legacyKey} must be boolean`,
            legacyValue,
          ),
        );
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
      profile: envelopePayload.payload.profile,
      modules: envelopePayload.payload.modules,
      source: "custom",
      sourceEnvelopeVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      schemaVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      normalized: envelopePayload.payload,
    };
  }

  const v3ProjectedPayload = parseUnitCapabilitiesV3Envelope(workerCapabilitiesRaw);
  if (v3ProjectedPayload) {
    return {
      profile: v3ProjectedPayload.payload.profile,
      modules: v3ProjectedPayload.payload.modules,
      source: "custom",
      sourceEnvelopeVersion: 3,
      schemaVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      normalized: v3ProjectedPayload.payload,
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
        schemaVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
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
    schemaVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
    normalized: legacyFallbackPayload,
  };
}

export function normalizeUnitCapabilitiesPayloadForWrite(raw: unknown): {
  payload: UnitCapabilityPayloadV2;
  validation: UnitCapabilityValidation;
} {
  const validation: UnitCapabilityValidation = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  if (raw === null || raw === undefined) {
    return {
      payload: normalizeStoredPayload(ROUTER_DEFAULT_WEBAPP_PROFILE, undefined),
      validation,
    };
  }

  if (typeof raw !== "object") {
    validation.errors.push(
      validateIssue("invalid-capability-payload", "unitCapabilities", "unitCapabilities must be an object"),
    );
    return {
      payload: normalizeStoredPayload(ROUTER_DEFAULT_WEBAPP_PROFILE, undefined, validation),
      validation,
    };
  }

  const asLegacy = raw as RawWorkerUnitCapabilities;
  const envelopePayload = parseUnitCapabilitiesEnvelope(asLegacy);
  if (envelopePayload?.validation) {
    return {
      payload: envelopePayload.payload,
      validation: envelopePayload.validation,
    };
  }

  const normalized = normalizeStoredPayload(asLegacy.webappProfile, asLegacy.modules, validation);
  const hasExplicitProfile = Object.prototype.hasOwnProperty.call(asLegacy, "webappProfile");
  const hasExplicitModules = Object.prototype.hasOwnProperty.call(asLegacy, "modules");
  const hasExplicitPayload = Object.prototype.hasOwnProperty.call(asLegacy, "payload");

  if (hasExplicitPayload && asLegacy.payload !== undefined) {
    validation.warnings.push(
      validateIssue(
        "unsupported-payload",
        "unitCapabilities.payload",
        "Nested payload was ignored; supported fields are webappProfile/modules/v",
        asLegacy.payload,
      ),
    );
  }

  if (asLegacy.v !== undefined && asLegacy.v !== UNIT_CAPABILITY_PAYLOAD_VERSION) {
    validation.warnings.push(
      validateIssue(
        "migrated-capability-version",
        "unitCapabilities.v",
        `Capability payload version ${asLegacy.v} was migrated to version ${UNIT_CAPABILITY_PAYLOAD_VERSION}`,
        asLegacy.v,
      ),
    );
  }

  if (hasExplicitProfile && asLegacy.webappProfile === undefined) {
    validation.warnings.push(
      validateIssue(
        "missing-field",
        "unitCapabilities.webappProfile",
        "webappProfile key was present but undefined; defaulted to profile from payload",
        asLegacy.webappProfile,
      ),
    );
  }

  if (!hasExplicitProfile && !hasExplicitModules && asLegacy.v && asLegacy.v !== UNIT_CAPABILITY_PAYLOAD_VERSION) {
    validation.warnings.push(
      validateIssue(
        "legacy-version",
        "unitCapabilities.v",
        `Legacy capability payload detected with version ${asLegacy.v}; migrated deterministically`,
        asLegacy.v,
      ),
    );
  }

  validation.isValid = validation.errors.length === 0;
  return { payload: normalized, validation };
}

export function normalizeUnitCapabilitiesPayload(raw: unknown): {
  profile: UnitWebappProfile;
  modules: Record<UnitModuleKey, boolean>;
  v: number;
} {
  const envelopePayload = parseUnitCapabilitiesEnvelope(raw);
  if (envelopePayload) {
    return envelopePayload.payload;
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
