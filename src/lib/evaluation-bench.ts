export type EvaluationCaseKind =
  | "GROUNDED_ANSWER"
  | "SEARCH_RANKING"
  | "KPI_PULSE"
  | "WORKFLOW_BLUEPRINT"
  | "COMPETITIVE_BRIEF"
  | "DATA_READINESS"
  | "RECOMMENDATION";

export type EvaluationRubricKey =
  | "evidenceUse"
  | "citationCorrectness"
  | "actionability"
  | "duplication"
  | "unsafeConfidence"
  | "tenantIsolation"
  | "downstreamQuality";

export type EvaluationCase = {
  id: string;
  suiteId: string;
  title: string;
  kind: EvaluationCaseKind;
  input: {
    query: string;
    intent: "execution" | "strategy" | "evidence" | "knowledge";
  };
  expectedEvidenceTerms: string[];
  expectedBehaviors: string[];
  forbiddenBehaviors: string[];
  rubricWeights: Partial<Record<EvaluationRubricKey, number>>;
  gate: {
    minimumScore: number;
    highRisk: boolean;
    onFail: "ADVISORY" | "REVIEW_REQUIRED" | "BLOCK";
  };
};

type FixtureRecord = {
  id: string;
  entityType: "SOURCE" | "TOPIC" | "FLASHCARD" | "GOALCARD" | "TASK" | "PIPELINE_JOB" | "WORKFLOW_BLUEPRINT";
  title: string;
  body: string;
  href: string;
  score: number;
  tenantMarker: "synthetic";
};

export type EvaluationVariant = {
  label?: string;
  evidenceStrictness?: "baseline" | "strict";
  confidencePolicy?: "baseline" | "risk_averse";
  actionabilityBoost?: number;
};

export type EvaluationCaseResult = {
  caseId: string;
  title: string;
  kind: EvaluationCaseKind;
  score: number;
  passed: boolean;
  gateOutcome: "PASS" | "ADVISORY" | "REVIEW_REQUIRED" | "BLOCK";
  reasons: string[];
  rubricScores: Record<EvaluationRubricKey, number>;
  output: {
    confidence: "LOW" | "MEDIUM" | "HIGH";
    summary: string;
    evidenceIds: string[];
    nextActions: string[];
  };
};

export type EvaluationRun = {
  runId: string;
  suiteId: string;
  label: string;
  generatedAt: string;
  aggregateScore: number;
  passRate: number;
  passed: boolean;
  gateOutcome: "PASS" | "ADVISORY" | "REVIEW_REQUIRED" | "BLOCK";
  cases: EvaluationCaseResult[];
  failedCases: EvaluationCaseResult[];
  trends: {
    totalCases: number;
    passedCases: number;
    highRiskFailures: number;
    advisoryFailures: number;
  };
};

export type EvaluationComparison = {
  baseline: EvaluationRun;
  candidate: EvaluationRun;
  delta: number;
  regressedCases: Array<{
    caseId: string;
    title: string;
    baselineScore: number;
    candidateScore: number;
  }>;
  improvedCases: Array<{
    caseId: string;
    title: string;
    baselineScore: number;
    candidateScore: number;
  }>;
  promotionGate: {
    status: "PASS" | "ADVISORY" | "REVIEW_REQUIRED" | "BLOCK";
    reason: string;
  };
};

const DEFAULT_RUBRIC_WEIGHTS: Record<EvaluationRubricKey, number> = {
  evidenceUse: 0.22,
  citationCorrectness: 0.18,
  actionability: 0.18,
  duplication: 0.08,
  unsafeConfidence: 0.14,
  tenantIsolation: 0.1,
  downstreamQuality: 0.1,
};

export const EVALUATION_SUITES = [
  {
    id: "intelligence-quality-v1",
    name: "Intelligence Quality Gate v1",
    description: "Synthetic fixture replay for grounded answers, recommendation quality, search, KPI, workflow, competitor, and data-readiness behavior.",
    advisoryThreshold: 0.78,
    enforceableThreshold: 0.86,
  },
];

