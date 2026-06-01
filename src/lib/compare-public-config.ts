import comparePublicCopy from "@/config/compare-public-copy.json";
import { canonicalizeAllowedLanguagesForStorage } from "@/lib/language-catalog";
import { getMiniappDefinition } from "@/lib/check-foundation/miniapp-registry";
import { prisma } from "@/lib/db";

import { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

export type ComparePublicI18nDict = Record<string, string>;
export type ComparePublicI18nCopyMap = Record<string, ComparePublicI18nDict>;

export type ComparePublicRuntimeConfig = {
  publicCopy: ComparePublicI18nCopyMap;
  publicLocales: string[];
  publicDefaultLocale: string;
  guides: unknown[];
  locationHeroImages: unknown[];
  homeHeroUrl: string;
  discoverHeroUrl: string;
  publicCopyMaintainedAt: string;
  publicCopyMaintainedBy: string;
};

export type ComparePublicPatchInput = Partial<{
  publicCopy: ComparePublicI18nCopyMap;
  publicLocales: string[];
  publicDefaultLocale: string;
  guides: unknown[];
  locationHeroImages: unknown[];
  homeHeroUrl: string;
  discoverHeroUrl: string;
  publicCopyMaintainedAt: string;
  publicCopyMaintainedBy: string;
}>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
}

function normalizeUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value.filter((entry) => entry !== undefined && entry !== null) : [];
}

function normalizeCopyMap(value: unknown): ComparePublicI18nCopyMap {
  const raw = asRecord(value);
  if (!raw) return {};
  const next: ComparePublicI18nCopyMap = {};
  for (const [locale, localeCopyRaw] of Object.entries(raw)) {
    const localeCopy = asRecord(localeCopyRaw);
    if (!localeCopy) continue;
    const copied: ComparePublicI18nDict = {};
    for (const [key, localizedValue] of Object.entries(localeCopy)) {
      const text = asString(localizedValue);
      if (text.length > 0) copied[key] = text;
    }
    if (Object.keys(copied).length > 0) {
      next[locale.toLowerCase()] = copied;
    }
  }
  return next;
}

function mergeCopyMaps(base: ComparePublicI18nCopyMap, incoming?: ComparePublicI18nCopyMap): ComparePublicI18nCopyMap {
  if (!incoming) return base;
  const next: ComparePublicI18nCopyMap = { ...base };
  for (const [locale, entries] of Object.entries(incoming)) {
    const safeLocale = asString(locale).toLowerCase();
    if (!safeLocale) continue;
    const existingLocale = next[safeLocale];
    const safeExistingLocale = typeof existingLocale === "object" && !Array.isArray(existingLocale)
      ? existingLocale
      : {};
    next[safeLocale] = {
      ...safeExistingLocale,
      ...normalizeCopyMap(entries),
    } as ComparePublicI18nDict;
  }
  return next;
}

function nowIso() {
  return new Date().toISOString();
}

const compareMiniappDefinition = getMiniappDefinition("compare");
const compareDefaultLocales = compareMiniappDefinition.availableLocales.map((locale) => locale);
const compareDefaultLocale = compareMiniappDefinition.defaultLocale;

function readComparePublicConfigFromInstance(config: Prisma.JsonValue | null | undefined): Partial<ComparePublicRuntimeConfig> {
  const root = asRecord(config) ?? {};
  const miniapps = asRecord(root.miniapps) ?? {};
  const compare = asRecord(miniapps.compare) ?? {};
  const publicConfig = asRecord(compare.public) ?? {};
  return {
    publicCopy: normalizeCopyMap(publicConfig.publicCopy),
    publicLocales: normalizeStringArray(publicConfig.publicLocales),
    publicDefaultLocale: asString(publicConfig.publicDefaultLocale),
    guides: normalizeUnknownArray(publicConfig.guides),
    locationHeroImages: normalizeUnknownArray(publicConfig.locationHeroImages),
    homeHeroUrl: asString(publicConfig.homeHeroUrl),
    discoverHeroUrl: asString(publicConfig.discoverHeroUrl),
    publicCopyMaintainedAt: asString(publicConfig.publicCopyMaintainedAt),
    publicCopyMaintainedBy: asString(publicConfig.publicCopyMaintainedBy) || "CHECK Local",
  };
}

