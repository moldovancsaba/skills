import type { DestinationKey } from "@/lib/destination-workflow-contract";

export type DestinationDaemonLimits = {
  maxRuns: number;
  maxPasses: number;
  maxAutoRejections: number;
  maxRevisionIntakes: number;
  maxApprovedPublishes: number;
};

export type ResolvedDestinationDaemonPolicy = {
  source: "default" | "worker-config";
  defaults: DestinationDaemonLimits;
  byDestination: Record<DestinationKey, DestinationDaemonLimits>;
  warnings: string[];
};

type ResolveDestinationDaemonPolicyInput = {
  workerConfig?: unknown;
  fallbackDefaults: DestinationDaemonLimits;
};

export type DestinationDaemonPolicyPatch = {
  defaults?: Partial<DestinationDaemonLimits>;
  miniapps?: Partial<Record<DestinationKey, Partial<DestinationDaemonLimits>>>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeLimit(input: {
  value: unknown;
  fallback: number;
  min: number;
  max: number;
  key: string;
  warnings: string[];
}) {
  if (input.value === undefined) return input.fallback;
  const numeric = Number(input.value);
  if (!Number.isFinite(numeric)) {
    input.warnings.push(`Daemon policy "${input.key}" was not numeric and defaulted.`);
    return input.fallback;
  }
  return Math.max(input.min, Math.min(input.max, Math.round(numeric)));
}

function normalizeLimits(input: {
  candidate: unknown;
  fallback: DestinationDaemonLimits;
  warnings: string[];
  scope: string;
}): DestinationDaemonLimits {
  const record = asRecord(input.candidate);
  return {
    maxRuns: normalizeLimit({
      value: record?.maxRuns,
      fallback: input.fallback.maxRuns,
      min: 1,
      max: 20,
      key: `${input.scope}.maxRuns`,
      warnings: input.warnings,
    }),
    maxPasses: normalizeLimit({
      value: record?.maxPasses,
      fallback: input.fallback.maxPasses,
      min: 1,
      max: 8,
      key: `${input.scope}.maxPasses`,
      warnings: input.warnings,
    }),
    maxAutoRejections: normalizeLimit({
      value: record?.maxAutoRejections,
      fallback: input.fallback.maxAutoRejections,
      min: 1,
      max: 10,
      key: `${input.scope}.maxAutoRejections`,
      warnings: input.warnings,
    }),
    maxRevisionIntakes: normalizeLimit({
      value: record?.maxRevisionIntakes,
      fallback: input.fallback.maxRevisionIntakes,
      min: 1,
      max: 20,
      key: `${input.scope}.maxRevisionIntakes`,
      warnings: input.warnings,
    }),
    maxApprovedPublishes: normalizeLimit({
      value: record?.maxApprovedPublishes,
      fallback: input.fallback.maxApprovedPublishes,
      min: 1,
      max: 20,
      key: `${input.scope}.maxApprovedPublishes`,
      warnings: input.warnings,
    }),
  };
}

function readStoredDestinationDaemonPolicy(workerConfig: unknown) {
  const config = asRecord(workerConfig);
  if (!config) return null;
  return asRecord(config.destinationDaemonPolicy);
}

export function resolveDestinationDaemonPolicy(input: ResolveDestinationDaemonPolicyInput): ResolvedDestinationDaemonPolicy {
  const warnings: string[] = [];
  const fallback = normalizeLimits({
    candidate: input.fallbackDefaults,
    fallback: input.fallbackDefaults,
    warnings,
    scope: "fallback",
  });

  const stored = readStoredDestinationDaemonPolicy(input.workerConfig);
  if (!stored) {
    return {
      source: "default",
      defaults: fallback,
      byDestination: {
        compare: { ...fallback },
        trainers: { ...fallback },
        athleteiq: { ...fallback },
      },
      warnings,
    };
  }

  const resolvedDefaults = normalizeLimits({
    candidate: stored.defaults,
    fallback,
    warnings,
    scope: "destinationDaemonPolicy.defaults",
  });
  const miniapps = asRecord(stored.miniapps);

  return {
    source: "worker-config",
    defaults: resolvedDefaults,
    byDestination: {
      compare: normalizeLimits({
        candidate: miniapps?.compare,
        fallback: resolvedDefaults,
        warnings,
        scope: "destinationDaemonPolicy.miniapps.compare",
      }),
      trainers: normalizeLimits({
        candidate: miniapps?.trainers,
        fallback: resolvedDefaults,
        warnings,
        scope: "destinationDaemonPolicy.miniapps.trainers",
      }),
      athleteiq: normalizeLimits({
        candidate: miniapps?.athleteiq,
        fallback: resolvedDefaults,
        warnings,
        scope: "destinationDaemonPolicy.miniapps.athleteiq",
      }),
    },
    warnings,
  };
}

export function applyDestinationDaemonPolicyPatchToWorkerConfig(input: {
  workerConfig?: unknown;
  patch: DestinationDaemonPolicyPatch;
  fallbackDefaults: DestinationDaemonLimits;
}) {
  const current = asRecord(input.workerConfig) ?? {};
  const resolved = resolveDestinationDaemonPolicy({
    workerConfig: current,
    fallbackDefaults: input.fallbackDefaults,
  });

  const nextDefaults = normalizeLimits({
    candidate: { ...(resolved.defaults as Record<string, unknown>), ...(asRecord(input.patch.defaults) ?? {}) },
    fallback: resolved.defaults,
    warnings: [],
    scope: "patch.defaults",
  });

  const comparePatch = asRecord(input.patch.miniapps?.compare);
  const trainersPatch = asRecord(input.patch.miniapps?.trainers);
  const athleteiqPatch = asRecord(input.patch.miniapps?.athleteiq);

  const compare = normalizeLimits({
    candidate: { ...(resolved.byDestination.compare as Record<string, unknown>), ...(comparePatch ?? {}) },
    fallback: nextDefaults,
    warnings: [],
    scope: "patch.miniapps.compare",
  });
  const trainers = normalizeLimits({
    candidate: { ...(resolved.byDestination.trainers as Record<string, unknown>), ...(trainersPatch ?? {}) },
    fallback: nextDefaults,
    warnings: [],
    scope: "patch.miniapps.trainers",
  });
  const athleteiq = normalizeLimits({
    candidate: { ...(resolved.byDestination.athleteiq as Record<string, unknown>), ...(athleteiqPatch ?? {}) },
    fallback: nextDefaults,
    warnings: [],
    scope: "patch.miniapps.athleteiq",
  });

  return {
    workerConfig: {
      ...current,
      destinationDaemonPolicy: {
        defaults: nextDefaults,
        miniapps: {
          compare,
          trainers,
          athleteiq,
        },
      },
    },
    resolved: {
      source: "worker-config" as const,
      defaults: nextDefaults,
      byDestination: {
        compare,
        trainers,
        athleteiq,
      },
      warnings: resolved.warnings,
    },
  };
}