const FIXTURE_RECORDS: FixtureRecord[] = [
  {
    id: "src-retention-drop",
    entityType: "SOURCE",
    title: "Synthetic Q2 retention source",
    body: "Synthetic evidence says enterprise retention fell after onboarding delays and missing implementation checklists.",
    href: "/fixture/data",
    score: 30,
    tenantMarker: "synthetic",
  },
  {
    id: "topic-onboarding",
    entityType: "TOPIC",
    title: "Onboarding reliability",
    body: "The company tracks onboarding speed, checklist completion, and support handoffs as key retention drivers.",
    href: "/fixture/topics",
    score: 25,
    tenantMarker: "synthetic",
  },
  {
    id: "task-onboarding-playbook",
    entityType: "TASK",
    title: "Repair onboarding checklist",
    body: "Create a checklist that assigns owner, deadline, and evidence review for every enterprise onboarding blocker.",
    href: "/fixture/tactical",
    score: 28,
    tenantMarker: "synthetic",
  },
  {
    id: "workflow-research-knowledge",
    entityType: "WORKFLOW_BLUEPRINT",
    title: "Research To Knowmore",
    body: "Ingest evidence, search related context, generate grounded knowledge, and route conflicts to review.",
    href: "/fixture/workflows",
    score: 22,
    tenantMarker: "synthetic",
  },
  {
    id: "source-competitor-price",
    entityType: "SOURCE",
    title: "Synthetic competitor pricing change",
    body: "A competitor launched annual onboarding bundles and mentions faster enterprise activation on its pricing page.",
    href: "/fixture/data",
    score: 27,
    tenantMarker: "synthetic",
  },
  {
    id: "source-data-warning",
    entityType: "SOURCE",
    title: "Synthetic stale CRM export",
    body: "The latest CRM export is 46 days old and lacks lifecycle-stage fields needed for reliable pipeline recommendations.",
    href: "/fixture/data",
    score: 26,
    tenantMarker: "synthetic",
  },
  {
    id: "goal-expansion",
    entityType: "GOALCARD",
    title: "Increase enterprise expansion",
    body: "Expansion depends on stronger onboarding evidence, customer-health signals, and clear action ownership.",
    href: "/fixture/goals",
    score: 24,
    tenantMarker: "synthetic",
  },
];

