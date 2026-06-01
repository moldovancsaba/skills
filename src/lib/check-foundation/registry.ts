import registryData from "./registry-data.json";

export const CHECK_FOUNDATION_REGISTRY_SCHEMA_VERSION = 1 as const;

export const BLOCK_KEYS = ["checklist", "sales", "project", "miniapp"] as const;
export type BlockKey = (typeof BLOCK_KEYS)[number];

export const MODULE_KEYS = [
  "data",
  "topics",
  "goals",
  "review",
  "knowmore",
  "tactical",
  "analytics",
  "aiQueue",
  "checklist",
  "sales",
  "project",
  "miniapp",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type RuntimeOwner = "webapp" | "local" | "shared";

export type BlockDefinition = {
  key: BlockKey;
  displayName: string;
  description: string;
  requiredModules: ModuleKey[];
  optionalModules: ModuleKey[];
  defaultRoute?: string;
  cardTypes: string[];
  publicService: boolean;
  accessibleDescription: string;
};

export type ModuleDefinition = {
  key: ModuleKey;
  displayName: string;
  description: string;
  cardTypes: string[];
  runtimeOwner: RuntimeOwner;
  defaultRoute?: string;
  accessibleDescription: string;
};

type RegistryData = {
  schemaVersion: typeof CHECK_FOUNDATION_REGISTRY_SCHEMA_VERSION;
  blocks: BlockDefinition[];
  modules: ModuleDefinition[];
};

const typedRegistry = registryData as RegistryData;

const blockKeys = new Set<string>(BLOCK_KEYS);
const moduleKeys = new Set<string>(MODULE_KEYS);

export const BLOCK_DEFINITIONS = typedRegistry.blocks;
export const MODULE_DEFINITIONS = typedRegistry.modules;

const blockDefinitionByKey = new Map<BlockKey, BlockDefinition>(
  BLOCK_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const moduleDefinitionByKey = new Map<ModuleKey, ModuleDefinition>(
  MODULE_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function isBlockKey(value: string): value is BlockKey {
  return blockKeys.has(value);
}

export function isModuleKey(value: string): value is ModuleKey {
  return moduleKeys.has(value);
}

export function assertKnownBlock(value: string): asserts value is BlockKey {
  if (!isBlockKey(value)) {
    throw new Error(`Unknown Block key: ${value}`);
  }
}

export function assertKnownModule(value: string): asserts value is ModuleKey {
  if (!isModuleKey(value)) {
    throw new Error(`Unknown Module key: ${value}`);
  }
}

export function listBlockDefinitions(): BlockDefinition[] {
  return [...BLOCK_DEFINITIONS];
}

export function listModuleDefinitions(): ModuleDefinition[] {
  return [...MODULE_DEFINITIONS];
}

export function getBlockDefinition(key: BlockKey): BlockDefinition {
  const definition = blockDefinitionByKey.get(key);
  if (!definition) {
    throw new Error(`Missing Block definition for key: ${key}`);
  }
  return definition;
}

export function getModuleDefinition(key: ModuleKey): ModuleDefinition {
  const definition = moduleDefinitionByKey.get(key);
  if (!definition) {
    throw new Error(`Missing Module definition for key: ${key}`);
  }
  return definition;
}

export function getRequiredModulesForBlocks(keys: BlockKey[]): ModuleKey[] {
  const seen = new Set<ModuleKey>();
  const required: ModuleKey[] = [];

  for (const key of keys) {
    const definition = getBlockDefinition(key);
    for (const moduleKey of definition.requiredModules) {
      if (!seen.has(moduleKey)) {
        seen.add(moduleKey);
        required.push(moduleKey);
      }
    }
  }

  return required;
}

export function getOptionalModulesForBlocks(keys: BlockKey[]): ModuleKey[] {
  const required = new Set(getRequiredModulesForBlocks(keys));
  const seen = new Set<ModuleKey>();
  const optional: ModuleKey[] = [];

  for (const key of keys) {
    const definition = getBlockDefinition(key);
    for (const moduleKey of definition.optionalModules) {
      if (!required.has(moduleKey) && !seen.has(moduleKey)) {
        seen.add(moduleKey);
        optional.push(moduleKey);
      }
    }
  }

  return optional;
}

export function listCardTypesForBlocks(keys: BlockKey[]): string[] {
  const seen = new Set<string>();
  const cardTypes: string[] = [];

  for (const key of keys) {
    const definition = getBlockDefinition(key);
    for (const cardType of definition.cardTypes) {
      if (!seen.has(cardType)) {
        seen.add(cardType);
        cardTypes.push(cardType);
      }
    }
  }

  return cardTypes;
}

export function assertRegistryIntegrity(): void {
  if (typedRegistry.schemaVersion !== CHECK_FOUNDATION_REGISTRY_SCHEMA_VERSION) {
    throw new Error(`Unsupported check foundation registry schema: ${typedRegistry.schemaVersion}`);
  }

  const moduleDefinitionKeys = new Set(MODULE_DEFINITIONS.map((definition) => definition.key));
  for (const key of MODULE_KEYS) {
    if (!moduleDefinitionKeys.has(key)) {
      throw new Error(`Missing Module definition: ${key}`);
    }
  }

  const blockDefinitionKeys = new Set(BLOCK_DEFINITIONS.map((definition) => definition.key));
  for (const key of BLOCK_KEYS) {
    if (!blockDefinitionKeys.has(key)) {
      throw new Error(`Missing Block definition: ${key}`);
    }
  }

  for (const definition of BLOCK_DEFINITIONS) {
    for (const moduleKey of [...definition.requiredModules, ...definition.optionalModules]) {
      if (!moduleDefinitionKeys.has(moduleKey)) {
        throw new Error(`Block ${definition.key} references unknown Module: ${moduleKey}`);
      }
    }
    if (!definition.accessibleDescription.trim()) {
      throw new Error(`Block ${definition.key} is missing an accessible description`);
    }
  }

  for (const definition of MODULE_DEFINITIONS) {
    if (!definition.accessibleDescription.trim()) {
      throw new Error(`Module ${definition.key} is missing an accessible description`);
    }
  }
}