export function hasStoredComparePublicConfig(storage: Partial<ComparePublicRuntimeConfig>) {
  return (
    Boolean(storage.publicCopy && Object.keys(storage.publicCopy).length > 0)
    || Boolean(storage.publicLocales && storage.publicLocales.length)
    || Boolean(storage.publicDefaultLocale)
    || Boolean(storage.guides && storage.guides.length)
    || Boolean(storage.locationHeroImages && storage.locationHeroImages.length)
    || Boolean(storage.homeHeroUrl)
    || Boolean(storage.discoverHeroUrl)
  );
}

function applyDefaults(input: Partial<ComparePublicRuntimeConfig>): ComparePublicRuntimeConfig {
  const publicCopy = Object.keys(input.publicCopy ?? {}).length > 0
    ? input.publicCopy as ComparePublicI18nCopyMap
    : (comparePublicCopy as ComparePublicI18nCopyMap);
  const publicLocales = canonicalizeAllowedLanguagesForStorage(input.publicLocales && input.publicLocales.length
    ? input.publicLocales
    : compareDefaultLocales) as string[];
  const validatedDefaultLocale = asString(input.publicDefaultLocale) || compareDefaultLocale;
  const defaultLocale = publicLocales.includes(validatedDefaultLocale) ? validatedDefaultLocale : compareDefaultLocale;
  const normalizedDefault = publicLocales.includes(defaultLocale) ? defaultLocale : compareDefaultLocale;

  return {
    publicCopy,
    publicLocales: publicLocales.length > 0 ? publicLocales : [...compareDefaultLocales],
    publicDefaultLocale: normalizedDefault,
    guides: Array.isArray(input.guides) ? input.guides : [],
    locationHeroImages: Array.isArray(input.locationHeroImages) ? input.locationHeroImages : [],
    homeHeroUrl: asString(input.homeHeroUrl),
    discoverHeroUrl: asString(input.discoverHeroUrl),
    publicCopyMaintainedAt: asString(input.publicCopyMaintainedAt) || nowIso(),
    publicCopyMaintainedBy: asString(input.publicCopyMaintainedBy) || "CHECK Local",
  };
}

function writeConfigToInstanceRoot(config: Prisma.JsonValue | null | undefined, compareConfig: ComparePublicRuntimeConfig) {
  const root = asRecord(config) ?? {};
  const miniapps = asRecord(root.miniapps) ?? {};
  const compare = asRecord(miniapps.compare) ?? {};
  miniapps.compare = {
    ...compare,
    public: {
      ...(asRecord(compare.public) ?? {}),
      publicCopy: compareConfig.publicCopy,
      publicLocales: compareConfig.publicLocales,
      publicDefaultLocale: compareConfig.publicDefaultLocale,
      guides: compareConfig.guides,
      locationHeroImages: compareConfig.locationHeroImages,
      homeHeroUrl: compareConfig.homeHeroUrl,
      discoverHeroUrl: compareConfig.discoverHeroUrl,
      publicCopyMaintainedAt: compareConfig.publicCopyMaintainedAt,
      publicCopyMaintainedBy: compareConfig.publicCopyMaintainedBy,
    },
  };
  root.miniapps = miniapps;
  return root as Prisma.InputJsonValue;
}

export async function getActiveComparePublicConfig(companyId: string): Promise<ComparePublicRuntimeConfig> {
  const instance = await prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey: "compare", isActive: true },
    select: { config: true },
  });
  if (!instance) {
    throw new Error("Compare destination instance is not active.");
  }

  const stored = readComparePublicConfigFromInstance(instance.config);
  return applyDefaults(stored);
}

export async function buildComparePublicI18nPatch(companyId: string, now = new Date()) {
  const config = await getActiveComparePublicConfig(companyId);
  return {
    publicCopy: config.publicCopy,
    publicLocales: config.publicLocales,
    publicDefaultLocale: config.publicDefaultLocale,
    publicCopyMaintainedAt: config.publicCopyMaintainedAt || now.toISOString(),
    publicCopyMaintainedBy: config.publicCopyMaintainedBy || "CHECK Local",
    guides: config.guides,
    locationHeroImages: config.locationHeroImages,
    homeHeroUrl: config.homeHeroUrl,
    discoverHeroUrl: config.discoverHeroUrl,
  };
}

