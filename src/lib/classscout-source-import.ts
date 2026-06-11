import type { VisitorSourceDatacard, VisitorSourceKind, VisitorTrustTier } from "@/lib/visitor-source-graph";

export type ClassScoutManhattanSourceLead = {
  url: string;
  title?: string;
  category?: string;
  neighborhood?: string;
  sourceKind?: VisitorSourceKind;
  trustTier?: VisitorTrustTier;
  extractionHints?: string[];
  tags?: string[];
  sourceUrls?: string[];
  blockedReasons?: string[];
  refreshCadenceDays?: number;
};

export type ClassScoutSourceImportDiagnostic = {
  code: string;
  severity: "warning" | "error";
  message: string;
  leadIndex: number;
  fieldPath: string;
};

export type NormalizedClassScoutSourceLead = {
  lead: ClassScoutManhattanSourceLead;
  datacard: Partial<VisitorSourceDatacard>;
  diagnostics: ClassScoutSourceImportDiagnostic[];
};

// Keep this category list aligned with the ClassScout Manhattan launch contract.
// The import lane is intentionally conservative: source leads seed research and review,
// never direct publication.
const CLASSSCOUT_LAUNCH_CATEGORIES = [
  "Classes",
  "Camps",
  "Birthday Parties",
  "Drop-In Activities",
  "Family Events",
  "Meetup Groups",
  "Arts",
  "STEM",
  "Music",
  "Sports",
  "Dance",
  "Theater",
  "Martial Arts",
  "Swimming",
  "Tutoring",
  "Language",
] as const;

const CATEGORY_TO_GOAL_SLUG: Record<string, string> = {
  arts: "arts",
  stem: "stem",
  music: "music",
  sports: "sports",
  classes: "classes",
  camps: "camps",
  "birthday parties": "birthday-parties",
  "drop-in activities": "drop-ins",
  "family events": "family-events",
  "meetup groups": "meetups",
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[], maxItems = 24) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, maxItems);
}

function normalizeUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function normalizeCategory(value?: string) {
  const normalized = asString(value).toLowerCase();
  return CLASSSCOUT_LAUNCH_CATEGORIES.find((category) => category.toLowerCase() === normalized) ?? "Classes";
}

function inferSourceKind(url: string, explicit?: VisitorSourceKind): VisitorSourceKind {
  if (explicit) return explicit;
  const normalized = url.toLowerCase();
  if (normalized.includes("instagram.com") || normalized.includes("facebook.com") || normalized.includes("tiktok.com")) return "social";
  if (normalized.includes("eventbrite.com") || normalized.includes("calendar") || normalized.includes("/events")) return "calendar";
  if (normalized.includes("nyc.gov") || normalized.endsWith(".gov")) return "government";
  if (normalized.includes("mommypoppins") || normalized.includes("yelp.") || normalized.includes("google.com/maps")) return "directory";
  return "official_site";
}

function inferTrustTier(url: string, sourceKind: VisitorSourceKind, explicit?: VisitorTrustTier, blockedReasons: string[] = []): VisitorTrustTier {
  if (explicit) return explicit;
  const normalized = url.toLowerCase();
  if (blockedReasons.length > 0 || /adult[-\s]?only|casino|nightclub|travel[-\s]?guide/.test(normalized)) return "blocked";
  if (sourceKind === "official_site" || sourceKind === "government") return "trusted";
  if (sourceKind === "directory" || sourceKind === "calendar" || sourceKind === "venue") return "usable";
  return "weak";
}

function goalIdForCategory(category: string) {
  const slug = CATEGORY_TO_GOAL_SLUG[category.toLowerCase()] ?? "classes";
  return `classscout-manhattan-${slug}`;
}

function refreshCadenceDays(sourceKind: VisitorSourceKind, trustTier: VisitorTrustTier, explicit?: number) {
  if (Number.isFinite(Number(explicit)) && Number(explicit) > 0) return Math.min(Number(explicit), 365);
  if (trustTier === "blocked") return 365;
  if (sourceKind === "calendar" || sourceKind === "social") return 7;
  if (sourceKind === "directory") return 30;
  return 14;
}

