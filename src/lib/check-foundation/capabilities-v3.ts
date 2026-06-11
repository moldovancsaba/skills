import {
  BLOCK_KEYS,
  type BlockKey,
  getRequiredModulesForBlocks,
  isBlockKey,
  isModuleKey,
  MODULE_KEYS,
  type ModuleKey,
} from "./registry";

type LegacyProfile = "NONE" | "CLASSSCOUT" | "COMPARE";

type LegacyModuleKey =
  | "webapp"
  | "content"
  | "data"
  | "checklist"
  | "analytics"
  | "goals"
  | "knowmore"
  | "pipeline"
  | "review"
  | "sales"
  | "tactical"
  | "topics"
  | "unit-board";

export type UnitCapabilitiesV3 = {
  schemaVersion: 3;
  blocks: Partial<Record<BlockKey, { enabled: boolean }>>;
  miniapps?: Record<string, { enabled: boolean }>;
  modules?: Partial<Record<ModuleKey, boolean>>;
};

export type EffectiveUnitCapabilities = {
  schemaVersion: 3;
  enabledBlocks: BlockKey[];
  enabledModules: ModuleKey[];
  enabledMiniapps: string[];
  source: "v3" | "legacy-v2" | "auto-detected" | "default";
  warnings: string[];
};

export type ResolveEffectiveUnitCapabilitiesInput = {
  workerConfig?: unknown;
  hasClassScoutDestination?: boolean;
  hasCompareDestination?: boolean;
  hasTrainersDestination?: boolean;
  hasAthleteIQDestination?: boolean;
  defaultBlocks?: BlockKey[];
};

type ParsedV3Payload = {
  payload: UnitCapabilitiesV3;
  warnings: string[];
};

type ParsedLegacyPayload = {
  profile: LegacyProfile;
  modules: Partial<Record<LegacyModuleKey | "unitBoard", boolean>>;
  warnings: string[];
};

const LEGACY_PROFILE_BLOCK_MAP: Record<LegacyProfile, BlockKey[]> = {
  NONE: ["checklist"],
  CLASSSCOUT: ["checklist", "sales", "miniapp"],
  COMPARE: ["checklist", "miniapp"],
};

const LEGACY_PROFILE_MINIAPP_MAP: Record<LegacyProfile, string[]> = {
  NONE: [],
  CLASSSCOUT: ["classscout"],
  COMPARE: ["compare"],
};

const LEGACY_MODULE_TO_CANONICAL: Partial<Record<LegacyModuleKey | "unitBoard", ModuleKey>> = {
  content: "miniapp",
  data: "data",
  checklist: "checklist",
  analytics: "analytics",
  goals: "goals",
  knowmore: "knowmore",
  pipeline: "aiQueue",
  review: "review",
  sales: "sales",
  tactical: "tactical",
  topics: "topics",
  "unit-board": "project",
  unitBoard: "project",
};

export function mapLegacyProfileToBlocks(profile: string): BlockKey[] {
  if (profile === "CLASSSCOUT") return [...LEGACY_PROFILE_BLOCK_MAP.CLASSSCOUT];
  if (profile === "COMPARE") return [...LEGACY_PROFILE_BLOCK_MAP.COMPARE];
  return [...LEGACY_PROFILE_BLOCK_MAP.NONE];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeLegacyProfile(raw: unknown, warnings: string[]): LegacyProfile {
  if (raw === "CLASSSCOUT" || raw === "COMPARE" || raw === "NONE") return raw;
  if (raw !== undefined) {
    warnings.push(`Unsupported legacy profile "${String(raw)}"; defaulted to NONE.`);
  }
  return "NONE";
}

function normalizeLegacyModules(raw: unknown, warnings: string[]): Partial<Record<LegacyModuleKey | "unitBoard", boolean>> {
  const record = asRecord(raw);
  if (!record) {
    if (raw !== undefined) {
      warnings.push("Legacy modules value was not an object and was ignored.");
    }
    return {};
  }

  const normalized: Partial<Record<LegacyModuleKey | "unitBoard", boolean>> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "boolean") {
      warnings.push(`Legacy module override "${key}" was ignored because the value was not boolean.`);
      continue;
    }
    normalized[key as LegacyModuleKey | "unitBoard"] = value;
  }
  return normalized;
}

