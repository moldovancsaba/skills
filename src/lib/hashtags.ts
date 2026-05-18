/**
 * checklist HASHTAG UTILITIES
 *
 * Sanitizing, normalizing, and filtering hashtags across the intelligence
 * layer, including source-type exclusions.
 */

export const SOURCE_TYPE_TAGS = new Set(["#product", "#customer", "#competitor", "#file", "#industry"]);

export function normalizeHashtag(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^#+/, "").replace(/[^a-z0-9-_]/g, "");
  if (!bare) return null;
  return `#${bare}`;
}

/**
 * Sanitizes and deduplicates a list of hashtags.
 * 
 * @param {string[] | null | undefined} values - Raw array of hashtag strings
 * @returns {string[]} Deduplicated array of normalized #hashtags
 */
export function normalizeHashtagList(values: string[] | null | undefined) {
  return Array.from(
    new Set((values ?? []).map(normalizeHashtag).filter((value): value is string => Boolean(value))),
  );
}

/**
 * Removes internal source-type tags (e.g., #product, #competitor) from a list.
 * Used when displaying tags to users or exporting knowledge.
 * 
 * @param {string[] | null | undefined} values - Array of hashtags
 * @returns {string[]} Filtered array of hashtags
 */
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

/**
 * Standardizes hashtags for a Source record, ensuring no reserved internal tags are included.
 * 
 * @param {string[] | null | undefined} values - Raw hashtag array
 * @param {string} [_type] - Optional type hint (unused)
 * @returns {string[]} Sanitized hashtags
 */
export function normalizeSourceHashtags(values: string[] | null | undefined, _type?: string) {
  return normalizeHashtagList(values).filter((tag) => !SOURCE_TYPE_TAGS.has(tag));
}

export function normalizeIndustryHashtags(values: string[] | null | undefined) {
  return normalizeSourceHashtags(values);
}
