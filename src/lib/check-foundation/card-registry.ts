import cardRegistryData from "./card-registry-data.json";
import type { BlockKey, ModuleKey } from "./registry";
import { isBlockKey, isModuleKey } from "./registry";

export const CHECK_FOUNDATION_CARD_REGISTRY_SCHEMA_VERSION = 1 as const;

export const CARD_TYPES = [
  "datacard",
  "topiccard",
  "goalcard",
  "reviewcard",
  "flashcard",
  "taskcard",
  "opportunitycard",
  "projectcard",
  "logiccard",
  "miniappPacket",
] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type CardScoringMode = "none" | "ice" | "priorityProfile" | "custom";

export type CardDefinition = {
  cardType: CardType;
  displayName: string;
  owningBlock?: BlockKey;
  owningModule: ModuleKey;
  lifecycleStates: string[];
  scoring: CardScoringMode;
  evidenceRequired: boolean;
  lineageRequired: boolean;
  allowedBoards: string[];
  accessibleDescription: string;
};

type CardRegistryData = {
  schemaVersion: typeof CHECK_FOUNDATION_CARD_REGISTRY_SCHEMA_VERSION;
  cards: CardDefinition[];
};

const typedRegistryData = cardRegistryData as CardRegistryData;
const knownCardTypes = new Set<string>(CARD_TYPES);

export const CARD_DEFINITIONS = typedRegistryData.cards;

const cardDefinitionByType = new Map<CardType, CardDefinition>(
  CARD_DEFINITIONS.map((definition) => [definition.cardType, definition]),
);

export function isCardType(value: string): value is CardType {
  return knownCardTypes.has(value);
}

export function assertKnownCardType(value: string): asserts value is CardType {
  if (!isCardType(value)) {
    throw new Error(`Unknown Card type: ${value}`);
  }
}

export function listCardDefinitions(): CardDefinition[] {
  return [...CARD_DEFINITIONS];
}

export function getCardDefinition(cardType: CardType): CardDefinition {
  const definition = cardDefinitionByType.get(cardType);
  if (!definition) {
    throw new Error(`Missing Card definition for type: ${cardType}`);
  }
  return definition;
}

export function assertCardAllowedForBlock(cardType: CardType, blockKey: BlockKey): void {
  const definition = getCardDefinition(cardType);
  if (definition.owningBlock && definition.owningBlock !== blockKey) {
    throw new Error(`Card type "${cardType}" is not allowed in Block "${blockKey}"`);
  }
}

export function getCardAccessibleLabel(cardType: CardType): string {
  return getCardDefinition(cardType).accessibleDescription;
}

export function assertCardRegistryIntegrity(): void {
  if (typedRegistryData.schemaVersion !== CHECK_FOUNDATION_CARD_REGISTRY_SCHEMA_VERSION) {
    throw new Error(`Unsupported card registry schema version: ${typedRegistryData.schemaVersion}`);
  }

  const seen = new Set<string>();
  for (const definition of CARD_DEFINITIONS) {
    if (seen.has(definition.cardType)) {
      throw new Error(`Duplicate Card definition: ${definition.cardType}`);
    }
    seen.add(definition.cardType);

    if (!isCardType(definition.cardType)) {
      throw new Error(`Card registry includes unknown Card type: ${definition.cardType}`);
    }
    if (!isModuleKey(definition.owningModule)) {
      throw new Error(`Card ${definition.cardType} references unknown Module: ${definition.owningModule}`);
    }
    if (definition.owningBlock && !isBlockKey(definition.owningBlock)) {
      throw new Error(`Card ${definition.cardType} references unknown Block: ${definition.owningBlock}`);
    }
    if (!definition.displayName.trim()) {
      throw new Error(`Card ${definition.cardType} is missing displayName`);
    }
    if (!definition.accessibleDescription.trim()) {
      throw new Error(`Card ${definition.cardType} is missing accessibleDescription`);
    }
    if (!Array.isArray(definition.lifecycleStates) || definition.lifecycleStates.length === 0) {
      throw new Error(`Card ${definition.cardType} is missing lifecycle states`);
    }
    if (!Array.isArray(definition.allowedBoards) || definition.allowedBoards.length === 0) {
      throw new Error(`Card ${definition.cardType} is missing allowed board metadata`);
    }
  }

  for (const cardType of CARD_TYPES) {
    if (!seen.has(cardType)) {
      throw new Error(`Missing Card definition for required type: ${cardType}`);
    }
  }
}
