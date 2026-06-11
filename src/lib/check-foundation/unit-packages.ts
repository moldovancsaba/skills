import unitPackagesData from "./unit-packages-data.json";
import { BLOCK_KEYS, type BlockKey, getRequiredModulesForBlocks, listBlockDefinitions } from "./registry";
import { listCardDefinitions } from "./card-registry";
import { type UnitPermission } from "./permissions-audit";
import { resolveEffectiveUnitCapabilities, type EffectiveUnitCapabilities } from "./capabilities-v3";

export const CHECK_FOUNDATION_UNIT_PACKAGES_SCHEMA_VERSION = 1 as const;

export type UnitPackageKey = "core" | "sales-only" | "project-only" | "miniapp-ops" | "full";

export type UnitPackageDefinition = {
  key: UnitPackageKey;
  displayName: string;
  allowedBlocks: BlockKey[];
  defaultEnabledBlocks: BlockKey[];
  requiredPermissions: UnitPermission[];
};

export type EffectiveUnitPackage = {
  unitId: string;
  packageKey: UnitPackageKey;
  enabledBlocks: BlockKey[];
  enabledModules: string[];
  allowedCardTypes: string[];
  visibleWebappAreas: string[];
  allowedOperations: string[];
  setupRequired: string[];
};

export type UnitPackageValidationIssue = {
  code: string;
  field: string;
  message: string;
  value?: unknown;
};

export type UnitPackageValidationResult = {
  isValid: boolean;
  packageKey: UnitPackageKey;
  allowedBlocks: BlockKey[];
  requestedBlocks: BlockKey[];
  effectiveBlocks: BlockKey[];
  rejectedBlocks: UnitPackageValidationIssue[];
  setupRequired: string[];
};

type UnitPackageRegistry = {
  schemaVersion: typeof CHECK_FOUNDATION_UNIT_PACKAGES_SCHEMA_VERSION;
  packages: UnitPackageDefinition[];
};

const typedPackages = unitPackagesData as UnitPackageRegistry;
const packageByKey = new Map<UnitPackageKey, UnitPackageDefinition>(
  typedPackages.packages.map((item) => [item.key, item]),
);

export const UNIT_PACKAGE_KEYS = typedPackages.packages.map((item) => item.key);

