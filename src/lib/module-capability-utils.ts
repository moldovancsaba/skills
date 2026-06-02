import { getOptionalModulesForBlocks, getRequiredModulesForBlocks, isBlockKey, type BlockKey, type ModuleKey } from "@/lib/check-foundation/registry";
import type { UnitModuleKey } from "@/lib/intelligence-unit-capabilities";

const CANONICAL_TO_LEGACY_MODULE: Partial<Record<ModuleKey, UnitModuleKey>> = {
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function resolveBlockAllowedModules(enabledBlocks: string[]): Set<string> {
  const blockKeys = enabledBlocks.filter((key): key is BlockKey => isBlockKey(key));
  if (blockKeys.length === 0) return new Set<string>();

  return new Set([
    ...getRequiredModulesForBlocks(blockKeys),
    ...getOptionalModulesForBlocks(blockKeys),
  ]);
}

export function resolveEnabledLegacyModules(input: {
  enabledModules?: unknown;
  enabledBlocks?: unknown;
}): UnitModuleKey[] {
  const enabledModules = asStringArray(input.enabledModules);
  const enabledBlocks = asStringArray(input.enabledBlocks);
  const blockAllowedModules = resolveBlockAllowedModules(enabledBlocks);

  const result = new Set<UnitModuleKey>();
  for (const canonicalModuleKey of enabledModules) {
    const legacyKey = CANONICAL_TO_LEGACY_MODULE[canonicalModuleKey as ModuleKey];
    if (!legacyKey) continue;
    if (blockAllowedModules.size > 0 && !blockAllowedModules.has(canonicalModuleKey as ModuleKey)) {
      continue;
    }
    result.add(legacyKey);
  }

  return Array.from(result);
}

