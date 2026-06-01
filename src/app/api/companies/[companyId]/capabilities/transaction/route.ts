import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { resolveEffectiveUnitCapabilities, normalizeUnitCapabilitiesForStorage } from "@/lib/check-foundation/capabilities-v3";
import { isMiniappId, type MiniappId } from "@/lib/check-foundation/miniapp-registry";
import { BLOCK_KEYS, getRequiredModulesForBlocks, isBlockKey, isModuleKey, type BlockKey, type ModuleKey } from "@/lib/check-foundation/registry";
import { resolveEffectiveUnitPackage } from "@/lib/check-foundation/unit-packages";
import { ensureProvisionedDestination, type ProvisionStepResult } from "@/lib/check-lifecycle/provisioning-engine";
import { prisma } from "@/lib/db";
import { markCompanyPipelineTopologyDirty, syncCompanyPipelineJobs } from "@/lib/pipeline-queue";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type MutationMode = "preview" | "apply";

type CapabilityError = {
  field: string;
  code: string;
  message: string;
};

type CapabilityEnvelopeV3 = {
  schemaVersion: 3;
  payload: {
    v: 3;
    blocks: Partial<Record<BlockKey, { enabled: boolean }>>;
    modules?: Partial<Record<ModuleKey, boolean>>;
    miniapps?: Record<string, { enabled: boolean }>;
  };
};

type CapabilityMutationImpact = {
  hiddenRoutes: string[];
  blockedOperations: string[];
  affectedMiniapps: string[];
};

type CapabilityMutationResult = {
  ok: boolean;
  mode: MutationMode;
  version: string;
  effective: {
    enabledBlocks: BlockKey[];
    enabledModules: ModuleKey[];
    enabledMiniapps: string[];
    source: string;
  };
  warnings: string[];
  errors: CapabilityError[];
  impact: CapabilityMutationImpact;
  runtime?: {
    miniappSteps: ProvisionStepResult[];
    pipelineJobCount: number | null;
  };
  idempotentReplay?: boolean;
};

type CapabilityTransactionLogEntry = {
  requestHash: string;
  createdAt: string;
};

const CAPABILITY_TRANSACTION_LOG_KEY = "capabilityTransactionLog";
const MAX_CAPABILITY_TRANSACTION_LOG_ENTRIES = 25;
const MINIAPP_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildVersionToken(updatedAt: Date, workerConfig: unknown): string {
  const record = asRecord(workerConfig);
  const unitCapabilities = record ? record.unitCapabilities : null;
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(unitCapabilities ?? null))
    .digest("hex")
    .slice(0, 16);
  return `${updatedAt.getTime()}:${hash}`;
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readTransactionLog(workerConfig: unknown): Record<string, CapabilityTransactionLogEntry> {
  const root = asRecord(workerConfig);
  if (!root) return {};
  const raw = asRecord(root[CAPABILITY_TRANSACTION_LOG_KEY]);
  if (!raw) return {};

  const entries: Record<string, CapabilityTransactionLogEntry> = {};
  for (const [key, value] of Object.entries(raw)) {
    const row = asRecord(value);
    if (!row || typeof row.requestHash !== "string" || typeof row.createdAt !== "string") continue;
    entries[key] = {
      requestHash: row.requestHash,
      createdAt: row.createdAt,
    };
  }
  return entries;
}

function withTransactionLog(
  workerConfig: Record<string, unknown>,
  idempotencyKey: string | null,
  requestHash: string | null,
): Record<string, unknown> {
  if (!idempotencyKey || !requestHash) return workerConfig;
  const currentLog = readTransactionLog(workerConfig);
  currentLog[idempotencyKey] = {
    requestHash,
    createdAt: new Date().toISOString(),
  };

  const sortedEntries = Object.entries(currentLog).sort((a, b) => {
    const left = new Date(a[1].createdAt).getTime();
    const right = new Date(b[1].createdAt).getTime();
    return right - left;
  });
  const trimmed = sortedEntries.slice(0, MAX_CAPABILITY_TRANSACTION_LOG_ENTRIES);

  return {
    ...workerConfig,
    [CAPABILITY_TRANSACTION_LOG_KEY]: Object.fromEntries(trimmed),
  };
}

