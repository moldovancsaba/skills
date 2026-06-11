export type LocalAiFocusPolicy = {
  enabled: boolean;
  destinationKeys: string[];
  reason: string;
};

export function readLocalAiFocusPolicy(env?: NodeJS.ProcessEnv): LocalAiFocusPolicy;
export function getLocalAiJobDestinationKeys(job: unknown): string[];
export function isPipelineJobAllowedByLocalAiFocus(job: unknown, policy?: LocalAiFocusPolicy): boolean;
export function buildLocalAiFocusBlockMessage(job: unknown, policy?: LocalAiFocusPolicy): string;
export function filterDestinationKeysForLocalAiFocus(destinationKeys: readonly string[], policy?: LocalAiFocusPolicy): string[];
