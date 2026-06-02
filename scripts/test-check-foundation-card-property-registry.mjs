import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const propertyRegistry = JSON.parse(
  readFileSync(join(ROOT, "src/lib/check-foundation/card-property-registry-data.json"), "utf8"),
);
const cardRegistry = JSON.parse(readFileSync(join(ROOT, "src/lib/check-foundation/card-registry-data.json"), "utf8"));
const miniappRegistry = JSON.parse(
  readFileSync(join(ROOT, "src/lib/check-foundation/miniapp-registry-data.json"), "utf8"),
);
const prismaSchema = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");

const allowedValueTypes = new Set(["string", "text", "number", "boolean", "enum", "url", "object", "string[]"]);
const visitorPrimitives = new Set([
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
]);
const requiredCanonicalProperties = [
  "title",
  "description",
  "category",
  "status",
  "evidence",
  "source",
  "score",
  "contact",
  "location",
  "publish",
];
const oldMiniappCardType = ["miniapp", "Packet"].join("");
const obsoleteTokens = [
  oldMiniappCardType,
  ["Miniapp", "Packet"].join(" "),
  ["miniapp", "packet"].join(" "),
  ["miniapp", "packet"].join("_"),
  ["miniapp", "packet"].join("."),
];
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function unique(values) {
  return [...new Set(values)];
}

function assertUnique(values, scope) {
  assert(values.length === unique(values).length, `${scope} must not contain duplicates`);
}

function assertPropertyList(values, propertyKeys, scope) {
  assert(Array.isArray(values), `${scope} must be an array`);
  if (!Array.isArray(values)) return;
  assertUnique(values, scope);
  for (const key of values) {
    assert(propertyKeys.has(key), `${scope} references unknown property: ${key}`);
  }
}

function parsePrismaModels(schemaSource) {
  return new Set([...schemaSource.matchAll(/^model\s+(\w+)\s*{/gm)].map((match) => match[1]));
}

function getPrismaModelBody(schemaSource, modelName) {
  const modelStart = schemaSource.indexOf(`model ${modelName} {`);
  if (modelStart < 0) return null;
  const bodyStart = schemaSource.indexOf("{", modelStart) + 1;
  let depth = 1;
  for (let index = bodyStart; index < schemaSource.length; index += 1) {
    if (schemaSource[index] === "{") depth += 1;
    if (schemaSource[index] === "}") {
      depth -= 1;
      if (depth === 0) return schemaSource.slice(bodyStart, index);
    }
  }
  return null;
}

function parsePrismaStoredFields(schemaSource, modelNames, modelName) {
  const body = getPrismaModelBody(schemaSource, modelName);
  assert(body !== null, `storage model missing from Prisma schema: ${modelName}`);
  if (body === null) return [];

  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => {
      const [name, rawType] = line.split(/\s+/);
      const type = String(rawType || "").replace(/[?\[\]]/g, "");
      return { name, type, raw: line };
    })
    .filter((field) => /^[A-Za-z_]\w*$/.test(field.name) && field.type)
    .filter((field) => !modelNames.has(field.type) && !field.raw.includes("@relation"));
}

function storageFieldRoot(storageField) {
  const parts = String(storageField).split(".");
  if (parts.length >= 2 && /^[A-Z]/.test(parts[0])) return parts[1];
  return parts[0];
}

assert(propertyRegistry.schemaVersion === 1, "property registry schemaVersion must be 1");
assert(Array.isArray(propertyRegistry.propertyDefinitions), "propertyDefinitions must be an array");
assert(Array.isArray(propertyRegistry.cardProfiles), "cardProfiles must be an array");
assert(Array.isArray(propertyRegistry.contentProfiles), "contentProfiles must be an array");

const propertyKeys = new Set();
for (const definition of propertyRegistry.propertyDefinitions ?? []) {
  assert(definition.key?.trim(), "property definition key is required");
  assert(!propertyKeys.has(definition.key), `duplicate property definition: ${definition.key}`);
  propertyKeys.add(definition.key);
  assert(allowedValueTypes.has(definition.valueType), `${definition.key} has invalid valueType: ${definition.valueType}`);
  assert(definition.description?.trim(), `${definition.key} must have a description`);
}

for (const requiredProperty of requiredCanonicalProperties) {
  assert(propertyKeys.has(requiredProperty), `missing canonical property: ${requiredProperty}`);
}