function parseV3Payload(workerConfig: unknown): ParsedV3Payload | null {
  const warnings: string[] = [];
  const root = asRecord(workerConfig);
  const rawCapabilities = root ? root.unitCapabilities : undefined;
  const capabilitiesRecord = asRecord(rawCapabilities);
  if (!capabilitiesRecord) return null;

  const envelopePayload = asRecord(capabilitiesRecord.payload);
  const hasEnvelope = capabilitiesRecord.schemaVersion === 3 && envelopePayload !== null;
  const candidate = hasEnvelope ? envelopePayload : capabilitiesRecord;

  const version = candidate.v;
  const rawBlocks = asRecord(candidate.blocks);
  const rawMiniapps = asRecord(candidate.miniapps);
  const rawModules = asRecord(candidate.modules);

  if (version !== 3 && !hasEnvelope) {
    return null;
  }

  if (!rawBlocks) {
    warnings.push("v3 capability payload did not include a valid blocks map.");
  }

  const normalizedBlocks: Partial<Record<BlockKey, { enabled: boolean }>> = {};
  for (const key of Object.keys(rawBlocks ?? {})) {
    if (!isBlockKey(key)) {
      warnings.push(`Unknown v3 Block key "${key}" was ignored.`);
      continue;
    }
    const row = asRecord(rawBlocks?.[key]);
    if (!row || typeof row.enabled !== "boolean") {
      warnings.push(`Block "${key}" had invalid enabled flag and was ignored.`);
      continue;
    }
    normalizedBlocks[key] = { enabled: row.enabled };
  }

  const normalizedMiniapps: Record<string, { enabled: boolean }> = {};
  for (const [key, value] of Object.entries(rawMiniapps ?? {})) {
    const row = asRecord(value);
    if (!row || typeof row.enabled !== "boolean") {
      warnings.push(`Miniapp "${key}" had invalid enabled flag and was ignored.`);
      continue;
    }
    normalizedMiniapps[key] = { enabled: row.enabled };
  }

  const normalizedModules: Partial<Record<ModuleKey, boolean>> = {};
  for (const [key, value] of Object.entries(rawModules ?? {})) {
    if (!isModuleKey(key)) {
      warnings.push(`Unknown v3 Module key "${key}" was ignored.`);
      continue;
    }
    if (typeof value !== "boolean") {
      warnings.push(`Module "${key}" override was ignored because the value was not boolean.`);
      continue;
    }
    normalizedModules[key] = value;
  }

  return {
    payload: {
      schemaVersion: 3,
      blocks: normalizedBlocks,
      miniapps: normalizedMiniapps,
      modules: normalizedModules,
    },
    warnings,
  };
}

function parseLegacyPayload(workerConfig: unknown): ParsedLegacyPayload | null {
  const warnings: string[] = [];
  const root = asRecord(workerConfig);
  const rawCapabilities = root ? root.unitCapabilities : undefined;
  const capabilitiesRecord = asRecord(rawCapabilities);
  if (!capabilitiesRecord) return null;

  const envelopePayload = asRecord(capabilitiesRecord.payload);
  const hasEnvelope = capabilitiesRecord.schemaVersion === 2 && envelopePayload !== null;
  const candidate = hasEnvelope ? envelopePayload : capabilitiesRecord;
  const version = candidate.v;
  const hasLegacyShape = version === 2 || Object.prototype.hasOwnProperty.call(candidate, "webappProfile");
  if (!hasLegacyShape) return null;

  return {
    profile: normalizeLegacyProfile(candidate.profile ?? candidate.webappProfile, warnings),
    modules: normalizeLegacyModules(candidate.modules, warnings),
    warnings,
  };
}