function isUnitPackageKey(value: string): value is UnitPackageKey {
  return UNIT_PACKAGE_KEYS.includes(value as UnitPackageKey);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeUnitPackageKey(workerConfig: unknown): UnitPackageKey {
  if (!workerConfig || typeof workerConfig !== "object") return "core";
  const raw = (workerConfig as Record<string, unknown>).unitPackageKey;
  if (typeof raw !== "string") return "core";
  return isUnitPackageKey(raw) ? raw : "core";
}

function normalizeRequestedBlocks(value: unknown): BlockKey[] {
  if (!Array.isArray(value)) return [];
  const requested = value.filter((item): item is BlockKey => typeof item === "string" && BLOCK_KEYS.includes(item as BlockKey));
  return BLOCK_KEYS.filter((blockKey) => requested.includes(blockKey));
}

function buildVisibleWebappAreas(blocks: BlockKey[], effective: EffectiveUnitCapabilities) {
  const areas: string[] = ["/settings"];
  if (blocks.includes("checklist")) {
    areas.push("/checklist", "/tactical", "/data", "/topics", "/goals", "/knowmore", "/review", "/pipeline", "/analytics");
  }
  if (blocks.includes("sales")) {
    areas.push("/sales");
  }
  if (blocks.includes("project")) {
    areas.push("/unit-board");
  }
  if (blocks.includes("miniapp")) {
    if (effective.enabledMiniapps.includes("classscout")) {
      areas.push("/classscout");
    }
    if (effective.enabledMiniapps.includes("compare")) {
      areas.push("/compare");
    }
    if (effective.enabledMiniapps.includes("trainers")) {
      areas.push("/trainers");
    }
    if (!effective.enabledMiniapps.includes("classscout") && !effective.enabledMiniapps.includes("compare") && !effective.enabledMiniapps.includes("trainers")) {
      const firstEnabledMiniapp = effective.enabledMiniapps[0];
      if (firstEnabledMiniapp) {
        areas.push(`/${firstEnabledMiniapp}`);
      } else {
        areas.push("/classscout");
      }
    }
  }
  return [...new Set(areas)];
}

function buildAllowedOperations(blocks: BlockKey[]) {
  const operations = ["read.summary"];
  if (blocks.includes("checklist")) {
    operations.push("checklist.execute", "checklist.review");
  }
  if (blocks.includes("sales")) {
    operations.push("sales.harvest", "sales.prioritize");
  }
  if (blocks.includes("project")) {
    operations.push("project.manage");
  }
  if (blocks.includes("miniapp")) {
    operations.push("miniapp.review", "miniapp.publish", "miniapp.refresh");
  }
  return operations;
}

export function listUnitPackageDefinitions(): UnitPackageDefinition[] {
  return [...typedPackages.packages];
}

export function getUnitPackageDefinition(key: UnitPackageKey): UnitPackageDefinition {
  const definition = packageByKey.get(key);
  if (!definition) {
    throw new Error(`Unknown unit package: ${key}`);
  }
  return definition;
}

export function resolveEffectiveUnitPackage(input: {
  unitId: string;
  workerConfig?: unknown;
  effectiveCapabilities?: EffectiveUnitCapabilities;
  hasClassScoutDestination?: boolean;
  hasCompareDestination?: boolean;
}): EffectiveUnitPackage {
  const packageKey = normalizeUnitPackageKey(input.workerConfig);
  const packageDefinition = getUnitPackageDefinition(packageKey);
  const effective = input.effectiveCapabilities ?? resolveEffectiveUnitCapabilities({
    workerConfig: input.workerConfig,
    hasClassScoutDestination: input.hasClassScoutDestination,
    hasCompareDestination: input.hasCompareDestination,
    defaultBlocks: packageDefinition.defaultEnabledBlocks,
  });

  const allowedSet = new Set<BlockKey>(packageDefinition.allowedBlocks);
  const enabledBlocks = BLOCK_KEYS.filter((blockKey) => {
    if (!allowedSet.has(blockKey)) return false;
    return effective.enabledBlocks.includes(blockKey);
  });

  const defaultedBlocks = enabledBlocks.length > 0
    ? enabledBlocks
    : packageDefinition.defaultEnabledBlocks.filter((key) => allowedSet.has(key));

  const enabledModules = getRequiredModulesForBlocks(defaultedBlocks);
  const cardDefinitions = listCardDefinitions();
  const allowedCardTypes = cardDefinitions
    .filter((definition) => !definition.owningBlock || defaultedBlocks.includes(definition.owningBlock))
    .map((definition) => definition.cardType);

  const setupRequired: string[] = [];
  if (defaultedBlocks.includes("miniapp") && effective.enabledMiniapps.length === 0) {
    setupRequired.push("Enable at least one Miniapp instance (ClassScout, Compare, or Trainers).");
  }

  return {
    unitId: input.unitId,
    packageKey,
    enabledBlocks: defaultedBlocks,
    enabledModules,
    allowedCardTypes,
    visibleWebappAreas: buildVisibleWebappAreas(defaultedBlocks, effective),
    allowedOperations: buildAllowedOperations(defaultedBlocks),
    setupRequired,
  };
}

export function validateUnitPackageChange(input: {
  workerConfig?: unknown;
  packageKey?: unknown;
  enabledBlocks?: unknown;
  effectiveCapabilities?: EffectiveUnitCapabilities;
  hasClassScoutDestination?: boolean;
  hasCompareDestination?: boolean;
}): UnitPackageValidationResult {
  const requestedPackageKey = typeof input.packageKey === "string" && isUnitPackageKey(input.packageKey)
    ? input.packageKey
    : normalizeUnitPackageKey(input.workerConfig);
  const packageDefinition = getUnitPackageDefinition(requestedPackageKey);
  const requestedBlocks = normalizeRequestedBlocks(input.enabledBlocks);
  const fallbackCapabilities = input.effectiveCapabilities ?? resolveEffectiveUnitCapabilities({
    workerConfig: input.workerConfig,
    hasClassScoutDestination: input.hasClassScoutDestination,
    hasCompareDestination: input.hasCompareDestination,
    defaultBlocks: packageDefinition.defaultEnabledBlocks,
  });
  const configRecord = asRecord(input.workerConfig);
  const rawUnitCapabilities = asRecord(configRecord?.unitCapabilities);
  const rawBlocks = asRecord(rawUnitCapabilities?.blocks);
  const requestedFromCapabilities = normalizeRequestedBlocks(
    rawBlocks
      ? Object.entries(rawBlocks)
          .filter(([, blockConfig]) => asRecord(blockConfig)?.enabled === true)
          .map(([blockKey]) => blockKey)
      : fallbackCapabilities.enabledBlocks,
  );
  const selectedBlocks = requestedBlocks.length > 0 ? requestedBlocks : requestedFromCapabilities;
  const allowedSet = new Set<BlockKey>(packageDefinition.allowedBlocks);
  const rejectedBlocks = selectedBlocks
    .filter((blockKey) => !allowedSet.has(blockKey))
    .map<UnitPackageValidationIssue>((blockKey) => ({
      code: "block-not-allowed-by-package",
      field: "enabledBlocks",
      message: `Block ${blockKey} is not allowed by package ${requestedPackageKey}.`,
      value: blockKey,
    }));
  const effectiveBlocks = BLOCK_KEYS.filter((blockKey) => allowedSet.has(blockKey) && selectedBlocks.includes(blockKey));
  const defaultedBlocks = effectiveBlocks.length > 0
    ? effectiveBlocks
    : packageDefinition.defaultEnabledBlocks.filter((blockKey) => allowedSet.has(blockKey));
  const setupRequired: string[] = [];
  if (defaultedBlocks.includes("miniapp") && fallbackCapabilities.enabledMiniapps.length === 0) {
    setupRequired.push("Enable at least one Miniapp instance (ClassScout, Compare, or Trainers).");
  }

  return {
    isValid: rejectedBlocks.length === 0,
    packageKey: requestedPackageKey,
    allowedBlocks: [...packageDefinition.allowedBlocks],
    requestedBlocks: selectedBlocks,
    effectiveBlocks: defaultedBlocks,
    rejectedBlocks,
    setupRequired,
  };
}

export function assertUnitPackageRegistryIntegrity(): void {
  if (typedPackages.schemaVersion !== CHECK_FOUNDATION_UNIT_PACKAGES_SCHEMA_VERSION) {
    throw new Error(`Unsupported unit package registry schema: ${typedPackages.schemaVersion}`);
  }

  const seen = new Set<string>();
  const blockDefinitions = new Set(listBlockDefinitions().map((definition) => definition.key));
  for (const definition of typedPackages.packages) {
    if (seen.has(definition.key)) {
      throw new Error(`Duplicate Unit package definition: ${definition.key}`);
    }
    seen.add(definition.key);

    if (!definition.displayName.trim()) {
      throw new Error(`Unit package ${definition.key} is missing displayName`);
    }
    if (!Array.isArray(definition.allowedBlocks) || definition.allowedBlocks.length === 0) {
      throw new Error(`Unit package ${definition.key} is missing allowedBlocks`);
    }
    if (!Array.isArray(definition.defaultEnabledBlocks) || definition.defaultEnabledBlocks.length === 0) {
      throw new Error(`Unit package ${definition.key} is missing defaultEnabledBlocks`);
    }

    for (const blockKey of definition.allowedBlocks) {
      if (!blockDefinitions.has(blockKey)) {
        throw new Error(`Unit package ${definition.key} references unknown block ${blockKey}`);
      }
    }
    for (const blockKey of definition.defaultEnabledBlocks) {
      if (!definition.allowedBlocks.includes(blockKey)) {
        throw new Error(`Unit package ${definition.key} default block ${blockKey} is not allowed`);
      }
    }
  }
}
