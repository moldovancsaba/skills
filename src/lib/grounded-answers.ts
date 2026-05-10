import { searchCompanyContext, type SearchResultRecord } from "@/lib/internal-search";

export type GroundedAnswer = {
  question: string;
  summary: string;
  evidence: Array<{
    id: string;
    entityType: SearchResultRecord["entityType"];
    title: string;
    snippet: string;
    href: string;
  }>;
  nextActions: string[];
};

function inferIntent(question: string) {
  const normalized = question.toLowerCase();
  if (/\b(task|checklist|execute|deliver|plan)\b/.test(normalized)) return "execution";
  if (/\b(goal|strategy|priority|roadmap)\b/.test(normalized)) return "strategy";
  if (/\b(data|source|evidence|research)\b/.test(normalized)) return "evidence";
  return "knowledge";
}

function filterByIntent(results: SearchResultRecord[], intent: string) {
  if (intent === "execution") {
    return results.filter((item) => item.entityType === "TASK" || item.entityType === "PIPELINE_JOB");
  }
  if (intent === "strategy") {
    return results.filter((item) => item.entityType === "GOALCARD" || item.entityType === "TOPIC" || item.entityType === "TASK");
  }
  if (intent === "evidence") {
    return results.filter((item) => item.entityType === "SOURCE" || item.entityType === "FLASHCARD" || item.entityType === "TOPIC");
  }
  return results.filter((item) => item.entityType === "FLASHCARD" || item.entityType === "SOURCE" || item.entityType === "TOPIC");
}

export async function buildGroundedAnswer(companyId: string, question: string) {
  const results = await searchCompanyContext(companyId, question, 12);
  const intent = inferIntent(question);
  const preferred = filterByIntent(results, intent);
  const evidence = (preferred.length > 0 ? preferred : results).slice(0, 5);

  if (evidence.length === 0) {
    return {
      question,
      summary: "No grounded answer is available yet because the current company context does not contain enough matching evidence.",
      evidence: [],
      nextActions: [
        "Ingest more relevant source evidence into Data.",
        "Add or refine Topics so future retrieval has stronger context anchors.",
      ],
    } satisfies GroundedAnswer;
  }

  const summary = evidence
    .slice(0, 3)
    .map((item) => `${item.title}: ${item.snippet}`)
    .join(" ");

  const nextActions = [];
  if (intent === "execution") {
    nextActions.push("Review the top matching task or planning card and decide whether it should move earlier in time.");
  } else if (intent === "strategy") {
    nextActions.push("Compare the matching topic and goal cards to confirm whether the current strategic direction is still aligned.");
  } else if (intent === "evidence") {
    nextActions.push("Open the strongest matching data or knowledge cards and verify the evidence trail before acting.");
  } else {
    nextActions.push("Open the strongest matching knowledge card and trace it into planning or checklist if action is needed.");
  }
  nextActions.push("Use the cited cards below as the canonical evidence base for any follow-up decision.");

  return {
    question,
    summary,
    evidence: evidence.map((item) => ({
      id: item.id,
      entityType: item.entityType,
      title: item.title,
      snippet: item.snippet,
      href: item.href,
    })),
    nextActions,
  } satisfies GroundedAnswer;
}
