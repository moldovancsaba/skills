import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { prisma } from "@/lib/db";

export type LocalLearningRunSummary = {
  runId: string;
  generatedAt: string;
  candidateName: string;
  companyId: string;
  companyName: string;
  exportDir: string;
  exportLabel: string;
  baseModel: string;
  baselineModel: string;
  candidateModel: string;
  gateStatus: "PENDING" | "PASS" | "REVIEW_REQUIRED";
  gateReason: string;
  counts: {
    sftTasks: number;
    sftFlashcards: number;
    prefTasks: number;
    prefFlashcards: number;
    evalCases: number;
  };
  files: {
    mlxConfig: string;
    commands: string;
    ollamaModelfile: string;
    ggufPath?: string;
    mlxDataset?: string;
    evaluationReport: string;
    adapterPath: string;
    fusedPath: string;
    registryScript?: string;
  };
  report: null | {
    baselineModel: string;
    candidateModel: string;
    baselineScore: number;
    candidateScore: number;
    baselinePassRate: number;
    candidatePassRate: number;
    delta: number;
    totalCases: number;
    blockedPromotion?: boolean;
  };
};

export type LocalLearningRegistry = {
  version: number;
  active: null | {
    runId: string;
    candidateName: string;
    candidateModel: string;
    alias: string;
    promotedAt: string;
    baselineModel: string;
  };
  canary: null | {
    runId: string;
    alias: string;
    candidateName: string;
    applied: boolean;
    activatedAt: string;
  };
  rollback: null | {
    runId: string;
    previousStageModels: {
      DRAFT: string | null;
      WRITE: string | null;
      JUDGE: string | null;
    };
    capturedAt: string;
    rolledBackAt?: string;
  };
  candidates: Array<{
    runId: string;
    candidateName: string;
    companyId: string;
    companyName: string;
    gateStatus: "PASS" | "REVIEW_REQUIRED" | "PENDING";
    gateReason: string;
    aggregateScore: number;
    passRate: number;
    totalCases: number;
    status: string;
    aliases?: {
      candidateAlias?: string;
      canaryAlias?: string;
    };
    promotedAt?: string | null;
    canaryAt?: string | null;
  }>;
  updatedAt: string | null;
};

type RunManifest = {
  runId: string;
  generatedAt: string;
  candidateName: string;
  companyId: string;
  companyName: string;
  exportDir: string;
  baseModel: string;
  counts: LocalLearningRunSummary["counts"];
  files: LocalLearningRunSummary["files"];
  gate: {
    status: "PENDING" | "PASS" | "REVIEW_REQUIRED";
    baselineModel: string;
    candidateModel: string;
    candidatePath?: string;
  };
};

type EvaluationReport = {
  baseline: {
    model: string;
    aggregateScore: number;
    passRate: number;
    totalCases: number;
  };
  candidate: {
    model: string;
    aggregateScore: number;
    passRate: number;
    totalCases: number;
  };
  delta: number;
  promotionGate: {
    status: "PASS" | "REVIEW_REQUIRED";
    reason: string;
    blockedPromotion?: boolean;
  };
};

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function listLocalLearningRuns(limit = 12): Promise<LocalLearningRunSummary[]> {
  const runsDir = join(process.cwd(), "training", "runs");
  if (!existsSync(runsDir)) {
    return [];
  }

  const entries = await readdir(runsDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => join(runsDir, entry.name));

  const runs = await Promise.all(
    directories.map(async (directory) => {
      const manifest = await readJsonFile<RunManifest>(join(directory, "run-manifest.json"));
      if (!manifest) return null;

      const report = await readJsonFile<EvaluationReport>(manifest.files.evaluationReport);
      return {
        runId: manifest.runId,
        generatedAt: manifest.generatedAt,
        candidateName: manifest.candidateName,
        companyId: manifest.companyId,
        companyName: manifest.companyName,
        exportDir: manifest.exportDir,
        exportLabel: basename(manifest.exportDir),
        baseModel: manifest.baseModel,
        baselineModel: report?.baseline.model || manifest.gate.baselineModel,
        candidateModel: report?.candidate.model || manifest.gate.candidateModel,
        gateStatus: report?.promotionGate.status || manifest.gate.status,
        gateReason: report?.promotionGate.reason || "Candidate has not completed local evaluation yet.",
        counts: manifest.counts,
        files: manifest.files,
        report: report
          ? {
              baselineModel: report.baseline.model,
              candidateModel: report.candidate.model,
              baselineScore: report.baseline.aggregateScore,
              candidateScore: report.candidate.aggregateScore,
              baselinePassRate: report.baseline.passRate,
              candidatePassRate: report.candidate.passRate,
              delta: report.delta,
              totalCases: report.candidate.totalCases,
            }
          : null,
      } satisfies LocalLearningRunSummary;
    }),
  );

  return runs
    .filter((value): value is LocalLearningRunSummary => Boolean(value))
    .sort((left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime())
    .slice(0, limit);
}

export async function getLocalLearningRun(runId: string): Promise<LocalLearningRunSummary | null> {
  const runs = await listLocalLearningRuns(100);
  return runs.find((run) => run.runId === runId) ?? null;
}

export async function getLocalLearningRegistry(): Promise<LocalLearningRegistry> {
  const record = await prisma.globalSetting.findUnique({
    where: { key: "local_learning_model_registry" },
    select: { value: true },
  });
  return (record?.value as LocalLearningRegistry | null) || {
    version: 1,
    active: null,
    canary: null,
    rollback: null,
    candidates: [],
    updatedAt: null,
  };
}