function createImpact(
  currentAreas: string[],
  nextAreas: string[],
  currentOperations: string[],
  nextOperations: string[],
  currentMiniapps: string[],
  nextMiniapps: string[],
): CapabilityMutationImpact {
  const hiddenRoutes = currentAreas.filter((route) => !nextAreas.includes(route));
  const blockedOperations = currentOperations.filter((operation) => !nextOperations.includes(operation));
  const mergedMiniapps = new Set<string>([...currentMiniapps, ...nextMiniapps]);
  const affectedMiniapps = Array.from(mergedMiniapps).filter((key) => {
    const left = currentMiniapps.includes(key);
    const right = nextMiniapps.includes(key);
    return left !== right;
  });
  return {
    hiddenRoutes,
    blockedOperations,
    affectedMiniapps,
  };
}

function buildSuccessResult(input: {
  mode: MutationMode;
  version: string;
  enabledBlocks: BlockKey[];
  enabledModules: ModuleKey[];
  enabledMiniapps: string[];
  source: string;
  warnings: string[];
  impact: CapabilityMutationImpact;
  runtime?: CapabilityMutationResult["runtime"];
  idempotentReplay?: boolean;
}): CapabilityMutationResult {
  return {
    ok: true,
    mode: input.mode,
    version: input.version,
    effective: {
      enabledBlocks: input.enabledBlocks,
      enabledModules: input.enabledModules,
      enabledMiniapps: input.enabledMiniapps,
      source: input.source,
    },
    warnings: input.warnings,
    errors: [],
    impact: input.impact,
    ...(input.runtime ? { runtime: input.runtime } : {}),
    ...(input.idempotentReplay ? { idempotentReplay: true } : {}),
  };
}

function toKnownMiniappIds(values: string[]): MiniappId[] {
  const ids = new Set<MiniappId>();
  for (const value of values) {
    if (isMiniappId(value)) ids.add(value);
  }
  return Array.from(ids);
}

