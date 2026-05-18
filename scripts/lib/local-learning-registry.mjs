import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

export const LOCAL_LEARNING_REGISTRY_KEY = "local_learning_model_registry";

function shortRunId(runId) {
  return String(runId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
}

export function buildCandidateAliases(runManifest) {
  const shortId = shortRunId(runManifest.runId);
  return {
    candidateAlias: `checklist-candidate:${shortId}`,
    canaryAlias: `checklist-canary:${shortId}`,
  };
}

export async function loadRunBundle(runDir) {
  const manifestPath = resolve(runDir, "run-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const report = JSON.parse(await readFile(resolve(manifest.files.evaluationReport), "utf8"));
  return {
    runDir: resolve(runDir),
    manifest,
    report,
  };
}

export async function readRegistry(prisma) {
  const existing = await prisma.globalSetting.findUnique({
    where: { key: LOCAL_LEARNING_REGISTRY_KEY },
    select: { value: true },
  });
  return existing?.value || {
    version: 1,
    active: null,
    canary: null,
    rollback: null,
    candidates: [],
    updatedAt: null,
  };
}

export async function writeRegistry(prisma, registry) {
  const nextValue = {
    ...registry,
    updatedAt: new Date().toISOString(),
  };
  await prisma.globalSetting.upsert({
    where: { key: LOCAL_LEARNING_REGISTRY_KEY },
    create: {
      key: LOCAL_LEARNING_REGISTRY_KEY,
      value: nextValue,
    },
    update: {
      value: nextValue,
    },
  });
  return nextValue;
}

async function readStageModelSetting(prisma, key) {
  const record = await prisma.globalSetting.findUnique({
    where: { key },
    select: { value: true },
  });
  return typeof record?.value === "string" ? record.value : null;
}

export async function readActiveStageModels(prisma) {
  const [draft, write, judge] = await Promise.all([
    readStageModelSetting(prisma, "model_draft"),
    readStageModelSetting(prisma, "model_write"),
    readStageModelSetting(prisma, "model_judge"),
  ]);
  return {
    DRAFT: draft,
    WRITE: write,
    JUDGE: judge,
  };
}

export async function writeStageModels(prisma, stageModels) {
  const entries = [
    ["model_draft", stageModels.DRAFT],
    ["model_write", stageModels.WRITE],
    ["model_judge", stageModels.JUDGE],
  ];
  for (const [key, value] of entries) {
    if (!value) continue;
    await prisma.globalSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}

export function buildRegistryCandidate(runManifest, evaluationReport, aliases) {
  return {
    runId: runManifest.runId,
    candidateName: runManifest.candidateName,
    companyId: runManifest.companyId,
    companyName: runManifest.companyName,
    generatedAt: runManifest.generatedAt,
    exportDir: runManifest.exportDir,
    runDir: resolve(join(runManifest.files.commands, "..")),
    baseModel: runManifest.baseModel,
    baselineModel: evaluationReport.baseline.model,
    candidateModel: evaluationReport.candidate.model,
    gateStatus: evaluationReport.promotionGate.status,
    gateReason: evaluationReport.promotionGate.reason,
    aggregateScore: evaluationReport.candidate.aggregateScore,
    passRate: evaluationReport.candidate.passRate,
    totalCases: evaluationReport.candidate.totalCases,
    aliases,
    status: "REGISTERED",
    promotedAt: null,
    canaryAt: null,
    rollbackSnapshot: null,
  };
}
