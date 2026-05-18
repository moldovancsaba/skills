import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const args = {
    company: null,
    exportDir: null,
    model: null,
    baselineModel: process.env.OLLAMA_MODEL || "llama3.2:3b",
    output: null,
    candidateName: null,
    execute: false,
    register: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--company") {
      args.company = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--export") {
      args.exportDir = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--model") {
      args.model = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--baseline-model") {
      args.baselineModel = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--output") {
      args.output = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--candidate-name") {
      args.candidateName = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--execute") {
      args.execute = true;
    } else if (token === "--register") {
      args.register = true;
    }
  }

  return args;
}

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });
}

async function commandExists(command) {
  try {
    await runCommand("which", [command]);
    return true;
  } catch {
    return false;
  }
}

function assertAppleSilicon() {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("MLX training is Apple-Silicon-only. Run this on macOS arm64.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.exportDir && !args.company) {
    throw new Error("Provide either --export <training export dir> or --company <companyId>.");
  }
  if (!args.model) {
    throw new Error("Missing required --model <base-model> argument.");
  }

  let exportDir = args.exportDir ? resolve(args.exportDir) : null;
  if (!exportDir) {
    await runCommand("npm", [
      "run",
      "training:export",
      "--",
      "--company",
      args.company,
    ]);
    throw new Error("Automatic export completed into the default timestamped directory. Re-run with --export pointing at that directory.");
  }

  await runCommand("npm", [
    "run",
    "training:prepare-mlx",
    "--",
    "--export",
    exportDir,
    "--model",
    args.model,
    "--baseline-model",
    args.baselineModel,
    ...(args.output ? ["--output", args.output] : []),
    ...(args.company ? ["--company", args.company] : []),
    ...(args.candidateName ? ["--candidate-name", args.candidateName] : []),
  ]);

  const runDir = resolve(args.output || findLatestRunDir());
  const manifest = JSON.parse(readFileSync(resolve(runDir, "run-manifest.json"), "utf8"));

  if (!args.execute) {
    console.log(JSON.stringify({
      prepared: true,
      runDir,
      next: [
        `Review ${resolve(runDir, "commands.sh")}`,
        "Re-run with --execute on Apple Silicon to perform the full train/fuse/eval workflow.",
      ],
    }, null, 2));
    return;
  }

  assertAppleSilicon();
  if (!(await commandExists("mlx_lm.lora")) || !(await commandExists("mlx_lm.fuse"))) {
    throw new Error("mlx_lm.lora and mlx_lm.fuse must be available on PATH before using --execute.");
  }

  await runCommand("bash", [resolve(runDir, "commands.sh")]);

  if (args.register) {
    await runCommand("node", [
      resolve(process.cwd(), "scripts", "promote-learning-candidate.mjs"),
      "--action",
      "register",
      "--run",
      runDir,
    ]);
  }

  console.log(JSON.stringify({
    executed: true,
    runDir,
    evaluationReport: manifest.files.evaluationReport,
    registered: args.register,
  }, null, 2));
}

function findLatestRunDir() {
  throw new Error("When using the default output location, pass --output so the runner can resolve the prepared run directory deterministically.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
