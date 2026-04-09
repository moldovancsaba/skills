export type LegacySourceType = "product" | "customer" | "competitor" | "industry";

const CATEGORY_TAGS: Record<LegacySourceType, string> = {
  product: "#product",
  customer: "#customer",
  competitor: "#competitor",
  industry: "#industry",
};

export const SOURCE_TYPE_TAGS = new Set(["#product", "#customer", "#competitor", "#file"]);

export function normalizeHashtag(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^#+/, "").replace(/[^a-z0-9-_]/g, "");
  if (!bare) return null;
  return `#${bare}`;
}

export function normalizeHashtagList(values: string[] | null | undefined) {
  return Array.from(
    new Set((values ?? []).map(normalizeHashtag).filter((value): value is string => Boolean(value))),
  );
}

export function stripSourceTypeHashtags(values: string[] | null | undefined) {
  return normalizeHashtagList(values).filter((tag) => !SOURCE_TYPE_TAGS.has(tag));
}

export function displayHashtag(tag: string) {
  return tag.replace(/^#/, "");
}

export function matchesAllHashtags(values: string[] | null | undefined, active: string[] | null | undefined) {
  const normalizedValues = new Set(normalizeHashtagList(values));
  const normalizedActive = normalizeHashtagList(active);
  return normalizedActive.every((tag) => normalizedValues.has(tag));
}

export function parseHashtagFilterParam(value: string | null | undefined) {
  if (!value) return [];
  return normalizeHashtagList(value.split(","));
}

export function stringifyHashtagFilterParam(values: string[] | null | undefined) {
  const normalized = normalizeHashtagList(values);
  return normalized.join(",");
}

export function normalizeSourceHashtags(
  values: string[] | null | undefined,
  type: LegacySourceType,
) {
  const normalized = normalizeHashtagList(values);
  if (type === "industry") {
    const categoryTag = CATEGORY_TAGS[type];
    return normalized.includes(categoryTag) ? normalized : [categoryTag, ...normalized];
  }
  return normalized.filter((tag) => !SOURCE_TYPE_TAGS.has(tag));
}

export function normalizeIndustryHashtags(values: string[] | null | undefined) {
  return normalizeSourceHashtags(values, "industry");
}

export function sourceTypeFromHashtags(values: string[] | null | undefined): LegacySourceType {
  const normalized = normalizeHashtagList(values);
  if (normalized.includes("#customer")) return "customer";
  if (normalized.includes("#competitor")) return "competitor";
  return "product";
}

export function defaultTypeHashtags(type: LegacySourceType) {
  return type === "industry" ? [CATEGORY_TAGS[type]] : [];
}