function normalizePatchInput(raw: Partial<ComparePublicPatchInput>): ComparePublicPatchInput {
  const next: ComparePublicPatchInput = {};
  if (raw.publicCopy && typeof raw.publicCopy === "object" && !Array.isArray(raw.publicCopy)) {
    next.publicCopy = mergeCopyMaps({}, normalizeCopyMap(raw.publicCopy));
  }
  if (Array.isArray(raw.publicLocales)) {
    next.publicLocales = canonicalizeAllowedLanguagesForStorage(raw.publicLocales as string[]);
  }
  const defaultLocale = asString(raw.publicDefaultLocale);
  if (defaultLocale) {
    next.publicDefaultLocale = defaultLocale.toLowerCase();
  }
  if (Array.isArray(raw.guides)) {
    next.guides = raw.guides.slice();
  }
  if (Array.isArray(raw.locationHeroImages)) {
    next.locationHeroImages = raw.locationHeroImages.slice();
  }
  const homeHeroUrl = asString(raw.homeHeroUrl);
  if (homeHeroUrl) next.homeHeroUrl = homeHeroUrl;
  const discoverHeroUrl = asString(raw.discoverHeroUrl);
  if (discoverHeroUrl) next.discoverHeroUrl = discoverHeroUrl;
  const maintainedBy = asString(raw.publicCopyMaintainedBy);
  if (maintainedBy) next.publicCopyMaintainedBy = maintainedBy;
  const maintainedAt = asString(raw.publicCopyMaintainedAt);
  if (maintainedAt) next.publicCopyMaintainedAt = maintainedAt;

  return next;
}

export async function upsertComparePublicConfig(
  companyId: string,
  patch: ComparePublicPatchInput,
  actor: { email: string },
): Promise<ComparePublicRuntimeConfig> {
  const instance = await prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey: "compare", isActive: true },
    select: { id: true, config: true },
  });
  if (!instance) {
    throw new Error("Compare destination instance is not active.");
  }

  const stored = readComparePublicConfigFromInstance(instance.config);
  const base = applyDefaults(stored);

  const normalized = normalizePatchInput(patch);
  const next: ComparePublicRuntimeConfig = {
    ...base,
    publicCopy: normalized.publicCopy ? mergeCopyMaps(base.publicCopy, normalized.publicCopy) : base.publicCopy,
    publicLocales: normalized.publicLocales && normalized.publicLocales.length > 0
      ? normalized.publicLocales
      : base.publicLocales,
    publicDefaultLocale: normalized.publicDefaultLocale || base.publicDefaultLocale,
    guides: Array.isArray(normalized.guides) ? normalized.guides : base.guides,
    locationHeroImages: Array.isArray(normalized.locationHeroImages) ? normalized.locationHeroImages : base.locationHeroImages,
    homeHeroUrl: typeof normalized.homeHeroUrl === "string" ? normalized.homeHeroUrl : base.homeHeroUrl,
    discoverHeroUrl: typeof normalized.discoverHeroUrl === "string" ? normalized.discoverHeroUrl : base.discoverHeroUrl,
    publicCopyMaintainedAt: nowIso(),
    publicCopyMaintainedBy: actor.email || "CHECK Local",
  };

  if (next.publicLocales.length === 0) {
    next.publicLocales = [...compareDefaultLocales];
  }
  if (!next.publicLocales.includes(next.publicDefaultLocale)) {
    next.publicDefaultLocale = next.publicLocales[0] || compareDefaultLocale;
  }

  await prisma.destinationInstance.update({
    where: { id: instance.id },
    data: {
      config: writeConfigToInstanceRoot(instance.config, next),
    },
  });

  return next;
}

export async function seedComparePublicConfig(companyId: string): Promise<boolean> {
  const instance = await prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey: "compare", isActive: true },
    select: { id: true, config: true },
  });
  if (!instance) return false;

  const stored = readComparePublicConfigFromInstance(instance.config);
  if (hasStoredComparePublicConfig(stored)) return false;

  const seeded = applyDefaults({
    publicCopy: comparePublicCopy as ComparePublicI18nCopyMap,
    publicLocales: compareDefaultLocales,
    publicDefaultLocale: compareDefaultLocale,
    guides: [],
    locationHeroImages: [],
    homeHeroUrl: "",
    discoverHeroUrl: "",
    publicCopyMaintainedAt: nowIso(),
    publicCopyMaintainedBy: "CHECK Local compare seed",
  });

  await prisma.destinationInstance.update({
    where: { id: instance.id },
    data: {
      config: writeConfigToInstanceRoot(instance.config, seeded),
    },
  });

  return true;
}
