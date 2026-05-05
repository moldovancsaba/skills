/**
 * UI Utilities for the CHECKLIST OS.
 * v1.0.0
 */

/**
 * Strips technical metadata from strings intended for end-user display.
 * Purges [TRACE:...] and [TOPIC_ID:...] patterns injected by the AI synthesis engine.
 */
export function stripTechnicalMetadata(text: string | null | undefined): string {
  if (!text) return "";
  
  // Pattern matches [TRACE:XYZ] or [TOPIC_ID:ABC-123]
  const metadataPattern = /\[TRACE:[^\]]*\]|\[TOPIC_ID:[^\]]*\]/gi;
  
  return text.replace(metadataPattern, "").trim();
}
