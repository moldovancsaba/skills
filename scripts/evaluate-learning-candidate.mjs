import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv) {
  const args = {
    evalPath: null,
    baselineModel: process.env.OLLAMA_MODEL || null,
    candidateModel: null,
    candidatePath: null,
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function tokenStats(reference, actual) {
  const referenceTokens = tokenize(reference);
  const actualTokens = tokenize(actual);
  const referenceSet = new Set(referenceTokens);
  const actualSet = new Set(actualTokens);
  let matches = 0;
  for (const token of referenceSet) {
    if (actualSet.has(token)) matches += 1;
  }

  const precision = actualSet.size ? matches / actualSet.size : 0;
  const recall = referenceSet.size ? matches / referenceSet.size : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
  };
}

function compact(value, max = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractJsonCandidate(content) {
  if (!content) return null;
  const cleaned = String(content).replace(/```json/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
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

function evaluationPrompt(testCase) {
  const targetType = testCase.kind;
  return [
    `Case kind: ${targetType}`,
    `Prompt: ${testCase.prompt}`,
    "Return only JSON.",
    "If this is a task-like case, use keys title, description, rationale.",
    "If this is a flashcard-like case, use keys title, body, rationale.",
    "Use the operator signal and company context to produce the strongest grounded refinement.",
    "Do not explain the schema. Do not include markdown fences.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parsePromptContext(prompt) {
  const text = String(prompt || "");
  const lines = text.split("\n");
  const getLineValue = (prefix) => {
    const line = lines.find((entry) => entry.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : "";
  };

  return {
    existingTitle: getLineValue("Existing task candidate:") || getLineValue("Existing flashcard candidate:") || getLineValue("Existing title:"),
    existingBody:
      getLineValue("Existing description:") ||
      getLineValue("Existing body:") ||
      getLineValue("Existing summary:"),
    operatorSignal: getLineValue("Operator signal:"),
    company: getLineValue("Company:"),
    industry: getLineValue("Industry:"),
  };
}

function signalKeywords(signal, context = {}) {
  const banned = new Set([
    ...tokenize(context.company || ""),
    ...tokenize(context.existingTitle || ""),
    ...tokenize(context.existingBody || ""),
    ...tokenize(context.industry || ""),
    "trace",
    "topic",
    "important",
    "needs",
    "good",
    "task",
    "knowledge",
    "base",
    "this",
    "that",
    "with",
    "from",
    "into",
    "here",
    "should",
  ]);

  const counts = new Map();
  for (const token of tokenize(signal)) {
    if (/[0-9]/.test(token)) continue;
    if (token.length > 18) continue;
    if (banned.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 24)
    .map(([token]) => token);
}

function ratio(value, target) {
  if (!target || target <= 0) return 0;
  return Math.min(value, target) / target;
}

function scoreOutput(testCase, output) {
  const expected = testCase.expected || {};
  const context = parsePromptContext(testCase.prompt);
  const actualTitle = output.title || "";
  const actualBody = output.description || output.body || "";
  const actualRationale = output.rationale || "";
  const actualCombined = [actualBody, actualRationale].filter(Boolean).join(" ");

  const titleStats = tokenStats(expected.title || "", actualTitle);
  const bodyStats = tokenStats(expected.description || expected.body || "", actualBody);
  const rationalePresence = actualRationale ? 1 : 0;
  const specificity = Number(
    (
      (ratio(tokenize(actualTitle).length, 4) * 0.35) +
      (ratio(tokenize(actualBody).length, 14) * 0.45) +
      (ratio(tokenize(actualRationale).length, 10) * 0.2)
    ).toFixed(4)
  );

  const signalTokens = signalKeywords(context.operatorSignal, context);
  const signalGrounding = signalTokens.length
    ? tokenStats(signalTokens.join(" "), actualCombined).recall
    : 0;

  const titleEcho = tokenStats(context.existingTitle || "", actualTitle).f1;
  const bodyEcho = tokenStats(context.existingBody || "", actualBody).f1;
  const echoAverage = Number(((titleEcho + bodyEcho) / 2).toFixed(4));
  const echoPenalty = echoAverage >= 0.98 && signalGrounding < 0.15 ? 0.25 : 0;

  const aggregate = Number(
    Math.max(
      0,
      (
        (titleStats.f1 * 0.28) +
        (bodyStats.f1 * 0.32) +
        (signalGrounding * 0.25) +
        (rationalePresence * 0.05) +
        (specificity * 0.1) -
        echoPenalty
      )
    ).toFixed(4)
  );

  return {
    aggregate,
    title: titleStats.f1,
    body: bodyStats.f1,
    rationale: rationalePresence,
    signalGrounding: Number(signalGrounding.toFixed(4)),
    specificity,
    echoPenalty,
    diagnostics: {
      titlePrecision: titleStats.precision,
      titleRecall: titleStats.recall,
      bodyPrecision: bodyStats.precision,
      bodyRecall: bodyStats.recall,
      titleEcho,
      bodyEcho,
      topSignalTokens: signalTokens.slice(0, 10),
    },
  };
}

async function evaluateModel(model, cases) {
  const system = "You are a checklist local AI candidate under evaluation. Return only strict JSON that is useful, business-specific, and evidence-grounded.";
  const results = [];

  for (const testCase of cases) {
    const output = await callOllamaJson(model, system, evaluationPrompt(testCase));
    const scores = scoreOutput(testCase, output);
    results.push({
      caseId: testCase.entityId,
      kind: testCase.kind,
      score: scores.aggregate,
      scores,
      output,
      expected: testCase.expected,
    });
  }

  const aggregateScore = results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1);
  const passRate = results.filter((item) => item.score >= 0.45).length / Math.max(results.length, 1);

  return {
    model,
    runtime: "ollama",
    aggregateScore: Number(aggregateScore.toFixed(4)),
    passRate: Number(passRate.toFixed(4)),
    totalCases: results.length,
    results,
  };
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
    const results = generated.map((item, index) => {
      const testCase = cases[index];
      const scores = scoreOutput(testCase, item.output || {});
      return {
        caseId: testCase.entityId,
        kind: testCase.kind,
        score: scores.aggregate,
        scores,
        output: item.output || {},
        expected: testCase.expected,
      };
    });

    const aggregateScore = results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1);
    const passRate = results.filter((item) => item.score >= 0.45).length / Math.max(results.length, 1);

    return {
      model: resolve(modelPath),
      runtime: "mlx",
      aggregateScore: Number(aggregateScore.toFixed(4)),
      passRate: Number(passRate.toFixed(4)),
      totalCases: results.length,
      results,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.evalPath) throw new Error("Missing required --eval <path> argument.");
  if (!args.baselineModel) throw new Error("Missing required --baseline-model <model> argument.");
  if (!args.candidateModel && !args.candidatePath) {
    throw new Error("Missing required candidate target. Use --candidate-model <model> or --candidate-path <path>.");
  }

  const evalPath = resolve(args.evalPath);
  const lines = (await readFile(evalPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const cases = lines.map((line) => JSON.parse(line));
  const limitedCases = args.limit ? cases.slice(0, args.limit) : cases;

  const baseline = await evaluateModel(args.baselineModel, limitedCases);
  const candidate = args.candidatePath
    ? await evaluateLocalMlxModel(args.candidatePath, limitedCases, evalPath)
    : await evaluateModel(args.candidateModel, limitedCases);

  const delta = Number((candidate.aggregateScore - baseline.aggregateScore).toFixed(4));
  const pass = candidate.aggregateScore >= baseline.aggregateScore - 0.03 && candidate.passRate >= baseline.passRate - 0.05;
  const report = {
    generatedAt: new Date().toISOString(),
    baseline,
    candidate,
    delta,
    promotionGate: {
      status: pass ? "PASS" : "REVIEW_REQUIRED",
      reason: pass
        ? "Candidate stayed within non-regression thresholds against the baseline."
        : "Candidate regressed beyond allowed aggregate or pass-rate thresholds.",
    },
  };

  if (args.report) {
    await writeFile(resolve(args.report), JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
  if (!pass) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
