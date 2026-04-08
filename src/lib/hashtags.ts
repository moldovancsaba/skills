export type LegacySourceType = "product" | "customer" | "competitor" | "industry";

const CATEGORY_TAGS: Record<LegacySourceType, string> = {
  product: "#product",
  customer: "#customer",
  competitor: "#competitor",
  industry: "#industry",
};

export function normalizeHashtag(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^#+/, "").replace(/[^a-z0-9-_]/g, "");
  if (!bare) return null;
  return `#${bare}`;
}

export function normalizeSourceHashtags(
  values: string[] | null | undefined,
  type: LegacySourceType,
) {
  const normalized = Array.from(
    new Set((values ?? []).map(normalizeHashtag).filter((value): value is string => Boolean(value))),
  );

  const categoryTag = CATEGORY_TAGS[type];
  return normalized.includes(categoryTag)
    ? normalized
    : [categoryTag, ...normalized];
}

export function normalizeIndustryHashtags(values: string[] | null | undefined) {
  return normalizeSourceHashtags(values, "industry");
}

export function sourceTypeFromHashtags(values: string[] | null | undefined): LegacySourceType {
  const normalized = normalizeSourceHashtags(values, "product");
  if (normalized.includes("#customer")) return "customer";
  if (normalized.includes("#competitor")) return "competitor";
  return "product";
}

export function defaultTypeHashtags(type: LegacySourceType) {
  return [CATEGORY_TAGS[type]];
}