function resolveBlocksFromLegacy(parsed: ParsedLegacyPayload): BlockKey[] {
  const set = new Set<BlockKey>(mapLegacyProfileToBlocks(parsed.profile));

  const convertedModuleFlags = convertLegacyModuleOverrides(parsed.modules);
  if (convertedModuleFlags.project === true) set.add("project");
  if (convertedModuleFlags.sales === true) set.add("sales");
  if (convertedModuleFlags.miniapp === true) set.add("miniapp");
  if (convertedModuleFlags.checklist === true) set.add("checklist");

  return BLOCK_KEYS.filter((key) => set.has(key));
}

function convertLegacyModuleOverrides(
  modules: Partial<Record<LegacyModuleKey | "unitBoard", boolean>>,
): Partial<Record<ModuleKey, boolean>> {
  const converted: Partial<Record<ModuleKey, boolean>> = {};
  for (const [legacyKey, enabled] of Object.entries(modules)) {
    const canonical = LEGACY_MODULE_TO_CANONICAL[legacyKey as LegacyModuleKey | "unitBoard"];
    if (!canonical) continue;
    converted[canonical] = Boolean(enabled);
  }
  return converted;
}

function applyModuleOverrides(
  baseModules: ModuleKey[],
  overrides: Partial<Record<ModuleKey, boolean>>,
  warnings: string[],
): ModuleKey[] {
  const required = new Set<ModuleKey>(baseModules);
  const enabled = new Set<ModuleKey>(baseModules);

  for (const [key, value] of Object.entries(overrides)) {
    const moduleKey = key as ModuleKey;
    if (value === true) {
      enabled.add(moduleKey);
      continue;
    }
    if (value === false && required.has(moduleKey)) {
      warnings.push(`Module "${moduleKey}" cannot be disabled because it is required by an enabled Block.`);
      continue;
    }
    if (value === false) {
      enabled.delete(moduleKey);
    }
  }

  return MODULE_KEYS.filter((moduleKey) => enabled.has(moduleKey));
}

function resolveBlocksFromV3(payload: UnitCapabilitiesV3): BlockKey[] {
  const enabled = new Set<BlockKey>();
  for (const key of BLOCK_KEYS) {
    if (payload.blocks[key]?.enabled === true) {
      enabled.add(key);
    }
  }
  return BLOCK_KEYS.filter((key) => enabled.has(key));
}

function resolveMiniappsFromV3(payload: UnitCapabilitiesV3): string[] {
  const miniapps = payload.miniapps ?? {};
  return Object.keys(miniapps).filter((key) => miniapps[key]?.enabled === true);
}

function resolveAutoDetected(input: ResolveEffectiveUnitCapabilitiesInput): EffectiveUnitCapabilities {
  const detectedBlocks: BlockKey[] = [...(input.defaultBlocks ?? ["checklist"])];
  const enabledMiniapps: string[] = [];

  if (input.hasClassScoutDestination) {
    if (!detectedBlocks.includes("miniapp")) detectedBlocks.push("miniapp");
    if (!enabledMiniapps.includes("classscout")) enabledMiniapps.push("classscout");
  }
  if (input.hasCompareDestination) {
    if (!detectedBlocks.includes("miniapp")) detectedBlocks.push("miniapp");
    if (!enabledMiniapps.includes("compare")) enabledMiniapps.push("compare");
  }
  if (input.hasTrainersDestination) {
    if (!detectedBlocks.includes("miniapp")) detectedBlocks.push("miniapp");
    if (!enabledMiniapps.includes("trainers")) enabledMiniapps.push("trainers");
  }
  if (input.hasAthleteIQDestination) {
    if (!detectedBlocks.includes("miniapp")) detectedBlocks.push("miniapp");
    if (!enabledMiniapps.includes("athleteiq")) enabledMiniapps.push("athleteiq");
  }

  const orderedBlocks = BLOCK_KEYS.filter((key) => detectedBlocks.includes(key));
  const enabledModules = getRequiredModulesForBlocks(orderedBlocks);

  return {
    schemaVersion: 3,
    enabledBlocks: orderedBlocks,
    enabledModules,
    enabledMiniapps,
    source: input.defaultBlocks ? "default" : "auto-detected",
    warnings: [],
  };
}

