import type { ModuleTone } from "@/lib/semantic-theme";

export type OpportunityKanbanColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

export const OPPORTUNITY_BOARD_COLUMNS: Record<
  OpportunityKanbanColumn,
  {
    key: OpportunityKanbanColumn;
    label: string;
    description: string;
    tone: ModuleTone;
  }
> = {
  IDEABANK: {
    key: "IDEABANK",
    label: "Idea Bank",
    description: "Someday lead pool",
    tone: "neutral",
  },
  ROADMAP: {
    key: "ROADMAP",
    label: "Roadmap",
    description: "Later qualification",
    tone: "strategy",
  },
  BACKLOG: {
    key: "BACKLOG",
    label: "Backlog",
    description: "Sooner research",
    tone: "ingress",
  },
  TODO: {
    key: "TODO",
    label: "Next",
    description: "Soon review",
    tone: "tactical",
  },
  CHECKLIST: {
    key: "CHECKLIST",
    label: "Now",
    description: "Active sales focus",
    tone: "checklist",
  },
};

export const OPPORTUNITY_BOARD_COLUMN_ORDER: OpportunityKanbanColumn[] = [
  "IDEABANK",
  "ROADMAP",
  "BACKLOG",
  "TODO",
  "CHECKLIST",
];

export function getOpportunityLaneMeta(column: OpportunityKanbanColumn) {
  return OPPORTUNITY_BOARD_COLUMNS[column];
}

export function getOpportunityToneColor(tone: ModuleTone) {
  return tone === "neutral" ? "gray" : tone;
}