export const SEEDED_EVALUATION_CASES: EvaluationCase[] = [
  {
    id: "ga-retention-evidence",
    suiteId: "intelligence-quality-v1",
    title: "Grounded answer cites retention evidence",
    kind: "GROUNDED_ANSWER",
    input: { query: "Why did enterprise retention fall and what should we do?", intent: "evidence" },
    expectedEvidenceTerms: ["retention", "onboarding", "implementation checklists"],
    expectedBehaviors: ["cite evidence", "name a next action", "avoid unsupported certainty"],
    forbiddenBehaviors: ["guarantee", "other tenant", "legal certification"],
    rubricWeights: { evidenceUse: 0.28, citationCorrectness: 0.22, actionability: 0.2, unsafeConfidence: 0.18, tenantIsolation: 0.12 },
    gate: { minimumScore: 0.84, highRisk: true, onFail: "REVIEW_REQUIRED" },
  },
  {
    id: "search-ranks-actionable-task",
    suiteId: "intelligence-quality-v1",
    title: "Search ranks actionable onboarding work",
    kind: "SEARCH_RANKING",
    input: { query: "onboarding checklist blocker", intent: "execution" },
    expectedEvidenceTerms: ["Repair onboarding checklist", "owner", "deadline"],
    expectedBehaviors: ["rank task evidence", "preserve source trace"],
    forbiddenBehaviors: ["duplicate recommendation", "unrelated campaign"],
    rubricWeights: { evidenceUse: 0.24, citationCorrectness: 0.18, actionability: 0.22, duplication: 0.16, downstreamQuality: 0.2 },
    gate: { minimumScore: 0.8, highRisk: false, onFail: "ADVISORY" },
  },
  {
    id: "kpi-pulse-explains-driver",
    suiteId: "intelligence-quality-v1",
    title: "KPI pulse explains the driver before prescribing",
    kind: "KPI_PULSE",
    input: { query: "retention KPI pulse onboarding driver", intent: "strategy" },
    expectedEvidenceTerms: ["retention", "onboarding", "drivers"],
    expectedBehaviors: ["explain driver", "separate signal from action"],
    forbiddenBehaviors: ["metric changed because AI says so"],
    rubricWeights: { evidenceUse: 0.2, actionability: 0.18, unsafeConfidence: 0.22, downstreamQuality: 0.22, citationCorrectness: 0.18 },
    gate: { minimumScore: 0.78, highRisk: false, onFail: "ADVISORY" },
  },
  {
    id: "workflow-blueprint-safe-replay",
    suiteId: "intelligence-quality-v1",
    title: "Workflow replay stays bounded and reviewable",
    kind: "WORKFLOW_BLUEPRINT",
    input: { query: "research to knowledge workflow conflict review", intent: "execution" },
    expectedEvidenceTerms: ["Research To Knowmore", "conflicts", "review"],
    expectedBehaviors: ["describe steps", "no production mutation", "route conflicts"],
    forbiddenBehaviors: ["execute live write", "skip review"],
    rubricWeights: { downstreamQuality: 0.26, actionability: 0.2, evidenceUse: 0.2, unsafeConfidence: 0.18, tenantIsolation: 0.16 },
    gate: { minimumScore: 0.86, highRisk: true, onFail: "BLOCK" },
  },
  {
    id: "competitive-change-brief",
    suiteId: "intelligence-quality-v1",
    title: "Competitive change brief links change to response",
    kind: "COMPETITIVE_BRIEF",
    input: { query: "competitor pricing onboarding bundle response", intent: "strategy" },
    expectedEvidenceTerms: ["competitor", "pricing", "onboarding bundles"],
    expectedBehaviors: ["explain what changed", "recommend response", "cite source"],
    forbiddenBehaviors: ["copy competitor", "unsupported market claim"],
    rubricWeights: { evidenceUse: 0.24, citationCorrectness: 0.18, actionability: 0.24, unsafeConfidence: 0.16, downstreamQuality: 0.18 },
    gate: { minimumScore: 0.8, highRisk: false, onFail: "ADVISORY" },
  },
  {
    id: "data-readiness-warning",
    suiteId: "intelligence-quality-v1",
    title: "Data readiness warns before recommending",
    kind: "DATA_READINESS",
    input: { query: "CRM export stale lifecycle stage warning", intent: "evidence" },
    expectedEvidenceTerms: ["CRM export", "46 days old", "lifecycle-stage"],
    expectedBehaviors: ["lower confidence", "request fresh source", "mark data readiness"],
    forbiddenBehaviors: ["high confidence", "ignore stale"],
    rubricWeights: { evidenceUse: 0.22, unsafeConfidence: 0.26, citationCorrectness: 0.16, actionability: 0.18, downstreamQuality: 0.18 },
    gate: { minimumScore: 0.86, highRisk: true, onFail: "REVIEW_REQUIRED" },
  },
  {
    id: "recommendation-owned-action",
    suiteId: "intelligence-quality-v1",
    title: "Recommendation has evidence, owner, and next step",
    kind: "RECOMMENDATION",
    input: { query: "recommend next enterprise expansion action", intent: "strategy" },
    expectedEvidenceTerms: ["enterprise expansion", "onboarding evidence", "action ownership"],
    expectedBehaviors: ["recommend one action", "explain evidence", "include owner"],
    forbiddenBehaviors: ["many vague actions", "guarantee outcome"],
    rubricWeights: { evidenceUse: 0.22, actionability: 0.26, duplication: 0.12, unsafeConfidence: 0.14, downstreamQuality: 0.26 },
    gate: { minimumScore: 0.82, highRisk: true, onFail: "REVIEW_REQUIRED" },
  },
];

function tokenize(value: string) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 2);
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function scoreTextCoverage(text: string, terms: string[]) {
  if (terms.length === 0) return 1;
  const normalized = text.toLowerCase();
  const hits = terms.filter((term) => normalized.includes(term.toLowerCase())).length;
  return hits / terms.length;
}

function searchFixtureRecords(query: string, intent: EvaluationCase["input"]["intent"]) {
  const queryTokens = tokenize(query);
  const intentBoost = (record: FixtureRecord) => {
    if (intent === "execution" && ["TASK", "PIPELINE_JOB", "WORKFLOW_BLUEPRINT"].includes(record.entityType)) return 8;
    if (intent === "strategy" && ["GOALCARD", "TOPIC", "TASK"].includes(record.entityType)) return 7;
    if (intent === "evidence" && ["SOURCE", "FLASHCARD", "TOPIC"].includes(record.entityType)) return 7;
    return 0;
  };

  return FIXTURE_RECORDS.map((record) => {
    const haystack = tokenize(`${record.title} ${record.body}`);
    const overlap = queryTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 4 : 0), 0);
    return { ...record, replayScore: record.score + overlap + intentBoost(record) };
  })
    .filter((record) => record.replayScore > 0)
    .sort((left, right) => right.replayScore - left.replayScore)
    .slice(0, 5);
}

