import { existsSync, statSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const REQUIRED_EXPORT_FILES = Object.freeze([
  "manifest.json",
  "sft_tasks.alpaca.jsonl",
  "sft_flashcards.alpaca.jsonl",
  "eval_cases.jsonl",
]);

function parseArgs(argv) {
  const args = {
    exportDir: null,
    model: process.env.MLX_BASE_MODEL || null,
    evalPath: null,
    out: "logs/audits/local-delivery-recovery/training-readiness.json",
    prepareDataset: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--export") {
      args.exportDir = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--model") {
      args.model = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--eval") {
      args.evalPath = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--out") {
      args.out = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--prepare-dataset") {
      args.prepareDataset = true;
    }
  }

  return args;
}

function lineCount(raw) {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).length;
}

async function findLatestExportDir() {
  const root = resolve(process.cwd(), "training", "exports");
  if (!existsSync(root)) return null;
  const entries = await readdir(root, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(root, entry.name);
      const stats = statSync(path);
      return { path, mtimeMs: stats.mtimeMs };
    })
    .filter((entry) => existsSync(join(entry.path, "manifest.json")))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  return candidates[0]?.path ?? null;
}

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

async function inspectExport(exportDir) {
  if (!exportDir) {
    return {
      ready: false,
      blocker: "DATA_BLOCKED",
      reason: "No export directory provided and no timestamped export found under training/exports.",
      files: {},
      counts: {},
    };
  }

  const files = {};
  const counts = {};
  for (const file of REQUIRED_EXPORT_FILES) {
    const path = join(exportDir, file);
    files[file] = existsSync(path);
    if (files[file] && file.endsWith(".jsonl")) {
      counts[file] = lineCount(await readFile(path, "utf8"));
    }
  }

  const missing = Object.entries(files).filter(([, present]) => !present).map(([file]) => file);
  return {
    ready: missing.length === 0,
    blocker: missing.length ? "DATA_BLOCKED" : null,
    reason: missing.length ? `Missing required export files: ${missing.join(", ")}` : null,
    files,
    counts,
  };
}

function inspectBaseModel(model) {
  const normalized = String(model || "").trim();
  if (!normalized) {
    return {
      ready: false,
      blocker: "MODEL_BLOCKED",
      reason: "Missing base MLX model. Pass --model <base-model> or set MLX_BASE_MODEL.",
      model: null,
    };
  }

  return {
    ready: true,
    blocker: null,
    reason: null,
    model: normalized,
  };
}

async function inspectEvalInput(exportDir, evalPath) {
  const resolved = resolve(evalPath || (exportDir ? join(exportDir, "eval_cases.jsonl") : ""));
  if (!exportDir && !evalPath) {
    return {
      ready: false,
      blocker: "EVAL_BLOCKED",
      reason: "No eval path provided and no export directory was resolved.",
      evalPath: null,
      caseCount: 0,
    };
  }
  if (!existsSync(resolved)) {
    return {
      ready: false,
      blocker: "EVAL_BLOCKED",
      reason: `Evaluation input not found at ${resolved}.`,
      evalPath: resolved,
      caseCount: 0,
    };
  }

  return {
    ready: true,
    blocker: null,
    reason: null,
    evalPath: resolved,
    caseCount: lineCount(await readFile(resolved, "utf8")),
  };
}

async function maybePrepareMlxDataset(exportDir, enabled) {
  if (!enabled || !exportDir) {
    return {
      ready: false,
      skipped: true,
      outputDir: exportDir ? join(exportDir, "mlx-sft") : null,
      reason: enabled ? "No export directory resolved." : "Dataset preparation skipped. Pass --prepare-dataset to run conversion.",
    };
  }

  await runCommand("npm", [
    "run",
    "training:prepare-mlx-dataset",
    "--",
    "--export",
    exportDir,
    "--out",
    join(exportDir, "mlx-sft"),
  ]);

  const manifestPath = join(exportDir, "mlx-sft", "manifest.json");
  return {
    ready: existsSync(manifestPath),
    skipped: false,
    outputDir: join(exportDir, "mlx-sft"),
    manifestPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resolvedLatestExport = await findLatestExportDir();
  const requestedExportPath = args.exportDir || resolvedLatestExport;
  const exportPath = requestedExportPath ? resolve(requestedExportPath) : null;
  const exportDir = exportPath && existsSync(exportPath) ? exportPath : null;
  const [exportInspection, modelInspection, evalInspection] = await Promise.all([
    inspectExport(exportDir),
    Promise.resolve(inspectBaseModel(args.model)),
    inspectEvalInput(exportDir, args.evalPath),
  ]);
  const mlxDataset = await maybePrepareMlxDataset(exportDir, args.prepareDataset && exportInspection.ready);
  const blockers = [
    exportInspection.blocker,
    modelInspection.blocker,
    evalInspection.blocker,
    mlxDataset.ready || mlxDataset.skipped ? null : "DATASET_PREP_BLOCKED",
  ].filter(Boolean);
  const report = {
    generatedAt: new Date().toISOString(),
    exportPath: exportDir,
    exportSource: args.exportDir ? "argument" : "latest_export_resolver",
    mlxDatasetReady: Boolean(mlxDataset.ready),
    baseModelReady: modelInspection.ready,
    evalInputReady: evalInspection.ready,
    canRunTraining: blockers.length === 0,
    canPromote: false,
    promotionBlockedReason: "Readiness mode never promotes. Run training and evaluation, then use training:promote explicitly.",
    blockers,
    exportInspection,
    modelInspection,
    evalInspection,
    mlxDataset,
    next: blockers.length === 0
      ? [
          `npm run training:prepare-mlx -- --export ${exportDir} --model ${modelInspection.model}`,
          "Review generated commands.sh before any --execute run.",
        ]
      : [
          "Resolve blockers before training.",
          "Run npm run training:export if DATA_BLOCKED.",
          "Pass --model <base-model> or set MLX_BASE_MODEL if MODEL_BLOCKED.",
          "Pass --eval <path> or ensure eval_cases.jsonl exists if EVAL_BLOCKED.",
        ],
  };

  const outPath = resolve(args.out);
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ok: blockers.length === 0, outPath, blockers, exportPath: exportDir }, null, 2));
  if (blockers.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
