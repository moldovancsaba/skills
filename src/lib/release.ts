import { readFileSync } from "node:fs";
import { join } from "node:path";

type PackageJson = {
  version?: string;
};

const DEFAULT_APP_VERSION = "0.8.0";

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as PackageJson;
    return packageJson.version?.trim() || DEFAULT_APP_VERSION;
  } catch {
    return DEFAULT_APP_VERSION;
  }
}

export const APP_VERSION = readPackageVersion();
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
