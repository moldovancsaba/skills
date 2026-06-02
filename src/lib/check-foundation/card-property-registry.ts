import propertyRegistryData from "./card-property-registry-data.json";
import { CARD_TYPES, type CardType } from "./card-registry";

export const CHECK_FOUNDATION_CARD_PROPERTY_REGISTRY_SCHEMA_VERSION = 1 as const;

export const CARD_PROPERTY_VISITOR_CONTENT_PRIMITIVES = [
  "venue",
  "program",
  "course",
  "event",
  "series",
  "camp",
  "competition",
  "community",
  "exhibition",
  "service",
  "resource",
  "source-only",
] as const;

export const CARD_PROPERTY_VALUE_TYPES = [
  "string",
  "text",
  "number",
  "boolean",
  "enum",
  "url",
  "object",
  "string[]",
] as const;

export type CardPropertyValueType = (typeof CARD_PROPERTY_VALUE_TYPES)[number];
export type CardPropertyVisitorContentPrimitive = (typeof CARD_PROPERTY_VISITOR_CONTENT_PRIMITIVES)[number];

export type CardPropertyDefinition = {
  key: string;
  valueType: CardPropertyValueType;
  description: string;
};

export type CardPropertyProfile = {
  cardType: CardType;
  storageModels: string[];
  requiredProperties: string[];
  summaryProperties: string[];
  detailProperties: string[];
  internalProperties: string[];
  fieldMap: Record<string, string[]>;
};

export type MiniappContentPropertyProfile = {
  contentType: string;
  extendsCardType: CardType;
  allowedCategories: string[];
  allowedPrimitives: CardPropertyVisitorContentPrimitive[];
  enabledProperties: string[];
  publicSummaryProperties: string[];
};

type CardPropertyRegistryData = {
  schemaVersion: typeof CHECK_FOUNDATION_CARD_PROPERTY_REGISTRY_SCHEMA_VERSION;
  propertyDefinitions: CardPropertyDefinition[];
  cardProfiles: CardPropertyProfile[];
  contentProfiles: MiniappContentPropertyProfile[];
};

const typedRegistryData = propertyRegistryData as unknown as CardPropertyRegistryData;
const allowedValueTypes = new Set<string>(CARD_PROPERTY_VALUE_TYPES);
const knownCardTypes = new Set<string>(CARD_TYPES);
const knownVisitorPrimitives = new Set<string>(CARD_PROPERTY_VISITOR_CONTENT_PRIMITIVES);

export const CARD_PROPERTY_DEFINITIONS = typedRegistryData.propertyDefinitions;
export const CARD_PROPERTY_PROFILES = typedRegistryData.cardProfiles;
export const MINIAPP_CONTENT_PROPERTY_PROFILES = typedRegistryData.contentProfiles;

export function listCardPropertyDefinitions(): CardPropertyDefinition[] {
  return [...CARD_PROPERTY_DEFINITIONS];
}

export function listCardPropertyProfiles(): CardPropertyProfile[] {
  return [...CARD_PROPERTY_PROFILES];
}