export function normalizeClassScoutManhattanSourceLead(
  lead: ClassScoutManhattanSourceLead,
  leadIndex = 0,
  importBatchId?: string,
): NormalizedClassScoutSourceLead {
  const diagnostics: ClassScoutSourceImportDiagnostic[] = [];
  const url = normalizeUrl(asString(lead.url));
  if (!url) {
    diagnostics.push({
      code: "missing_url",
      severity: "error",
      message: "Each Manhattan source lead requires a URL.",
      leadIndex,
      fieldPath: "url",
    });
  }

  const category = normalizeCategory(lead.category);
  if (lead.category && category.toLowerCase() !== lead.category.trim().toLowerCase()) {
    diagnostics.push({
      code: "unknown_category_defaulted",
      severity: "warning",
      message: `Unknown category "${lead.category}" defaulted to Classes.`,
      leadIndex,
      fieldPath: "category",
    });
  }

  const sourceKind = inferSourceKind(url, lead.sourceKind);
  const blockedReasons = unique(lead.blockedReasons ?? []);
  const trustTier = inferTrustTier(url, sourceKind, lead.trustTier, blockedReasons);
  if (trustTier === "blocked" && blockedReasons.length === 0) {
    diagnostics.push({
      code: "blocked_without_reason",
      severity: "error",
      message: "Blocked leads require blockedReasons.",
      leadIndex,
      fieldPath: "blockedReasons",
    });
  }

  const neighborhood = asString(lead.neighborhood);
  if (!neighborhood) {
    diagnostics.push({
      code: "missing_neighborhood",
      severity: "warning",
      message: "Neighborhood is recommended for Manhattan launch coverage planning.",
      leadIndex,
      fieldPath: "neighborhood",
    });
  }

  const extractionHints = unique([
    "Extract provider name, category, borough, neighborhood, ageRanges, programType, description, website/contact links, tags, source URLs, and geo when public.",
    "Keep source-only directory pages internal unless an official provider page is found.",
    "Manhattan launch coverage only.",
    category,
    neighborhood,
    ...(lead.extractionHints ?? []),
  ]);

  const datacard: Partial<VisitorSourceDatacard> = {
    datacardType: trustTier === "trusted" ? "trusted_source_datacard" : "source_datacard",
    url,
    canonicalUrl: url,
    sourceKind,
    trustTier,
    industryRelevance: trustTier === "trusted" ? 0.95 : trustTier === "usable" ? 0.78 : trustTier === "weak" ? 0.45 : 0,
    locationRelevance: neighborhood ? 0.95 : 0.7,
    extractionHints,
    knownContentTypes: unique([category]),
    coverageGoalIds: [goalIdForCategory(category)],
    geography: "Manhattan",
    neighborhoods: neighborhood ? [neighborhood] : [],
    tags: unique(["classscout-manhattan-launch", category, neighborhood, ...(lead.tags ?? [])]),
    importBatchId,
    sourceTitle: asString(lead.title) || undefined,
    entityKind: category === "Meetup Groups" ? "meetupGroup" : "provider",
    autoPublishEligible: false,
    blockedReasons,
    refreshCadenceDays: refreshCadenceDays(sourceKind, trustTier, lead.refreshCadenceDays),
    extractedFacts: {
      category,
      borough: "Manhattan",
      neighborhood: neighborhood || undefined,
      sourceUrls: unique([url, ...(lead.sourceUrls ?? [])], 12),
    },
    publicDraftPayload: {
      catalogProject: "classscout",
      category,
      borough: "Manhattan",
      neighborhood: neighborhood || undefined,
      sourceUrl: url,
    },
  };

  return { lead, datacard, diagnostics };
}

export function normalizeClassScoutManhattanSourceLeads(
  leads: ClassScoutManhattanSourceLead[],
  importBatchId = `classscout-manhattan-${new Date().toISOString().slice(0, 10)}`,
) {
  const normalized = leads.map((lead, index) => normalizeClassScoutManhattanSourceLead(lead, index, importBatchId));
  const diagnostics = normalized.flatMap((entry) => entry.diagnostics);
  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    importBatchId,
    totalLeads: leads.length,
    normalized,
    diagnostics,
    errorCount: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warningCount: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
  };
}
