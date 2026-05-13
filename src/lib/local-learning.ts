import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

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
    evaluationReport: string;
    adapterPath: string;
    fusedPath: string;
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
  };
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
