/**
 * CHECKLIST Release Configuration
 * Hardened version - Client Safe
 */

export const APP_VERSION = "0.15.3";
export const BRAIN_VERSION = `local-brain@${APP_VERSION}`;
export const FLASHCARD_PROMPT_VERSION = `flashcard-policy@${APP_VERSION}`;
export const NBA_PROMPT_VERSION = `nba-policy@${APP_VERSION}`;

export function getReleaseMetadata() {
  return {
    appVersion: APP_VERSION,
    brainVersion: BRAIN_VERSION,
    flashcardPromptVersion: FLASHCARD_PROMPT_VERSION,
    nbaPromptVersion: NBA_PROMPT_VERSION,
  };
}