const registryCardTypes = new Set((cardRegistry.cards ?? []).map((card) => card.cardType));
const profileCardTypes = new Set();
const prismaModelNames = parsePrismaModels(prismaSchema);
for (const profile of propertyRegistry.cardProfiles ?? []) {
  assert(registryCardTypes.has(profile.cardType), `property profile uses unknown cardType: ${profile.cardType}`);
  assert(!profileCardTypes.has(profile.cardType), `duplicate property profile for cardType: ${profile.cardType}`);
  profileCardTypes.add(profile.cardType);
  assert(Array.isArray(profile.storageModels) && profile.storageModels.length > 0, `${profile.cardType} needs storageModels`);
  assertUnique(profile.storageModels ?? [], `${profile.cardType}.storageModels`);
  assertPropertyList(profile.requiredProperties, propertyKeys, `${profile.cardType}.requiredProperties`);
  assertPropertyList(profile.summaryProperties, propertyKeys, `${profile.cardType}.summaryProperties`);
  assertPropertyList(profile.detailProperties, propertyKeys, `${profile.cardType}.detailProperties`);
  assertPropertyList(profile.internalProperties, propertyKeys, `${profile.cardType}.internalProperties`);

  const mappedProperties = new Set(Object.keys(profile.fieldMap ?? {}));
  const mappedStorageFields = new Map();
  const mappedStorageFieldRoots = new Set();
  for (const key of mappedProperties) {
    assert(propertyKeys.has(key), `${profile.cardType}.fieldMap references unknown property: ${key}`);
    const storageFields = profile.fieldMap[key];
    assert(Array.isArray(storageFields) && storageFields.length > 0, `${profile.cardType}.fieldMap.${key} needs fields`);
    assertUnique(storageFields ?? [], `${profile.cardType}.fieldMap.${key}`);
    for (const storageField of storageFields ?? []) {
      mappedStorageFieldRoots.add(storageFieldRoot(storageField));
      const existingProperty = mappedStorageFields.get(storageField);
      assert(
        !existingProperty,
        `${profile.cardType} maps raw storage field ${storageField} to both ${existingProperty} and ${key}`,
      );
      mappedStorageFields.set(storageField, key);
    }
  }
  const declaredVisibleProperties = unique([
    ...(profile.requiredProperties ?? []),
    ...(profile.summaryProperties ?? []),
    ...(profile.detailProperties ?? []),
  ]);
  for (const key of declaredVisibleProperties) {
    assert(mappedProperties.has(key), `${profile.cardType} declares visible property without fieldMap: ${key}`);
  }
  for (const storageModel of profile.storageModels ?? []) {
    for (const field of parsePrismaStoredFields(prismaSchema, prismaModelNames, storageModel)) {
      assert(
        mappedStorageFieldRoots.has(field.name),
        `${profile.cardType} storage field is not mapped to a canonical property: ${storageModel}.${field.name}`,
      );
    }
  }
}

for (const cardType of registryCardTypes) {
  assert(profileCardTypes.has(cardType), `missing property profile for cardType: ${cardType}`);
}

assert(profileCardTypes.has("miniappcard"), "miniappcard property profile is required");
assert(!profileCardTypes.has(oldMiniappCardType), "obsolete miniapp card profile must not exist");

const supportedContentTypes = new Set(
  (miniappRegistry.miniapps ?? []).flatMap((miniapp) => miniapp.supportedContentTypes ?? []),
);
const contentProfileTypes = new Set();
const miniappProfile = (propertyRegistry.cardProfiles ?? []).find((profile) => profile.cardType === "miniappcard");
const miniappMappedProperties = new Set(Object.keys(miniappProfile?.fieldMap ?? {}));
for (const profile of propertyRegistry.contentProfiles ?? []) {
  assert(supportedContentTypes.has(profile.contentType), `content profile uses unknown contentType: ${profile.contentType}`);
  assert(!contentProfileTypes.has(profile.contentType), `duplicate content profile for contentType: ${profile.contentType}`);
  contentProfileTypes.add(profile.contentType);
  assert(profile.extendsCardType === "miniappcard", `${profile.contentType} must extend miniappcard`);
  assert(Array.isArray(profile.allowedCategories) && profile.allowedCategories.length > 0, `${profile.contentType} needs categories`);
  assertUnique(profile.allowedCategories ?? [], `${profile.contentType}.allowedCategories`);
  assert(Array.isArray(profile.allowedPrimitives) && profile.allowedPrimitives.length > 0, `${profile.contentType} needs primitives`);
  assertUnique(profile.allowedPrimitives ?? [], `${profile.contentType}.allowedPrimitives`);
  for (const primitive of profile.allowedPrimitives ?? []) {
    assert(visitorPrimitives.has(primitive), `${profile.contentType} has unknown primitive: ${primitive}`);
  }
  assertPropertyList(profile.enabledProperties, propertyKeys, `${profile.contentType}.enabledProperties`);
  assertPropertyList(profile.publicSummaryProperties, propertyKeys, `${profile.contentType}.publicSummaryProperties`);
  for (const key of profile.enabledProperties ?? []) {
    assert(miniappMappedProperties.has(key), `${profile.contentType} enables property without miniappcard fieldMap: ${key}`);
  }
  for (const key of profile.publicSummaryProperties ?? []) {
    assert((profile.enabledProperties ?? []).includes(key), `${profile.contentType} summary property is not enabled: ${key}`);
  }
}

for (const contentType of supportedContentTypes) {
  assert(contentProfileTypes.has(contentType), `missing content property profile for miniapp contentType: ${contentType}`);
}

const serialized = JSON.stringify({ propertyRegistry, cardRegistry, miniappRegistry });
for (const token of obsoleteTokens) {
  assert(!serialized.includes(token), `obsolete token must not remain in registries: ${token}`);
}

if (failures.length > 0) {
  console.error("check foundation card property registry contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check foundation card property registry contract passed.");