function replayCase(testCase: EvaluationCase, variant: EvaluationVariant) {
  const records = searchFixtureRecords(testCase.input.query, testCase.input.intent);
  const evidence = variant.evidenceStrictness === "strict"
    ? records.filter((record) => scoreTextCoverage(`${record.title} ${record.body}`, testCase.expectedEvidenceTerms) > 0)
    : records;
  const selectedEvidence = (evidence.length > 0 ? evidence : records).slice(0, 4);
  const summary = selectedEvidence
    .slice(0, 3)
    .map((record) => `${record.title}: ${record.body}`)
    .join(" ");
  const nextActions = [
    testCase.kind === "WORKFLOW_BLUEPRINT"
      ? "Replay the workflow against synthetic fixture data before activating the live blueprint."
      : "Review the cited synthetic evidence before promoting the recommendation.",
    testCase.gate.highRisk
      ? "Require human review if the case misses its gate threshold."
      : "Treat failures as advisory until the rubric stabilizes.",
  ];
  const evidenceCoverage = scoreTextCoverage(summary, testCase.expectedEvidenceTerms);
  const behaviorCoverage = scoreTextCoverage(`${summary} ${nextActions.join(" ")}`, testCase.expectedBehaviors);
  const forbiddenHits = testCase.forbiddenBehaviors.filter((term) => scoreTextCoverage(summary, [term]) > 0).length;
  const unsafeConfidencePenalty =
    variant.confidencePolicy === "risk_averse" && testCase.forbiddenBehaviors.includes("high confidence")
      ? 0
      : evidenceCoverage < 0.5
        ? 0.35
        : 0;

  const confidence: EvaluationCaseResult["output"]["confidence"] = evidenceCoverage >= 0.78 && unsafeConfidencePenalty === 0
    ? "HIGH"
    : evidenceCoverage >= 0.45
      ? "MEDIUM"
      : "LOW";

  return {
    summary,
    selectedEvidence,
    nextActions,
    coverage: {
      evidenceCoverage,
      behaviorCoverage,
      forbiddenPenalty: forbiddenHits > 0 ? 0.35 : 0,
      unsafeConfidencePenalty,
    },
    confidence,
  };
}

function normalizedWeights(testCase: EvaluationCase) {
  const weights = { ...DEFAULT_RUBRIC_WEIGHTS, ...testCase.rubricWeights };
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  ) as Record<EvaluationRubricKey, number>;
}

function evaluateCase(testCase: EvaluationCase, variant: EvaluationVariant): EvaluationCaseResult {
  const replay = replayCase(testCase, variant);
  const weights = normalizedWeights(testCase);
  const actionabilityBoost = clampUnit(Number(variant.actionabilityBoost ?? 0) / 100);
  const rubricScores: Record<EvaluationRubricKey, number> = {
    evidenceUse: clampUnit(replay.coverage.evidenceCoverage),
    citationCorrectness: clampUnit(replay.selectedEvidence.length / Math.min(3, testCase.expectedEvidenceTerms.length || 3)),
    actionability: clampUnit(0.55 + replay.coverage.behaviorCoverage * 0.35 + actionabilityBoost),
    duplication: 0.9,
    unsafeConfidence: clampUnit(1 - replay.coverage.unsafeConfidencePenalty),
    tenantIsolation: replay.selectedEvidence.every((record) => record.tenantMarker === "synthetic") ? 1 : 0,
    downstreamQuality: clampUnit(0.5 + replay.coverage.behaviorCoverage * 0.35 + replay.coverage.evidenceCoverage * 0.15),
  };
  const weightedScore = Object.entries(rubricScores).reduce(
    (sum, [key, value]) => sum + value * weights[key as EvaluationRubricKey],
    0,
  );
  const score = clampUnit(weightedScore - replay.coverage.forbiddenPenalty);
  const passed = score >= testCase.gate.minimumScore;
  const gateOutcome = passed ? "PASS" : testCase.gate.onFail;

  const reasons = [
    `Evidence coverage ${Math.round(rubricScores.evidenceUse * 100)}%`,
    `Actionability ${Math.round(rubricScores.actionability * 100)}%`,
    `Gate ${Math.round(testCase.gate.minimumScore * 100)}% ${passed ? "passed" : "missed"}`,
  ];
  if (gateOutcome !== "PASS") reasons.push(`${gateOutcome} because this case protects ${testCase.kind.toLowerCase().replace(/_/g, " ")} quality`);
  if (testCase.gate.highRisk) reasons.push("High-risk intelligence change");

  return {
    caseId: testCase.id,
    title: testCase.title,
    kind: testCase.kind,
    score: Number(score.toFixed(3)),
    passed,
    gateOutcome,
    reasons,
    rubricScores,
    output: {
      confidence: replay.confidence,
      summary: replay.summary,
      evidenceIds: replay.selectedEvidence.map((record) => record.id),
      nextActions: replay.nextActions,
    },
  };
}

