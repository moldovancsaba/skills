import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    evalPath: null,
    baselineModel: process.env.OLLAMA_MODEL || null,
    candidateModel: null,
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

function overlapScore(expected, actual) {
  const expectedTokens = new Set(tokenize(expected));
  const actualTokens = new Set(tokenize(actual));
  if (expectedTokens.size === 0) return 0;
  let matches = 0;
  for (const token of expectedTokens) {
    if (actualTokens.has(token)) matches += 1;
  }
  return matches / expectedTokens.size;
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
  const expected = testCase.expected || {};
  const targetType = testCase.kind;
  return [
    `Case kind: ${targetType}`,
    `Prompt: ${testCase.prompt}`,
    "Return only JSON.",
    "If this is a task-like case, use keys title, description, rationale.",
    "If this is a flashcard-like case, use keys title, body, rationale.",
    `Expected reference title: ${compact(expected.title || "", 220)}`,
    expected.description ? `Expected reference description: ${compact(expected.description, 500)}` : null,
    expected.body ? `Expected reference body: ${compact(expected.body, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function scoreOutput(testCase, output) {
  const expected = testCase.expected || {};
  const actualTitle = output.title || "";
  const actualBody = output.description || output.body || "";
  const actualRationale = output.rationale || "";

  const title = overlapScore(expected.title || "", actualTitle);
  const body = overlapScore(expected.description || expected.body || "", actualBody);
  const rationale = actualRationale ? 1 : 0;
  const aggregate = Number(((title * 0.4) + (body * 0.45) + (rationale * 0.15)).toFixed(4));
  return {
    aggregate,
    title,
    body,
    rationale,
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
    aggregateScore: Number(aggregateScore.toFixed(4)),
    passRate: Number(passRate.toFixed(4)),
    totalCases: results.length,
    results,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.evalPath) throw new Error("Missing required --eval <path> argument.");
  if (!args.baselineModel) throw new Error("Missing required --baseline-model <model> argument.");
  if (!args.candidateModel) throw new Error("Missing required --candidate-model <model> argument.");

  const evalPath = resolve(args.evalPath);
  const lines = (await readFile(evalPath, "utf8"))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const cases = lines.map((line) => JSON.parse(line));
  const limitedCases = args.limit ? cases.slice(0, args.limit) : cases;

  const [baseline, candidate] = await Promise.all([
    evaluateModel(args.baselineModel, limitedCases),
    evaluateModel(args.candidateModel, limitedCases),
  ]);

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