export function resolveEffectiveUnitCapabilities(input: ResolveEffectiveUnitCapabilitiesInput): EffectiveUnitCapabilities {
  const parsedV3 = parseV3Payload(input.workerConfig);
  if (parsedV3) {
    const warnings = [...parsedV3.warnings];
    const enabledBlocks = resolveBlocksFromV3(parsedV3.payload);
    const blocks = enabledBlocks.length > 0 ? enabledBlocks : (input.defaultBlocks ?? ["checklist"]);
    const baseModules = getRequiredModulesForBlocks(blocks);
    const enabledModules = applyModuleOverrides(baseModules, parsedV3.payload.modules ?? {}, warnings);
    const enabledMiniapps = resolveMiniappsFromV3(parsedV3.payload);

    return {
      schemaVersion: 3,
      enabledBlocks: BLOCK_KEYS.filter((key) => blocks.includes(key)),
      enabledModules,
      enabledMiniapps,
      source: "v3",
      warnings,
    };
  }

  const parsedLegacy = parseLegacyPayload(input.workerConfig);
  if (parsedLegacy) {
    const warnings = [...parsedLegacy.warnings];
    const enabledBlocks = resolveBlocksFromLegacy(parsedLegacy);
    const baseModules = getRequiredModulesForBlocks(enabledBlocks);
    const enabledModules = applyModuleOverrides(baseModules, convertLegacyModuleOverrides(parsedLegacy.modules), warnings);
    const enabledMiniapps = [...LEGACY_PROFILE_MINIAPP_MAP[parsedLegacy.profile]];

    return {
      schemaVersion: 3,
      enabledBlocks,
      enabledModules,
      enabledMiniapps,
      source: "legacy-v2",
      warnings,
    };
  }

  return resolveAutoDetected(input);
}

export function normalizeUnitCapabilitiesForStorage(raw: unknown): UnitCapabilitiesV3 {
  const parsedV3 = parseV3Payload({ unitCapabilities: raw });
  if (parsedV3) {
    const resolved = resolveEffectiveUnitCapabilities({ workerConfig: { unitCapabilities: raw } });
    return {
      schemaVersion: 3,
      blocks: Object.fromEntries(
        BLOCK_KEYS.map((key) => [key, { enabled: resolved.enabledBlocks.includes(key) }]),
      ) as Partial<Record<BlockKey, { enabled: boolean }>>,
      modules: Object.fromEntries(
        MODULE_KEYS.map((key) => [key, resolved.enabledModules.includes(key)]),
      ) as Partial<Record<ModuleKey, boolean>>,
      miniapps: Object.fromEntries(
        resolved.enabledMiniapps.map((key) => [key, { enabled: true }]),
      ),
    };
  }

  const parsedLegacy = parseLegacyPayload({ unitCapabilities: raw });
  if (parsedLegacy) {
    const resolved = resolveEffectiveUnitCapabilities({ workerConfig: { unitCapabilities: raw } });
    return {
      schemaVersion: 3,
      blocks: Object.fromEntries(
        BLOCK_KEYS.map((key) => [key, { enabled: resolved.enabledBlocks.includes(key) }]),
      ) as Partial<Record<BlockKey, { enabled: boolean }>>,
      modules: Object.fromEntries(
        MODULE_KEYS.map((key) => [key, resolved.enabledModules.includes(key)]),
      ) as Partial<Record<ModuleKey, boolean>>,
      miniapps: Object.fromEntries(
        resolved.enabledMiniapps.map((key) => [key, { enabled: true }]),
      ),
    };
  }

  const defaultBlocks: BlockKey[] = ["checklist"];
  const defaultModules = getRequiredModulesForBlocks(defaultBlocks);
  return {
    schemaVersion: 3,
    blocks: { checklist: { enabled: true } },
    modules: Object.fromEntries(
      MODULE_KEYS.map((key) => [key, defaultModules.includes(key)]),
    ) as Partial<Record<ModuleKey, boolean>>,
    miniapps: {},
  };
}
