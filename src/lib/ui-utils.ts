/**
 * UI Utilities for the CHECKLIST OS.
 * v1.0.0
 */

const TECHNICAL_METADATA_PATTERN = /\[(?:TRACE|TOPIC_ID):[^\]]*\]/gi;

/**
 * Strips technical metadata from strings intended for end-user display.
 * Purges [TRACE:...] and [TOPIC_ID:...] patterns injected by the AI synthesis engine.
 */
export function stripTechnicalMetadata(text: string | null | undefined): string {
  if (!text) return "";

  return text
    .replace(TECHNICAL_METADATA_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .trim();
}

export function sanitizeUserFacingText(text: string | null | undefined): string {
  return stripTechnicalMetadata(text).replace(/\s+/g, " ").trim();
}

export function sanitizeOptionalUserFacingText(text: string | null | undefined): string | null {
  const normalized = sanitizeUserFacingText(text);
  return normalized ? normalized : null;
}
