import assert from "node:assert/strict";
import {
  evaluateCasesWithOutputs,
  summarizeRegressionGates,
} from "./lib/local-learning-gate.mjs";

const cases = [
  {
    entityId: "task-1",
    kind: "TASK",
    prompt: "Company: TestCo\nExisting task candidate: Launch onboarding checklist\nExisting description: Create an onboarding checklist\nOperator signal: add ownership and deadlines",
    expected: {
      title: "Launch onboarding checklist",
      description: "Create an onboarding checklist with ownership and deadlines.",
      rationale: "Operator validated this as the best next task.",
    },
  },
  {
    entityId: "flashcard-1",
    kind: "FLASHCARD",
    prompt: "Company: TestCo\nKnowledge kind: SUMMARY\nSource summary:\n- SOURCE: onboarding audit",
    expected: {
      title: "Onboarding audit shows missed ownership",
      body: "The audit found onboarding tasks without clear ownership or deadlines.",
      rationale: "Validated flashcard.",
    },
  },
  {
    entityId: "answer-1",
    kind: "GROUNDED_ANSWER",
    prompt: "Company: TestCo\nQuestion: What matters about onboarding reliability?\nExisting summary: Onboarding reliability depends on ownership and deadline discipline.\n- onboarding audit: ownership gaps\n- customer notes: delayed launches",
    expected: {
      summary: "Onboarding reliability depends on ownership and deadline discipline.",
      confidence: "MEDIUM",
      nextActions: ["Review ownership gaps and add deadline checkpoints."],
      evidenceTerms: ["onboarding", "ownership", "deadline", "audit"],
    },
  },
  {
    entityId: "ranking-1",
    kind: "SEARCH_RANKING",
    prompt: "Rank these task candidates from strongest to weakest for immediate operator attention.",
    expected: {
      rankedTitles: [
        "Launch onboarding checklist",
        "Write generic marketing copy",
        "Refresh homepage footer",
      ],
      rationaleTerms: ["onboarding", "ownership", "deadline"],
    },
  },
];

const baselineOutputs = [
  {
    title: "Launch onboarding checklist",
    description: "Create an onboarding checklist with ownership and deadlines.",
    rationale: "Use ownership and deadlines to reduce missed launches.",
  },
  {
    title: "Onboarding audit shows missed ownership",
    body: "The audit found onboarding tasks without clear ownership or deadlines.",
    rationale: "Validated flashcard.",
  },
  {
    summary: "Onboarding reliability depends on ownership and deadline discipline backed by the audit.",
    confidence: "MEDIUM",
    nextActions: ["Review ownership gaps and add deadline checkpoints."],
  },
  {
    rankedTitles: [
      "Launch onboarding checklist",
      "Write generic marketing copy",
      "Refresh homepage footer",
    ],
    rationale: "The onboarding checklist is strongest because ownership and deadline gaps are the core issue.",
  },
];

const candidateOutputs = [
  {
    title: "Launch onboarding checklist",
    description: "Create an onboarding checklist with ownership, deadlines, and escalation rules.",
    rationale: "Use ownership and deadlines to reduce missed launches.",
  },
  {
    title: "Onboarding audit shows missed ownership",
    body: "The audit found onboarding tasks without clear ownership, deadlines, and accountability.",
    rationale: "Validated flashcard.",
  },
  {
    summary: "Onboarding reliability depends on ownership, deadline discipline, and audit-backed accountability.",
    confidence: "MEDIUM",
    nextActions: ["Review ownership gaps and add deadline checkpoints."],
  },
  {
    rankedTitles: [
      "Launch onboarding checklist",
      "Write generic marketing copy",
      "Refresh homepage footer",
    ],
    rationale: "The onboarding checklist best addresses the ownership and deadline evidence.",
  },
];

const badCandidateOutputs = [
  {
    title: "Generic improvement idea",
    description: "Do something helpful.",
    rationale: "",
  },
  {
    title: "Generic improvement idea",
    body: "Do something helpful.",
    rationale: "",
  },
  {
    summary: "Everything looks good.",
    confidence: "HIGH",
    nextActions: ["Keep going."],
  },
  {
    rankedTitles: [
      "Refresh homepage footer",
      "Write generic marketing copy",
      "Launch onboarding checklist",
    ],
    rationale: "No strong reason.",
  },
];

const baseline = evaluateCasesWithOutputs({
  model: "baseline-fixture",
  runtime: "fixture",
  cases,
  outputs: baselineOutputs,
});
const candidate = evaluateCasesWithOutputs({
  model: "candidate-fixture",
  runtime: "fixture",
  cases,
  outputs: candidateOutputs,
});
const badCandidate = evaluateCasesWithOutputs({
  model: "bad-candidate-fixture",
  runtime: "fixture",
  cases,
  outputs: badCandidateOutputs,
});

const passingGate = summarizeRegressionGates(baseline, candidate);
assert.equal(passingGate.status, "PASS", "candidate fixture should pass the regression gate");
assert.equal(passingGate.blockedPromotion, false, "passing gate must not block promotion");

const failingGate = summarizeRegressionGates(baseline, badCandidate);
assert.equal(failingGate.status, "REVIEW_REQUIRED", "bad candidate should trigger review");
assert.equal(failingGate.blockedPromotion, true, "failing gate must block promotion");
assert.ok(
  failingGate.checks.some((check) => check.label === "duplicate-suppression" && check.passed === false),
  "bad candidate should fail duplicate suppression",
);

console.log("local learning gate tests passed");
