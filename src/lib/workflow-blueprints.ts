import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type WorkflowTemplateDefinition = {
  templateKey: string;
  name: string;
  description: string;
  triggerType: string;
  queueColumn: "NOW" | "SOON" | "LATER" | "PARKED";
  controlMode: "AI_ONLY" | "HUMAN_GUIDED";
  steps: Array<{
    key: string;
    label: string;
    kind: "SEARCH" | "ANSWER" | "QUEUE" | "RESCORE" | "REVIEW" | "ENRICH";
    config?: Record<string, unknown>;
  }>;
};

export const WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    templateKey: "score-health-repair",
    name: "Score Health Repair Loop",
    description: "Observe suspicious or critical score health and route repair work into the shared worker queue.",
    triggerType: "SCORE_ALERT",
    queueColumn: "NOW",
    controlMode: "AI_ONLY",
    steps: [
      { key: "inspect-score-health", label: "Inspect score health", kind: "SEARCH" },
      { key: "queue-repair", label: "Queue score repair work", kind: "QUEUE" },
      { key: "rescore-cards", label: "Rescore affected cards", kind: "RESCORE" },
      { key: "review-outcomes", label: "Review the repaired outputs", kind: "REVIEW" },
    ],
  },
  {
    templateKey: "research-to-knowledge",
    name: "Research To Knowmore",
    description: "Turn new data evidence into grounded knowledge, with answerability and citation durability built in.",
    triggerType: "NEW_EVIDENCE",
    queueColumn: "SOON",
    controlMode: "AI_ONLY",
    steps: [
      { key: "ingest-evidence", label: "Ingest source evidence", kind: "ENRICH" },
      { key: "search-related-context", label: "Search related company context", kind: "SEARCH" },
      { key: "generate-knowledge", label: "Generate grounded knowledge", kind: "ANSWER" },
      { key: "review-conflicts", label: "Review conflicts if they appear", kind: "REVIEW" },
    ],
  },
  {
    templateKey: "feedback-to-rework",
    name: "Feedback To Rework",
    description: "Turn strong human feedback into queue-backed rework and rescoring.",
    triggerType: "NEW_FEEDBACK",
    queueColumn: "NOW",
    controlMode: "HUMAN_GUIDED",
    steps: [
      { key: "detect-feedback", label: "Collect recent feedback", kind: "SEARCH" },
      { key: "queue-rework", label: "Queue rework jobs", kind: "QUEUE" },
      { key: "rescore-downstream", label: "Rescore downstream cards", kind: "RESCORE" },
      { key: "verify-result", label: "Review the updated result", kind: "REVIEW" },
    ],
  },
];

export async function ensureWorkflowBlueprintTemplates(companyId: string) {
  const existing = await prisma.workflowBlueprint.findMany({
    where: { companyId },
    select: { templateKey: true },
  });
  const existingKeys = new Set(existing.map((item) => item.templateKey).filter(Boolean));

  const missing = WORKFLOW_TEMPLATES.filter((template) => !existingKeys.has(template.templateKey));
  if (missing.length === 0) return;

  await prisma.workflowBlueprint.createMany({
    data: missing.map((template) => ({
      companyId,
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      queueColumn: template.queueColumn,
      controlMode: template.controlMode,
      templateKey: template.templateKey,
      steps: template.steps as Prisma.InputJsonValue,
      entityType: "COMPANY",
    })),
  });
}

export async function listCompanyWorkflowBlueprints(companyId: string) {
  await ensureWorkflowBlueprintTemplates(companyId);
  return prisma.workflowBlueprint.findMany({
    where: { companyId, status: { in: ["ACTIVE", "PAUSED"] } },
    orderBy: [{ updatedAt: "desc" }],
  });
}
