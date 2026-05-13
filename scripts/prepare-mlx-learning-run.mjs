import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    exportDir: null,
    model: null,
    company: null,
    output: null,
    candidateName: null,
    baselineModel: process.env.OLLAMA_MODEL || "llama3.2:3b",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--export") {
      args.exportDir = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--model") {
      args.model = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--company") {
      args.company = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--output") {
      args.output = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--candidate-name") {
      args.candidateName = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--baseline-model") {
      args.baselineModel = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return args;
}

function runStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.exportDir) {
    throw new Error("Missing required --export <path> argument.");
  }
  if (!args.model) {
    throw new Error("Missing required --model <base-model> argument.");
  }

  const exportDir = resolve(args.exportDir);
  const manifestPath = join(exportDir, "manifest.json");
  const manifest = await readJson(manifestPath);
  const companyMeta = args.company
    ? manifest.companies.find((entry) => entry.companyId === args.company)
    : manifest.companies[0];

  if (!companyMeta) {
    throw new Error(`No company metadata found for ${args.company || "the requested export"}.`);
  }

  const runId = runStamp();
  const candidateName =
    args.candidateName ||
    `checklist-mlx-${companyMeta.companyId.slice(0, 8)}-${runId.slice(0, 16)}`;
  const runDir = resolve(args.output || join(process.cwd(), "training", "runs", runId));
  await mkdir(runDir, { recursive: true });

  const templatePath = resolve(process.cwd(), "training", "configs", "mlx", "checklist-lora.template.yaml");
  const template = await readFile(templatePath, "utf8");
  const adapterPath = join(runDir, "adapters");
  const fusedPath = join(runDir, "fused-model");
  const reportPath = join(runDir, "evaluation-report.json");

  const config = template
    .replace("/path/to/base-model-or-mlx-converted-model", args.model)
    .replace("/path/to/exported-datasets", join(runDir, "mlx-dataset"))
    .replace("/path/to/output/adapters", adapterPath);
  const ggufPath = join(runDir, "candidate.gguf");

  const ollamaTemplate = `FROM ${ggufPath}

PARAMETER temperature 0.2
PARAMETER num_ctx 8192

SYSTEM You are the checklist local AI candidate model. You must stay evidence-grounded, prefer company-specific actionability, respect operator feedback history, and avoid generic recommendations when the evidence is weak.
`;

  const commands = `#!/usr/bin/env bash
set -euo pipefail

# 0. Convert checklist exports into MLX-native train/valid/test files
npm run training:prepare-mlx-dataset -- --export ${shellQuote(exportDir)} --out ${shellQuote(join(runDir, "mlx-dataset"))}

# 1. Fine-tune on Apple Silicon with MLX / MLX-LM
mlx_lm.lora --config ${shellQuote(join(runDir, "mlx-lora.yaml"))}

# 2. Fuse the adapters into a local MLX candidate model
mlx_lm.fuse --model ${shellQuote(args.model)} --adapter-path ${shellQuote(adapterPath)} --save-path ${shellQuote(fusedPath)}

# 3. Evaluate the fused candidate locally against checklist cases
npm run training:eval -- --eval ${shellQuote(join(exportDir, "eval_cases.jsonl"))} --baseline-model ${shellQuote(args.baselineModel)} --candidate-path ${shellQuote(fusedPath)} --report ${shellQuote(reportPath)}

# 4. Optional: if the model family can be converted/imported cleanly, promote it into Ollama later
# ollama create ${shellQuote(candidateName)} -f ${shellQuote(join(runDir, "Modelfile"))}
`;

  const runManifest = {
    runId,
    generatedAt: new Date().toISOString(),
    candidateName,
    companyId: companyMeta.companyId,
    companyName: companyMeta.companyName,
    exportDir,
    baseModel: args.model,
    counts: companyMeta.counts,
    files: {
      mlxConfig: join(runDir, "mlx-lora.yaml"),
      commands: join(runDir, "commands.sh"),
      ollamaModelfile: join(runDir, "Modelfile"),
      ggufPath,
      mlxDataset: join(runDir, "mlx-dataset"),
      evaluationReport: reportPath,
      adapterPath,
      fusedPath,
    },
    gate: {
      status: "PENDING",
      baselineModel: args.baselineModel,
      candidateModel: candidateName,
      candidatePath: fusedPath,
    },
  };

  await Promise.all([
    writeFile(join(runDir, "mlx-lora.yaml"), config),
    writeFile(join(runDir, "Modelfile"), ollamaTemplate),
    writeFile(join(runDir, "commands.sh"), commands, { mode: 0o755 }),
    writeFile(join(runDir, "run-manifest.json"), JSON.stringify(runManifest, null, 2)),
  ]);

  console.log(`Prepared MLX learning run at ${runDir}`);
  console.log(JSON.stringify(runManifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
