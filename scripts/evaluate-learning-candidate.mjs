import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  compact,
  evaluateCasesWithOutputs,
  evaluationPrompt,
  extractJsonCandidate,
  summarizeRegressionGates,
} from "./lib/local-learning-gate.mjs";

function parseArgs(argv) {
  const args = {
    evalPath: null,
    baselineModel: process.env.OLLAMA_MODEL || null,
    candidateModel: null,
    candidatePath: null,
    baselineResults: null,
    candidateResults: null,
    report: null,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--eval") {
      args.evalPath = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--baseline-model") {
      args.baselineModel = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--candidate-model") {
      args.candidateModel = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--candidate-path") {
      args.candidatePath = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--baseline-results") {
      args.baselineResults = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--candidate-results") {
      args.candidateResults = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--report") {
      args.report = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--limit") {
      args.limit = Number(argv[index + 1] ?? "0") || null;
      index += 1;
    }
  }

  return args;
}

async function callOllamaJson(model, system, prompt) {
  const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
  const response = await fetch(new URL("/api/chat", host), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
        num_predict: 1024,
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status} for model ${model}`);
  }

  const payload = await response.json();
  const content = payload?.message?.content || "";
  const candidate = extractJsonCandidate(content);
  if (!candidate) {
    throw new Error(`Model ${model} returned no JSON payload.`);
  }
  return JSON.parse(candidate);
}

async function evaluateModel(model, cases) {
  const system =
    "You are a checklist local AI candidate under evaluation. Return only strict JSON that is useful, business-specific, evidence-grounded, and non-duplicative.";
  const outputs = [];

  for (const testCase of cases) {
    outputs.push(await callOllamaJson(model, system, evaluationPrompt(testCase)));
  }

  return evaluateCasesWithOutputs({
    model,
    runtime: "ollama",
    cases,
    outputs,
  });
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

async function evaluateLocalMlxModel(modelPath, cases, evalPath) {
  const tempDir = await mkdtemp(join(tmpdir(), "checklist-mlx-eval-"));
  const outputPath = join(tempDir, "candidate-results.json");
  try {
    const caseLimitArgs = cases.length ? ["--limit", String(cases.length)] : [];
    await runCommand("python3", [
      resolve(process.cwd(), "scripts", "evaluate-mlx-candidate.py"),
      "--model",
      resolve(modelPath),
      "--cases",
      resolve(evalPath),
      "--out",
      outputPath,
      ...caseLimitArgs,
    ]);

    const generated = JSON.parse(await readFile(outputPath, "utf8"));
    const outputs = generated.map((item) => item.output || {});
    return evaluateCasesWithOutputs({
      model: resolve(modelPath),
      runtime: "mlx",
      cases,
      outputs,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function readResultFixture(path) {
  const payload = JSON.parse(await readFile(resolve(path), "utf8"));
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.outputs)) return payload.outputs;
  throw new Error(`Unsupported result fixture format at ${path}`);
}

function buildTopCaseDiffs(baseline, candidate) {
  const baselineMap = new Map(baseline.results.map((item) => [item.caseId, item]));
  return candidate.results
    .map((result) => {
      const baselineCase = baselineMap.get(result.caseId);
      return {
        caseId: result.caseId,
        kind: result.kind,
        baselineScore: baselineCase?.score ?? 0,
        candidateScore: result.score,
        delta: Number((result.score - (baselineCase?.score ?? 0)).toFixed(4)),
      };
    })
    .sort((left, right) => left.delta - right.delta);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.evalPath) throw new Error("Missing required --eval <path> argument.");
  if (!args.baselineModel && !args.baselineResults) throw new Error("Missing required baseline target.");
  if (!args.candidateModel && !args.candidatePath && !args.candidateResults) {
    throw new Error("Missing required candidate target. Use --candidate-model, --candidate-path, or --candidate-results.");
  }

  const evalPath = resolve(args.evalPath);
  const lines = (await readFile(evalPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const cases = lines.map((line) => JSON.parse(line));
  const limitedCases = args.limit ? cases.slice(0, args.limit) : cases;

  const baseline = args.baselineResults
    ? evaluateCasesWithOutputs({
        model: "fixture-baseline",
        runtime: "fixture",
        cases: limitedCases,
        outputs: await readResultFixture(args.baselineResults),
      })
    : await evaluateModel(args.baselineModel, limitedCases);

  const candidate = args.candidateResults
    ? evaluateCasesWithOutputs({
        model: "fixture-candidate",
        runtime: "fixture",
        cases: limitedCases,
        outputs: await readResultFixture(args.candidateResults),
      })
    : args.candidatePath
      ? await evaluateLocalMlxModel(args.candidatePath, limitedCases, evalPath)
      : await evaluateModel(args.candidateModel, limitedCases);

  const delta = Number((candidate.aggregateScore - baseline.aggregateScore).toFixed(4));
  const regressionGate = summarizeRegressionGates(baseline, candidate);
  const report = {
    generatedAt: new Date().toISOString(),
    baseline,
    candidate,
    delta,
    regressionGate,
    promotionGate: {
      status: regressionGate.status,
      reason: regressionGate.reason,
      blockedPromotion: regressionGate.blockedPromotion,
    },
    topRegressions: buildTopCaseDiffs(baseline, candidate).slice(0, 12),
  };

  if (args.report) {
    await writeFile(resolve(args.report), JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
  if (regressionGate.blockedPromotion) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(compact(error?.stack || error?.message || String(error), 4000));
  process.exitCode = 1;
});
