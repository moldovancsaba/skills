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

function ratio(value, target) {
  if (!target || target <= 0) return 0;
  return Math.min(value, target) / target;
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

function parsePromptContext(prompt) {
  const text = String(prompt || "");
  const lines = text.split("\n");
  const getLineValue = (prefix) => {
    const line = lines.find((entry) => entry.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : "";
  };

  return {
    question: getLineValue("Question:"),
    existingTitle:
      getLineValue("Existing task candidate:") ||
      getLineValue("Existing flashcard candidate:") ||
      getLineValue("Existing title:"),
    existingBody:
      getLineValue("Existing description:") ||
      getLineValue("Existing body:") ||
      getLineValue("Existing summary:"),
    operatorSignal: getLineValue("Operator signal:"),
    company: getLineValue("Company:"),
    industry: getLineValue("Industry:"),
    evidenceBlock: lines
      .filter((line) => line.startsWith("- "))
      .join(" "),
  };
}

function signalKeywords(signal, context = {}) {
  const banned = new Set([
    ...tokenize(context.company || ""),
    ...tokenize(context.industry || ""),
    ...tokenize(context.existingTitle || ""),
    ...tokenize(context.existingBody || ""),
    ...tokenize(context.question || ""),
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
    "return",
    "json",
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

function parseRankedTitles(output) {
  if (Array.isArray(output?.rankedTitles)) {
    return output.rankedTitles.map((entry) => compact(entry, 200)).filter(Boolean);
  }
  if (Array.isArray(output?.titles)) {
    return output.titles.map((entry) => compact(entry, 200)).filter(Boolean);
  }
  return [];
}

function scoreTaskOrFlashcard(testCase, output) {
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
    diagnostics: {
      title: titleStats.f1,
      body: bodyStats.f1,
      rationalePresence,
      signalGrounding: Number(signalGrounding.toFixed(4)),
      specificity,
      echoPenalty,
    },
  };
}

function scoreGroundedAnswer(testCase, output) {
  const expected = testCase.expected || {};
  const context = parsePromptContext(testCase.prompt);
  const actualSummary = output.summary || output.answer || output.body || "";
  const actualActions = Array.isArray(output.nextActions) ? output.nextActions.join(" ") : String(output.nextActions || "");
  const actualConfidence = String(output.confidence || "").toUpperCase();
  const actualCombined = [actualSummary, actualActions].filter(Boolean).join(" ");
  const evidenceTerms = Array.isArray(expected.evidenceTerms) ? expected.evidenceTerms : tokenize(expected.summary || "");
  const actionTerms = Array.isArray(expected.nextActions) ? expected.nextActions.flatMap((entry) => tokenize(entry)) : [];

  const summaryCoverage = tokenStats(expected.summary || "", actualSummary).f1;
  const evidenceCoverage = evidenceTerms.length
    ? evidenceTerms.filter((term) => normalizeText(actualCombined).includes(normalizeText(term))).length / evidenceTerms.length
    : 0.5;
  const actionability = actionTerms.length
    ? actionTerms.filter((term) => normalizeText(actualActions).includes(normalizeText(term))).length / actionTerms.length
    : ratio(tokenize(actualActions).length, 6);
  const groundedSignal = tokenStats(context.evidenceBlock || "", actualCombined).precision;
  const unsafeConfidencePenalty = actualConfidence === "HIGH" && evidenceCoverage < 0.45 ? 0.2 : 0;

  const aggregate = Number(
    Math.max(
      0,
      (
        (summaryCoverage * 0.28) +
        (evidenceCoverage * 0.32) +
        (actionability * 0.2) +
        (groundedSignal * 0.2) -
        unsafeConfidencePenalty
      )
    ).toFixed(4)
  );

  return {
    aggregate,
    diagnostics: {
      summaryCoverage: Number(summaryCoverage.toFixed(4)),
      evidenceCoverage: Number(evidenceCoverage.toFixed(4)),
      actionability: Number(actionability.toFixed(4)),
      groundedSignal: Number(groundedSignal.toFixed(4)),
      unsafeConfidencePenalty,
    },
  };
}

function scoreSearchRanking(testCase, output) {
  const expected = testCase.expected || {};
  const rankedTitles = parseRankedTitles(output);
  const expectedTitles = Array.isArray(expected.rankedTitles) ? expected.rankedTitles : [];
  const rationale = output.rationale || "";
  const normalizedActual = rankedTitles.map((title) => normalizeText(title));
  const normalizedExpected = expectedTitles.map((title) => normalizeText(title));

  const top1 = normalizedActual[0] && normalizedExpected[0] && normalizedActual[0] === normalizedExpected[0] ? 1 : 0;
  const overlap = normalizedExpected.length
    ? normalizedExpected.filter((title) => normalizedActual.includes(title)).length / normalizedExpected.length
    : 0;
  const ordering = normalizedExpected.length >= 2 && normalizedActual.length >= 2
    ? Number(normalizedActual.slice(0, normalizedExpected.length).every((title, index) => title === normalizedExpected[index]))
    : top1;
  const rationaleTerms = Array.isArray(expected.rationaleTerms) ? expected.rationaleTerms : tokenize(expected.rationale || "");
  const rationaleCoverage = rationaleTerms.length
    ? rationaleTerms.filter((term) => normalizeText(rationale).includes(normalizeText(term))).length / rationaleTerms.length
    : ratio(tokenize(rationale).length, 8);

  const aggregate = Number(
    (
      (top1 * 0.4) +
      (overlap * 0.25) +
      (ordering * 0.2) +
      (rationaleCoverage * 0.15)
    ).toFixed(4)
  );

  return {
    aggregate,
    diagnostics: {
      top1,
      overlap: Number(overlap.toFixed(4)),
      ordering,
      rationaleCoverage: Number(rationaleCoverage.toFixed(4)),
    },
  };
}

export function evaluationPrompt(testCase) {
  const kind = String(testCase.kind || "").toUpperCase();
  if (kind === "GROUNDED_ANSWER") {
    return [
      "Return only JSON.",
      `Question: ${testCase.prompt}`,
      "Use keys summary, confidence, nextActions.",
      "Confidence must be LOW, MEDIUM, or HIGH.",
      "Ground the answer in the provided evidence and propose specific next actions.",
      "Do not include markdown fences.",
    ].join("\n");
  }

  if (kind === "SEARCH_RANKING") {
    return [
      "Return only JSON.",
      `Prompt: ${testCase.prompt}`,
      "Use keys rankedTitles and rationale.",
      "rankedTitles must be an ordered array from strongest to weakest candidate.",
      "Do not include markdown fences.",
    ].join("\n");
  }

  return [
    `Case kind: ${kind}`,
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

export function scoreOutput(testCase, output) {
  const kind = String(testCase.kind || "").toUpperCase();
  if (kind === "GROUNDED_ANSWER") {
    return scoreGroundedAnswer(testCase, output);
  }
  if (kind === "SEARCH_RANKING") {
    return scoreSearchRanking(testCase, output);
  }
  return scoreTaskOrFlashcard(testCase, output);
}

function duplicateFingerprint(output) {
  const title = normalizeText(output?.title || output?.summary || "");
  const body = normalizeText(output?.description || output?.body || output?.rationale || "");
  return `${title}::${body.slice(0, 180)}`;
}

function nearDuplicateRate(results) {
  if (results.length <= 1) return 0;
  let duplicatePairs = 0;
  let totalPairs = 0;
  for (let index = 0; index < results.length; index += 1) {
    for (let inner = index + 1; inner < results.length; inner += 1) {
      totalPairs += 1;
      const left = duplicateFingerprint(results[index].output);
      const right = duplicateFingerprint(results[inner].output);
      const similarity = tokenStats(left, right).f1;
      if (similarity >= 0.92) duplicatePairs += 1;
    }
  }
  return totalPairs > 0 ? duplicatePairs / totalPairs : 0;
}

function buildCaseGroup(results, kinds) {
  return results.filter((result) => kinds.includes(String(result.kind || "").toUpperCase()));
}

export function summarizeRegressionGates(baseline, candidate) {
  const candidateResults = candidate.results || [];
  const baselineResults = baseline.results || [];
  const baselineMap = new Map(baselineResults.map((result) => [result.caseId, result]));

  const groupedCandidate = {
    knowledge: buildCaseGroup(candidateResults, ["TASK", "FLASHCARD"]),
    groundedAnswers: buildCaseGroup(candidateResults, ["GROUNDED_ANSWER"]),
    ranking: buildCaseGroup(candidateResults, ["SEARCH_RANKING"]),
  };

  const groupedBaseline = {
    knowledge: buildCaseGroup(baselineResults, ["TASK", "FLASHCARD"]),
    groundedAnswers: buildCaseGroup(baselineResults, ["GROUNDED_ANSWER"]),
    ranking: buildCaseGroup(baselineResults, ["SEARCH_RANKING"]),
  };

  const summarizeGroup = (label, candidateGroup, baselineGroup, maxDelta = 0.05) => {
    const candidateScore = candidateGroup.reduce((sum, item) => sum + item.score, 0) / Math.max(candidateGroup.length, 1);
    const baselineScore = baselineGroup.reduce((sum, item) => sum + item.score, 0) / Math.max(baselineGroup.length, 1);
    const delta = Number((candidateScore - baselineScore).toFixed(4));
    const passed = candidateGroup.length === 0 || delta >= -maxDelta;
    return {
      label,
      passed,
      baselineScore: Number(baselineScore.toFixed(4)),
      candidateScore: Number(candidateScore.toFixed(4)),
      delta,
      reason: passed
        ? `${label} stayed within the allowed non-regression window.`
        : `${label} regressed beyond the allowed ${maxDelta} window.`,
    };
  };

  const duplicateRate = Number(nearDuplicateRate(candidateResults).toFixed(4));
  const baselineDuplicateRate = Number(nearDuplicateRate(baselineResults).toFixed(4));
  const duplicateGatePassed = duplicateRate <= 0.08 && duplicateRate <= baselineDuplicateRate + 0.05;

  const aggregatePassed =
    candidate.aggregateScore >= baseline.aggregateScore - 0.03 &&
    candidate.passRate >= baseline.passRate - 0.05;

  const checks = [
    {
      label: "aggregate-non-regression",
      passed: aggregatePassed,
      baselineScore: baseline.aggregateScore,
      candidateScore: candidate.aggregateScore,
      delta: Number((candidate.aggregateScore - baseline.aggregateScore).toFixed(4)),
      reason: aggregatePassed
        ? "Candidate stayed within aggregate non-regression thresholds."
        : "Candidate regressed beyond aggregate score or pass-rate thresholds.",
    },
    summarizeGroup("knowledge-quality", groupedCandidate.knowledge, groupedBaseline.knowledge, 0.05),
    summarizeGroup("grounded-answers", groupedCandidate.groundedAnswers, groupedBaseline.groundedAnswers, 0.05),
    summarizeGroup("ranking-health", groupedCandidate.ranking, groupedBaseline.ranking, 0.05),
    {
      label: "duplicate-suppression",
      passed: duplicateGatePassed,
      baselineScore: baselineDuplicateRate,
      candidateScore: duplicateRate,
      delta: Number((duplicateRate - baselineDuplicateRate).toFixed(4)),
      reason: duplicateGatePassed
        ? "Candidate outputs stayed within duplicate-suppression tolerance."
        : "Candidate output duplication exceeded the allowed tolerance.",
    },
  ];

  const failedChecks = checks.filter((check) => !check.passed);
  return {
    status: failedChecks.length === 0 ? "PASS" : "REVIEW_REQUIRED",
    reason:
      failedChecks.length === 0
        ? "Candidate cleared all ranking, knowledge, grounded-answer, and duplicate-suppression gates."
        : failedChecks.map((check) => check.reason).join(" "),
    blockedPromotion: failedChecks.length > 0,
    checks,
    deltas: candidateResults
      .map((result) => {
        const baselineResult = baselineMap.get(result.caseId);
        return {
          caseId: result.caseId,
          kind: result.kind,
          baselineScore: baselineResult?.score ?? 0,
          candidateScore: result.score,
          delta: Number((result.score - (baselineResult?.score ?? 0)).toFixed(4)),
        };
      })
      .sort((left, right) => left.delta - right.delta),
  };
}

export function evaluateCasesWithOutputs({ model, runtime, cases, outputs }) {
  const results = cases.map((testCase, index) => {
    const output = outputs[index] || {};
    const scores = scoreOutput(testCase, output);
    return {
      caseId: testCase.entityId || testCase.caseId || `case-${index + 1}`,
      kind: String(testCase.kind || "").toUpperCase(),
      score: scores.aggregate,
      scores,
      output,
      expected: testCase.expected,
      metadata: testCase.metadata || {},
    };
  });

  const aggregateScore = results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1);
  const passRate = results.filter((item) => item.score >= 0.45).length / Math.max(results.length, 1);

  return {
    model,
    runtime,
    aggregateScore: Number(aggregateScore.toFixed(4)),
    passRate: Number(passRate.toFixed(4)),
    totalCases: results.length,
    results,
  };
}

export {
  compact,
  extractJsonCandidate,
  normalizeText,
  tokenize,
};