export function listMiniappContentPropertyProfiles(): MiniappContentPropertyProfile[] {
  return [...MINIAPP_CONTENT_PROPERTY_PROFILES];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function assertKnownProperty(propertyKey: string, propertyKeys: Set<string>, scope: string) {
  if (!propertyKeys.has(propertyKey)) {
    throw new Error(`${scope} references unknown card property "${propertyKey}"`);
  }
}

function assertPropertyList(values: string[], propertyKeys: Set<string>, scope: string) {
  if (!Array.isArray(values)) {
    throw new Error(`${scope} must be an array`);
  }
  if (values.length !== unique(values).length) {
    throw new Error(`${scope} contains duplicate property keys`);
  }
  for (const propertyKey of values) {
    assertKnownProperty(propertyKey, propertyKeys, scope);
  }
}

export function assertCardPropertyRegistryIntegrity(): void {
  if (typedRegistryData.schemaVersion !== CHECK_FOUNDATION_CARD_PROPERTY_REGISTRY_SCHEMA_VERSION) {
    throw new Error(`Unsupported card property registry schema version: ${typedRegistryData.schemaVersion}`);
  }

  const propertyKeys = new Set<string>();
  for (const definition of CARD_PROPERTY_DEFINITIONS) {
    if (!definition.key.trim()) throw new Error("Card property definition key is required");
    if (propertyKeys.has(definition.key)) throw new Error(`Duplicate card property definition: ${definition.key}`);
    propertyKeys.add(definition.key);
    if (!allowedValueTypes.has(definition.valueType)) {
      throw new Error(`Card property ${definition.key} has invalid valueType ${definition.valueType}`);
    }
    if (!definition.description.trim()) {
      throw new Error(`Card property ${definition.key} is missing description`);
    }
  }

  const profileCardTypes = new Set<string>();
  for (const profile of CARD_PROPERTY_PROFILES) {
    if (!knownCardTypes.has(profile.cardType)) {
      throw new Error(`Card property profile references unknown cardType ${profile.cardType}`);
    }
    if (profileCardTypes.has(profile.cardType)) {
      throw new Error(`Duplicate card property profile for ${profile.cardType}`);
    }
    profileCardTypes.add(profile.cardType);
    if (!Array.isArray(profile.storageModels) || profile.storageModels.length === 0) {
      throw new Error(`Card property profile ${profile.cardType} must declare storageModels`);
    }
    assertPropertyList(profile.requiredProperties, propertyKeys, `${profile.cardType}.requiredProperties`);
    assertPropertyList(profile.summaryProperties, propertyKeys, `${profile.cardType}.summaryProperties`);
    assertPropertyList(profile.detailProperties, propertyKeys, `${profile.cardType}.detailProperties`);
    assertPropertyList(profile.internalProperties, propertyKeys, `${profile.cardType}.internalProperties`);
    for (const [propertyKey, storageFields] of Object.entries(profile.fieldMap)) {
      assertKnownProperty(propertyKey, propertyKeys, `${profile.cardType}.fieldMap`);
      if (!Array.isArray(storageFields) || storageFields.length === 0) {
        throw new Error(`${profile.cardType}.fieldMap.${propertyKey} must declare storage fields`);
      }
      if (storageFields.length !== unique(storageFields).length) {
        throw new Error(`${profile.cardType}.fieldMap.${propertyKey} contains duplicate storage fields`);
      }
    }
  }

  for (const cardType of CARD_TYPES) {
    if (!profileCardTypes.has(cardType)) {
      throw new Error(`Missing card property profile for required cardType ${cardType}`);
    }
  }

  const contentTypes = new Set<string>();
  for (const profile of MINIAPP_CONTENT_PROPERTY_PROFILES) {
    if (!profile.contentType.trim()) throw new Error("Miniapp content property profile contentType is required");
    if (contentTypes.has(profile.contentType)) {
      throw new Error(`Duplicate miniapp content property profile: ${profile.contentType}`);
    }
    contentTypes.add(profile.contentType);
    if (profile.extendsCardType !== "miniappcard") {
      throw new Error(`${profile.contentType} must extend miniappcard`);
    }
    if (!profile.allowedCategories.length) {
      throw new Error(`${profile.contentType} must declare allowedCategories`);
    }
    for (const primitive of profile.allowedPrimitives) {
      if (!knownVisitorPrimitives.has(primitive)) {
        throw new Error(`${profile.contentType} references unknown visitor primitive ${primitive}`);
      }
    }
    assertPropertyList(profile.enabledProperties, propertyKeys, `${profile.contentType}.enabledProperties`);
    assertPropertyList(profile.publicSummaryProperties, propertyKeys, `${profile.contentType}.publicSummaryProperties`);
  }
}
