import { PrismaClient } from "@prisma/client";
import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  buildCandidateAliases,
  buildRegistryCandidate,
  loadRunBundle,
  readActiveStageModels,
  readRegistry,
  writeRegistry,
  writeStageModels,
} from "./lib/local-learning-registry.mjs";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    action: null,
    run: null,
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--action") {
      args.action = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--run") {
      args.run = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--apply") {
      args.apply = true;
    }
  }

  return args;
}

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
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
        rejectPromise(new Error(`${command} exited with code ${code}\n${stderr}`));
        return;
      }
      resolvePromise({ stdout, stderr });
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

async function ensureCanaryModelfile(runDir, alias, sourceModelOrPath) {
  const canaryDir = resolve(runDir, "ollama-canary");
  const modelfilePath = join(canaryDir, "Modelfile");
  await writeFile(
    modelfilePath,
    `FROM ${sourceModelOrPath}

PARAMETER temperature 0.2
PARAMETER num_ctx 8192

SYSTEM You are the checklist local AI canary candidate ${alias}. Stay evidence-grounded, business-specific, and conservative when evidence is weak.
`,
  );
  return { canaryDir, modelfilePath };
}

async function registerCandidate(runDir) {
  const { manifest, report } = await loadRunBundle(runDir);
  const registry = await readRegistry(prisma);
  const aliases = buildCandidateAliases(manifest);
  const candidate = buildRegistryCandidate(manifest, report, aliases);

  const existingIndex = registry.candidates.findIndex((entry) => entry.runId === candidate.runId);
  if (existingIndex >= 0) {
    registry.candidates[existingIndex] = {
      ...registry.candidates[existingIndex],
      ...candidate,
      status: registry.candidates[existingIndex].status || "REGISTERED",
    };
  } else {
    registry.candidates.unshift(candidate);
  }

  await writeRegistry(prisma, registry);
  return candidate;
}

async function markCanary(runDir, apply) {
  const { manifest, report } = await loadRunBundle(runDir);
  if (report.promotionGate.status !== "PASS") {
    throw new Error("Candidate did not pass the local evaluation gate and cannot enter canary.");
  }

  const registry = await readRegistry(prisma);
  const aliases = buildCandidateAliases(manifest);
  const existing = registry.candidates.find((entry) => entry.runId === manifest.runId) || buildRegistryCandidate(manifest, report, aliases);
  const sourceModelOrPath = manifest.files.ggufPath || manifest.files.fusedPath || report.candidate.model;
  const modelfile = await ensureCanaryModelfile(runDir, aliases.canaryAlias, sourceModelOrPath);

  if (apply) {
    const hasOllama = await commandExists("ollama");
    if (!hasOllama) {
      throw new Error("ollama CLI is not installed. Re-run without --apply or install ollama.");
    }
    await runCommand("ollama", ["create", aliases.canaryAlias, "-f", modelfile.modelfilePath]);
  }

  existing.status = "CANARY_READY";
  existing.canaryAt = new Date().toISOString();
  existing.aliases = aliases;
  existing.canary = {
    alias: aliases.canaryAlias,
    modelfile: modelfile.modelfilePath,
    applied: apply,
  };

  const existingIndex = registry.candidates.findIndex((entry) => entry.runId === existing.runId);
  if (existingIndex >= 0) registry.candidates[existingIndex] = existing;
  else registry.candidates.unshift(existing);
  registry.canary = {
    runId: existing.runId,
    alias: aliases.canaryAlias,
    candidateName: existing.candidateName,
    applied: apply,
    activatedAt: existing.canaryAt,
  };
  await writeRegistry(prisma, registry);
  return existing;
}

async function promoteCandidate(runDir) {
  const { manifest, report } = await loadRunBundle(runDir);
  if (report.promotionGate.status !== "PASS") {
    throw new Error("Candidate did not pass the local evaluation gate and cannot be promoted.");
  }

  const registry = await readRegistry(prisma);
  const aliases = buildCandidateAliases(manifest);
  const existing = registry.candidates.find((entry) => entry.runId === manifest.runId) || buildRegistryCandidate(manifest, report, aliases);
  const previousStageModels = await readActiveStageModels(prisma);
  const stageModels = {
    DRAFT: aliases.canaryAlias,
    WRITE: aliases.canaryAlias,
    JUDGE: aliases.canaryAlias,
  };

  await writeStageModels(prisma, stageModels);

  existing.status = "PROMOTED";
  existing.promotedAt = new Date().toISOString();
  existing.rollbackSnapshot = previousStageModels;
  existing.aliases = aliases;

  const existingIndex = registry.candidates.findIndex((entry) => entry.runId === existing.runId);
  if (existingIndex >= 0) registry.candidates[existingIndex] = existing;
  else registry.candidates.unshift(existing);

  registry.rollback = {
    runId: existing.runId,
    previousStageModels,
    capturedAt: existing.promotedAt,
  };
  registry.active = {
    runId: existing.runId,
    candidateName: existing.candidateName,
    candidateModel: report.candidate.model,
    alias: aliases.canaryAlias,
    promotedAt: existing.promotedAt,
    baselineModel: report.baseline.model,
  };

  await writeRegistry(prisma, registry);
  return existing;
}

async function rollbackPromotion() {
  const registry = await readRegistry(prisma);
  if (!registry.rollback?.previousStageModels) {
    throw new Error("No rollback snapshot is available.");
  }
  await writeStageModels(prisma, registry.rollback.previousStageModels);
  registry.active = null;
  registry.canary = null;
  registry.rollback.rolledBackAt = new Date().toISOString();
  await writeRegistry(prisma, registry);
  return registry.rollback;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.action) {
    throw new Error("Missing required --action <register|canary|promote|rollback> argument.");
  }
  if (args.action !== "rollback" && !args.run) {
    throw new Error("Missing required --run <training/runs/...> argument.");
  }

  let result;
  if (args.action === "register") {
    result = await registerCandidate(resolve(args.run));
  } else if (args.action === "canary") {
    result = await markCanary(resolve(args.run), args.apply);
  } else if (args.action === "promote") {
    result = await promoteCandidate(resolve(args.run));
  } else if (args.action === "rollback") {
    result = await rollbackPromotion();
  } else {
    throw new Error(`Unsupported action ${args.action}`);
  }

  console.log(JSON.stringify({ action: args.action, result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