async function pauseDisabledMiniappRuntime(input: {
  companyId: string;
  miniappId: MiniappId;
  actorId: string;
}): Promise<ProvisionStepResult[]> {
  const disabledAt = new Date().toISOString();
  const [instanceResult, definitionResult, runResult] = await Promise.all([
    prisma.destinationInstance.updateMany({
      where: {
        companyId: input.companyId,
        destinationKey: input.miniappId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    }),
    prisma.destinationMissionDefinition.updateMany({
      where: {
        companyId: input.companyId,
        destinationKey: input.miniappId,
        status: "active",
      },
      data: {
        status: "paused",
        updatedBy: input.actorId,
        metadata: {
          source: "capability-transaction-api",
          pausedAt: disabledAt,
          pauseReason: "unit-capability-miniapp-disabled",
        },
      },
    }),
    prisma.destinationMissionRun.updateMany({
      where: {
        companyId: input.companyId,
        destinationKey: input.miniappId,
        state: {
          in: [
            "QUEUED",
            "CATALOG_INSPECTED",
            "DISCOVERING",
            "CANDIDATE_IN_REVIEW",
            "PUBLISHING",
            "FAILED_RECOVERABLE",
          ],
        },
      },
      data: {
        state: "PAUSED",
        failureCode: "unit_capability_miniapp_disabled",
        failureDetail: "Miniapp runtime paused because the Unit capability transaction disabled this Miniapp.",
      },
    }),
  ]);

  const steps: ProvisionStepResult[] = [];
  if (instanceResult.count > 0) {
    steps.push({
      id: `destination:${input.miniappId}:disabled`,
      status: "updated",
      summary: `Disabled ${input.miniappId} destination instance runtime.`,
      metadata: { updatedInstances: instanceResult.count },
    });
  }
  if (definitionResult.count > 0) {
    steps.push({
      id: `mission:${input.miniappId}:paused`,
      status: "updated",
      summary: `Paused active ${input.miniappId} mission definitions.`,
      metadata: { pausedDefinitions: definitionResult.count },
    });
  }
  if (runResult.count > 0) {
    steps.push({
      id: `mission-run:${input.miniappId}:paused`,
      status: "updated",
      summary: `Paused active ${input.miniappId} mission runs.`,
      metadata: { pausedRuns: runResult.count },
    });
  }
  if (steps.length === 0) {
    steps.push({
      id: `miniapp:${input.miniappId}:disabled-noop`,
      status: "skipped",
      summary: `${input.miniappId} was already disabled at runtime.`,
    });
  }
  return steps;
}

async function reconcileMiniappRuntime(input: {
  companyId: string;
  currentEnabledMiniapps: string[];
  nextEnabledMiniapps: string[];
  actorId: string;
}) {
  const steps: ProvisionStepResult[] = [];
  const currentIds = toKnownMiniappIds(input.currentEnabledMiniapps);
  const nextIds = toKnownMiniappIds(input.nextEnabledMiniapps);
  const nextSet = new Set<MiniappId>(nextIds);

  for (const miniappId of nextIds) {
    steps.push(...await ensureProvisionedDestination({
      companyId: input.companyId,
      destinationKey: miniappId,
      actorId: input.actorId,
      source: "capability-transaction-api",
    }));
  }

  for (const miniappId of currentIds) {
    if (nextSet.has(miniappId)) continue;
    steps.push(...await pauseDisabledMiniappRuntime({
      companyId: input.companyId,
      miniappId,
      actorId: input.actorId,
    }));
  }

  let pipelineJobCount: number | null = null;
  const changed = steps.some((step) => step.status !== "skipped");
  if (nextIds.length > 0 || changed) {
    await markCompanyPipelineTopologyDirty(prisma, input.companyId, "capability-transaction-miniapp-runtime");
    const jobs = await syncCompanyPipelineJobs(prisma, input.companyId);
    pipelineJobCount = jobs.length;
    steps.push({
      id: "pipeline-topology",
      status: "repaired",
      summary: `Synced ${jobs.length} lifecycle pipeline jobs after Miniapp capability change.`,
      metadata: {
        enabledMiniapps: nextIds,
      },
    });
  }

  return { miniappSteps: steps, pipelineJobCount };
}

function normalizeCapabilityPayload(raw: unknown): {
  normalized: CapabilityEnvelopeV3["payload"] | null;
  errors: CapabilityError[];
  warnings: string[];
} {
  const errors: CapabilityError[] = [];
  const warnings: string[] = [];

  const payload = asRecord(raw);
  if (!payload) {
    return {
      normalized: null,
      errors: [{ field: "payload", code: "invalid-payload", message: "payload must be an object." }],
      warnings,
    };
  }

  const rawBlocks = asRecord(payload.blocks);
  if (!rawBlocks) {
    return {
      normalized: null,
      errors: [{ field: "payload.blocks", code: "invalid-block-map", message: "payload.blocks must be an object." }],
      warnings,
    };
  }

  const normalizedBlocks = Object.fromEntries(
    BLOCK_KEYS.map((key) => [key, { enabled: false }]),
  ) as Partial<Record<BlockKey, { enabled: boolean }>>;
  for (const [key, value] of Object.entries(rawBlocks)) {
    if (!isBlockKey(key)) {
      errors.push({
        field: `payload.blocks.${key}`,
        code: "unknown-block-key",
        message: `Unknown Block key: ${key}.`,
      });
      continue;
    }
    const blockRow = asRecord(value);
    if (!blockRow || typeof blockRow.enabled !== "boolean") {
      errors.push({
        field: `payload.blocks.${key}`,
        code: "invalid-block-enabled",
        message: `Block ${key} must include an enabled boolean.`,
      });
      continue;
    }
    normalizedBlocks[key] = { enabled: blockRow.enabled };
  }

  let normalizedModules: Partial<Record<ModuleKey, boolean>> = {};
  if (payload.modules !== undefined) {
    const rawModules = asRecord(payload.modules);
    if (!rawModules) {
      errors.push({
        field: "payload.modules",
        code: "invalid-module-map",
        message: "payload.modules must be an object when provided.",
      });
    } else {
      const moduleRows: Partial<Record<ModuleKey, boolean>> = {};
      for (const [key, value] of Object.entries(rawModules)) {
        if (!isModuleKey(key)) {
          errors.push({
            field: `payload.modules.${key}`,
            code: "unknown-module-key",
            message: `Unknown Module key: ${key}.`,
          });
          continue;
        }
        if (typeof value !== "boolean") {
          errors.push({
            field: `payload.modules.${key}`,
            code: "invalid-module-value",
            message: `Module ${key} must be boolean.`,
          });
          continue;
        }
        moduleRows[key] = value;
      }
      normalizedModules = moduleRows;
    }
  }

  let normalizedMiniapps: Record<string, { enabled: boolean }> = {};
  if (payload.miniapps !== undefined) {
    const rawMiniapps = asRecord(payload.miniapps);
    if (!rawMiniapps) {
      errors.push({
        field: "payload.miniapps",
        code: "invalid-miniapp-map",
        message: "payload.miniapps must be an object when provided.",
      });
    } else {
      const miniappRows: Record<string, { enabled: boolean }> = {};
      for (const [key, value] of Object.entries(rawMiniapps)) {
        if (!MINIAPP_KEY_PATTERN.test(key)) {
          errors.push({
            field: `payload.miniapps.${key}`,
            code: "invalid-miniapp-key",
            message: `Miniapp key ${key} is invalid; use lowercase letters, numbers, and dashes.`,
          });
          continue;
        }
        if (!isMiniappId(key)) {
          errors.push({
            field: `payload.miniapps.${key}`,
            code: "unknown-miniapp-key",
            message: `Unknown Miniapp key: ${key}.`,
          });
          continue;
        }
        const miniappRow = asRecord(value);
        if (!miniappRow || typeof miniappRow.enabled !== "boolean") {
          errors.push({
            field: `payload.miniapps.${key}`,
            code: "invalid-miniapp-enabled",
            message: `Miniapp ${key} must include an enabled boolean.`,
          });
          continue;
        }
        miniappRows[key] = { enabled: miniappRow.enabled };
      }
      normalizedMiniapps = miniappRows;
    }
  }

  if (errors.length > 0) {
    return {
      normalized: null,
      errors,
      warnings,
    };
  }

  const hasEnabledBlock = BLOCK_KEYS.some((key) => normalizedBlocks[key]?.enabled === true);
  if (!hasEnabledBlock) {
    normalizedBlocks.checklist = { enabled: true };
    warnings.push("No Block was enabled. Checklist was enabled automatically to keep a valid Unit surface.");
  }

  const enabledMiniapps = Object.entries(normalizedMiniapps)
    .filter(([, row]) => row.enabled)
    .map(([key]) => key);
  if (enabledMiniapps.length > 0 && normalizedBlocks.miniapp?.enabled !== true) {
    normalizedBlocks.miniapp = { enabled: true };
    warnings.push("Miniapp Block was enabled automatically because one or more Miniapps were enabled.");
  }
  if (normalizedBlocks.miniapp?.enabled === true && enabledMiniapps.length === 0) {
    warnings.push("Miniapp Block is enabled without an active Miniapp destination.");
  }

  const requiredModules = getRequiredModulesForBlocks(
    BLOCK_KEYS.filter((key) => normalizedBlocks[key]?.enabled === true),
  );
  const requiredSet = new Set<ModuleKey>(requiredModules);
  for (const [moduleKey, enabled] of Object.entries(normalizedModules)) {
    if (enabled === false && requiredSet.has(moduleKey as ModuleKey)) {
      warnings.push(`Module ${moduleKey} cannot be disabled because it is required by an enabled Block.`);
    }
  }

  return {
    normalized: {
      v: 3,
      blocks: normalizedBlocks,
      modules: normalizedModules,
      miniapps: normalizedMiniapps,
    },
    errors,
    warnings,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    const dataRaw = await request.json().catch(() => ({}));
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = dataRaw as Record<string, unknown>;
    const mode = data.mode;
    const expectedVersion = typeof data.expectedVersion === "string" ? data.expectedVersion.trim() : "";
    const idempotencyKey =
      typeof data.idempotencyKey === "string" && data.idempotencyKey.trim().length > 0
        ? data.idempotencyKey.trim()
        : null;

    const validationErrors: CapabilityError[] = [];
    if (mode !== "preview" && mode !== "apply") {
      validationErrors.push({
        field: "mode",
        code: "invalid-mode",
        message: "mode must be preview or apply.",
      });
    }
    if (mode === "apply" && !expectedVersion) {
      validationErrors.push({
        field: "expectedVersion",
        code: "missing-expected-version",
        message: "expectedVersion is required for apply mode.",
      });
    }
    if (idempotencyKey && idempotencyKey.length > 128) {
      validationErrors.push({
        field: "idempotencyKey",
        code: "invalid-idempotency-key",
        message: "idempotencyKey must not exceed 128 characters.",
      });
    }

    const [company, classScoutInstance, compareInstance] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          workerConfig: true,
          updatedAt: true,
        },
      }),
      prisma.destinationInstance.findFirst({
        where: { companyId, destinationKey: "classscout", isActive: true },
        select: { id: true },
      }),
      prisma.destinationInstance.findFirst({
        where: { companyId, destinationKey: "compare", isActive: true },
        select: { id: true },
      }),
    ]);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const currentVersion = buildVersionToken(company.updatedAt, company.workerConfig);
    const currentEffective = resolveEffectiveUnitCapabilities({
      workerConfig: company.workerConfig,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });
    const currentPackage = resolveEffectiveUnitPackage({
      unitId: company.id,
      workerConfig: company.workerConfig,
      effectiveCapabilities: currentEffective,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });

    const normalizedPayload = normalizeCapabilityPayload(data.payload);
    const combinedValidationErrors = [...validationErrors, ...normalizedPayload.errors];
    if (combinedValidationErrors.length > 0 || !normalizedPayload.normalized) {
      const result: CapabilityMutationResult = {
        ok: false,
        mode: mode === "preview" || mode === "apply" ? mode : "preview",
        version: currentVersion,
        effective: {
          enabledBlocks: currentEffective.enabledBlocks,
          enabledModules: currentEffective.enabledModules,
          enabledMiniapps: currentEffective.enabledMiniapps,
          source: currentEffective.source,
        },
        warnings: normalizedPayload.warnings,
        errors: combinedValidationErrors,
        impact: {
          hiddenRoutes: [],
          blockedOperations: [],
          affectedMiniapps: [],
        },
      };
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-capabilities",
        interactionType: "CAPABILITY_TRANSACTION_VALIDATION_FAILED",
        entityType: "COMPANY",
        entityId: companyId,
        payload: {
          mode,
          errors: combinedValidationErrors,
        },
        teachingWeight: 85,
      });
      return NextResponse.json(result, { status: 422 });
    }

    const nextWorkerConfig = {
      ...(asRecord(company.workerConfig) ?? {}),
      unitCapabilities: {
        schemaVersion: 3,
        payload: normalizedPayload.normalized,
      } satisfies CapabilityEnvelopeV3,
      updatedBy: "capability-transaction-api",
    } as Record<string, unknown>;

    const nextEffective = resolveEffectiveUnitCapabilities({
      workerConfig: nextWorkerConfig,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });
    const nextPackage = resolveEffectiveUnitPackage({
      unitId: company.id,
      workerConfig: nextWorkerConfig,
      effectiveCapabilities: nextEffective,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });

    const impact = createImpact(
      currentPackage.visibleWebappAreas,
      nextPackage.visibleWebappAreas,
      currentPackage.allowedOperations,
      nextPackage.allowedOperations,
      currentEffective.enabledMiniapps,
      nextEffective.enabledMiniapps,
    );
    const nextWarnings = [...normalizedPayload.warnings, ...nextEffective.warnings];

    if (mode === "preview") {
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-capabilities",
        interactionType: "CAPABILITY_TRANSACTION_PREVIEW",
        entityType: "COMPANY",
        entityId: companyId,
        payload: {
          version: currentVersion,
          warnings: nextWarnings,
          impact,
        },
        teachingWeight: 65,
      });
      return NextResponse.json(
        buildSuccessResult({
          mode: "preview",
          version: currentVersion,
          enabledBlocks: nextEffective.enabledBlocks,
          enabledModules: nextEffective.enabledModules,
          enabledMiniapps: nextEffective.enabledMiniapps,
          source: nextEffective.source,
          warnings: nextWarnings,
          impact,
        }),
      );
    }

    const requestHash = stableHash(
      normalizeUnitCapabilitiesForStorage({
        schemaVersion: 3,
        payload: normalizedPayload.normalized,
      }),
    );
    if (idempotencyKey) {
      const transactionLog = readTransactionLog(company.workerConfig);
      const existingEntry = transactionLog[idempotencyKey];
      if (existingEntry) {
        if (existingEntry.requestHash !== requestHash) {
          await recordInteractionEventFromRequest(request, {
            companyId,
            surface: "settings-capabilities",
            interactionType: "CAPABILITY_TRANSACTION_CONFLICT",
            entityType: "COMPANY",
            entityId: companyId,
            payload: {
              reason: "idempotency-key-reused",
              mode: "apply",
              expectedVersion,
            },
            teachingWeight: 85,
          });
          return NextResponse.json(
            {
              ok: false,
              mode: "apply",
              version: currentVersion,
              effective: {
                enabledBlocks: currentEffective.enabledBlocks,
                enabledModules: currentEffective.enabledModules,
                enabledMiniapps: currentEffective.enabledMiniapps,
                source: currentEffective.source,
              },
              warnings: [],
              errors: [
                {
                  field: "idempotencyKey",
                  code: "idempotency-key-reused",
                  message: "idempotencyKey was already used with a different request payload.",
                },
              ],
              impact: {
                hiddenRoutes: [],
                blockedOperations: [],
                affectedMiniapps: [],
              },
            } satisfies CapabilityMutationResult,
            { status: 409 },
          );
        }

        const persistedCapabilities = asRecord(company.workerConfig)?.unitCapabilities;
        const persistedNormalized = normalizeUnitCapabilitiesForStorage(persistedCapabilities);
        if (stableHash(persistedNormalized) !== requestHash) {
          await recordInteractionEventFromRequest(request, {
            companyId,
            surface: "settings-capabilities",
            interactionType: "CAPABILITY_TRANSACTION_CONFLICT",
            entityType: "COMPANY",
            entityId: companyId,
            payload: {
              reason: "idempotency-replay-state-diverged",
              mode: "apply",
              expectedVersion,
            },
            teachingWeight: 85,
          });
          return NextResponse.json(
            {
              ok: false,
              mode: "apply",
              version: currentVersion,
              effective: {
                enabledBlocks: currentEffective.enabledBlocks,
                enabledModules: currentEffective.enabledModules,
                enabledMiniapps: currentEffective.enabledMiniapps,
                source: currentEffective.source,
              },
              warnings: [],
              errors: [
                {
                  field: "idempotencyKey",
                  code: "idempotency-replay-state-diverged",
                  message: "idempotencyKey was used before, but Unit capability state has changed since then.",
                },
              ],
              impact: {
                hiddenRoutes: [],
                blockedOperations: [],
                affectedMiniapps: [],
              },
            } satisfies CapabilityMutationResult,
            { status: 409 },
          );
        }

        return NextResponse.json(
          buildSuccessResult({
            mode: "apply",
            version: currentVersion,
            enabledBlocks: currentEffective.enabledBlocks,
            enabledModules: currentEffective.enabledModules,
            enabledMiniapps: currentEffective.enabledMiniapps,
            source: currentEffective.source,
            warnings: currentEffective.warnings,
            impact: {
              hiddenRoutes: [],
              blockedOperations: [],
              affectedMiniapps: [],
            },
            idempotentReplay: true,
          }),
        );
      }
    }

    if (expectedVersion !== currentVersion) {
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-capabilities",
        interactionType: "CAPABILITY_TRANSACTION_CONFLICT",
        entityType: "COMPANY",
        entityId: companyId,
        payload: {
          reason: "version-conflict",
          mode: "apply",
          expectedVersion,
          currentVersion,
        },
        teachingWeight: 85,
      });
      return NextResponse.json(
        {
          ok: false,
          mode: "apply",
          version: currentVersion,
          effective: {
            enabledBlocks: currentEffective.enabledBlocks,
            enabledModules: currentEffective.enabledModules,
            enabledMiniapps: currentEffective.enabledMiniapps,
            source: currentEffective.source,
          },
          warnings: [],
          errors: [
            {
              field: "expectedVersion",
              code: "version-conflict",
              message: "Capability state changed. Refresh settings and retry.",
            },
          ],
          impact: {
            hiddenRoutes: [],
            blockedOperations: [],
            affectedMiniapps: [],
          },
        } satisfies CapabilityMutationResult,
        { status: 409 },
      );
    }

    const updatePayload = {
      ...nextWorkerConfig,
      ...(idempotencyKey
        ? withTransactionLog(nextWorkerConfig, idempotencyKey, requestHash)
        : nextWorkerConfig),
    };

    const updatedCount = await prisma.company.updateMany({
      where: {
        id: companyId,
        updatedAt: company.updatedAt,
      },
      data: {
        workerConfig: updatePayload as Prisma.JsonValue,
      },
    });

    if (updatedCount.count === 0) {
      const fresh = await prisma.company.findUnique({
        where: { id: companyId },
        select: { updatedAt: true, workerConfig: true },
      });
      const freshVersion = fresh ? buildVersionToken(fresh.updatedAt, fresh.workerConfig) : currentVersion;
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-capabilities",
        interactionType: "CAPABILITY_TRANSACTION_CONFLICT",
        entityType: "COMPANY",
        entityId: companyId,
        payload: {
          reason: "write-conflict",
          mode: "apply",
          expectedVersion,
          currentVersion: freshVersion,
        },
        teachingWeight: 85,
      });
      return NextResponse.json(
        {
          ok: false,
          mode: "apply",
          version: freshVersion,
          effective: {
            enabledBlocks: currentEffective.enabledBlocks,
            enabledModules: currentEffective.enabledModules,
            enabledMiniapps: currentEffective.enabledMiniapps,
            source: currentEffective.source,
          },
          warnings: [],
          errors: [
            {
              field: "expectedVersion",
              code: "version-conflict",
              message: "Capability state changed during apply. Refresh settings and retry.",
            },
          ],
          impact: {
            hiddenRoutes: [],
            blockedOperations: [],
            affectedMiniapps: [],
          },
        } satisfies CapabilityMutationResult,
        { status: 409 },
      );
    }

    const updatedCompany = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, updatedAt: true, workerConfig: true },
    });
    if (!updatedCompany) {
      return NextResponse.json({ error: "Company not found after apply" }, { status: 404 });
    }

    const runtimeResult = await reconcileMiniappRuntime({
      companyId,
      currentEnabledMiniapps: currentEffective.enabledMiniapps,
      nextEnabledMiniapps: nextEffective.enabledMiniapps,
      actorId: "capability-transaction-api",
    });
    const [appliedClassScoutInstance, appliedCompareInstance] = await Promise.all([
      prisma.destinationInstance.findFirst({
        where: { companyId, destinationKey: "classscout", isActive: true },
        select: { id: true },
      }),
      prisma.destinationInstance.findFirst({
        where: { companyId, destinationKey: "compare", isActive: true },
        select: { id: true },
      }),
    ]);
    const appliedEffective = resolveEffectiveUnitCapabilities({
      workerConfig: updatedCompany.workerConfig,
      hasClassScoutDestination: Boolean(appliedClassScoutInstance),
      hasCompareDestination: Boolean(appliedCompareInstance),
    });
    const appliedPackage = resolveEffectiveUnitPackage({
      unitId: updatedCompany.id,
      workerConfig: updatedCompany.workerConfig,
      effectiveCapabilities: appliedEffective,
      hasClassScoutDestination: Boolean(appliedClassScoutInstance),
      hasCompareDestination: Boolean(appliedCompareInstance),
    });
    const appliedImpact = createImpact(
      currentPackage.visibleWebappAreas,
      appliedPackage.visibleWebappAreas,
      currentPackage.allowedOperations,
      appliedPackage.allowedOperations,
      currentEffective.enabledMiniapps,
      appliedEffective.enabledMiniapps,
    );
    const nextVersion = buildVersionToken(updatedCompany.updatedAt, updatedCompany.workerConfig);

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "settings-capabilities",
      interactionType: "CAPABILITY_TRANSACTION_APPLY",
      entityType: "COMPANY",
      entityId: companyId,
      beforeState: {
        version: currentVersion,
        capabilities: currentEffective,
      },
      afterState: {
        version: nextVersion,
        capabilities: appliedEffective,
      },
      payload: {
        mode: "apply",
        expectedVersion,
        idempotencyKey: idempotencyKey ?? undefined,
        warnings: nextWarnings,
        impact: appliedImpact,
        runtime: runtimeResult,
      },
      teachingWeight: 95,
    });

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      entityType: "COMPANY",
      entityId: companyId,
      outcomeType: "UNIT_CAPABILITIES_UPDATED",
      outcomeValue: appliedEffective.enabledBlocks.join(", "),
      beforeState: {
        version: currentVersion,
        capabilities: currentEffective,
      },
      afterState: {
        version: nextVersion,
        capabilities: appliedEffective,
      },
      payload: {
        idempotencyKey: idempotencyKey ?? undefined,
        runtime: runtimeResult,
      },
      teachingWeight: 95,
    });

    return NextResponse.json(
      buildSuccessResult({
        mode: "apply",
        version: nextVersion,
        enabledBlocks: appliedEffective.enabledBlocks,
        enabledModules: appliedEffective.enabledModules,
        enabledMiniapps: appliedEffective.enabledMiniapps,
        source: appliedEffective.source,
        warnings: [...nextWarnings, ...appliedEffective.warnings],
        impact: appliedImpact,
        runtime: runtimeResult,
      }),
    );
  } catch (error) {
    console.error("[API:CapabilityTransaction] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