function strongestGateOutcome(results: EvaluationCaseResult[]) {
  if (results.some((result) => result.gateOutcome === "BLOCK")) return "BLOCK";
  if (results.some((result) => result.gateOutcome === "REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  if (results.some((result) => result.gateOutcome === "ADVISORY")) return "ADVISORY";
  return "PASS";
}

export function runEvaluationSuite(variant: EvaluationVariant = {}): EvaluationRun {
  const suiteId = "intelligence-quality-v1";
  const label = variant.label || "baseline";
  const cases = SEEDED_EVALUATION_CASES.map((testCase) => evaluateCase(testCase, variant));
  const failedCases = cases.filter((result) => !result.passed);
  const aggregateScore = cases.reduce((sum, result) => sum + result.score, 0) / cases.length;
  const passRate = cases.filter((result) => result.passed).length / cases.length;
  const gateOutcome = strongestGateOutcome(cases);

  return {
    runId: `${suiteId}:${label}:${new Date().toISOString()}`,
    suiteId,
    label,
    generatedAt: new Date().toISOString(),
    aggregateScore: Number(aggregateScore.toFixed(3)),
    passRate: Number(passRate.toFixed(3)),
    passed: gateOutcome === "PASS",
    gateOutcome,
    cases,
    failedCases,
    trends: {
      totalCases: cases.length,
      passedCases: cases.length - failedCases.length,
      highRiskFailures: failedCases.filter((result) => SEEDED_EVALUATION_CASES.find((testCase) => testCase.id === result.caseId)?.gate.highRisk).length,
      advisoryFailures: failedCases.filter((result) => result.gateOutcome === "ADVISORY").length,
    },
  };
}

export function compareEvaluationVariants(candidate: EvaluationVariant = {}): EvaluationComparison {
  const baseline = runEvaluationSuite({ label: "current-baseline", evidenceStrictness: "baseline", confidencePolicy: "baseline" });
  const candidateRun = runEvaluationSuite({
    label: candidate.label || "candidate-strict-gate",
    evidenceStrictness: candidate.evidenceStrictness || "strict",
    confidencePolicy: candidate.confidencePolicy || "risk_averse",
    actionabilityBoost: candidate.actionabilityBoost ?? 8,
  });
  const regressedCases = candidateRun.cases
    .map((result) => {
      const baselineCase = baseline.cases.find((item) => item.caseId === result.caseId);
      return {
        caseId: result.caseId,
        title: result.title,
        baselineScore: baselineCase?.score ?? 0,
        candidateScore: result.score,
      };
    })
    .filter((item) => item.candidateScore + 0.02 < item.baselineScore);
  const improvedCases = candidateRun.cases
    .map((result) => {
      const baselineCase = baseline.cases.find((item) => item.caseId === result.caseId);
      return {
        caseId: result.caseId,
        title: result.title,
        baselineScore: baselineCase?.score ?? 0,
        candidateScore: result.score,
      };
    })
    .filter((item) => item.candidateScore > item.baselineScore + 0.02);
  const status = candidateRun.gateOutcome;

  return {
    baseline,
    candidate: candidateRun,
    delta: Number((candidateRun.aggregateScore - baseline.aggregateScore).toFixed(3)),
    regressedCases,
    improvedCases,
    promotionGate: {
      status,
      reason: status === "PASS"
        ? "Candidate passes all seeded advisory and high-risk gates."
        : "Candidate needs review before promotion because one or more seeded intelligence quality gates failed.",
    },
  };
}
