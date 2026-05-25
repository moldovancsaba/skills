type ExportScope = "planning" | "checklist";

type TaskcardCsvRow = {
  publicId: number | null;
  title: string;
  description: string | null;
  kanbanColumn: string;
  processingStatus: string;
  activityState: string;
  candidateState: string;
  status: string;
  impact: number;
  confidence: number;
  confidenceScore: number;
  ease: number;
  iceScore: number;
  qualityScore: number | null;
  urgencyScore: number | null;
  freshnessScore: number | null;
  scheduledDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  generatedAt: Date | null;
  hashtags: string[];
  userAnnotation: string | null;
  evaluationReason: string | null;
  departmentKey: string | null;
};

const CSV_HEADERS = [
  "Public ID",
  "Title",
  "Description",
  "Planning Lane",
  "Processing Status",
  "Activity State",
  "Candidate State",
  "Legacy Status",
  "Impact",
  "Confidence",
  "Confidence Score",
  "Ease",
  "ICE Score",
  "Quality Score",
  "Urgency Score",
  "Freshness Score",
  "Scheduled Date",
  "Created At",
  "Updated At",
  "Generated At",
  "Department",
  "Hashtags",
  "User Annotation",
  "Evaluation Reason",
] as const;

function formatDate(value: Date | null) {
  return value ? value.toISOString() : "";
}

function formatNumber(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

export function buildTaskcardCsv(rows: TaskcardCsvRow[]) {
  const lines = [
    CSV_HEADERS.join(","),
    ...rows.map((row) =>
      [
        formatNumber(row.publicId),
        row.title ?? "",
        row.description ?? "",
        row.kanbanColumn,
        row.processingStatus,
        row.activityState,
        row.candidateState,
        row.status,
        formatNumber(row.impact),
        formatNumber(row.confidence),
        formatNumber(row.confidenceScore),
        formatNumber(row.ease),
        formatNumber(row.iceScore),
        formatNumber(row.qualityScore),
        formatNumber(row.urgencyScore),
        formatNumber(row.freshnessScore),
        formatDate(row.scheduledDate),
        formatDate(row.createdAt),
        formatDate(row.updatedAt),
        formatDate(row.generatedAt),
        row.departmentKey ?? "",
        row.hashtags.map((tag) => `#${tag}`).join(" "),
        row.userAnnotation ?? "",
        row.evaluationReason ?? "",
      ]
        .map((value) => escapeCsv(String(value)))
        .join(","),
    ),
  ];

  // UTF-8 BOM keeps Excel-compatible import behavior for operator downloads.
  return `\uFEFF${lines.join("\r\n")}`;
}

export function buildTaskcardCsvFilename({
  companyName,
  scope,
  archived,
  now = new Date(),
}: {
  companyName: string;
  scope: ExportScope;
  archived: boolean;
  now?: Date;
}) {
  const safeCompany = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";
  const scopeLabel = scope === "planning" ? "planning-taskcards" : "checklist-taskcards";
  const archiveLabel = archived ? "-archived" : "";
  const dateLabel = now.toISOString().slice(0, 10);
  return `${safeCompany}-${scopeLabel}${archiveLabel}-${dateLabel}.csv`;
}

