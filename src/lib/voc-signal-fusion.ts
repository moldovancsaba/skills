import { Prisma } from "@prisma/client";

export type VocChannel = "REVIEW" | "SUPPORT" | "SURVEY" | "SALES" | "SOCIAL" | "CANCELLATION" | "INTERVIEW" | "NOTE";
export type VocSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";

export const VOC_CHANNELS: Array<{ value: VocChannel; label: string }> = [
  { value: "REVIEW", label: "Review" },
  { value: "SUPPORT", label: "Support" },
  { value: "SURVEY", label: "Survey" },
  { value: "SALES", label: "Sales" },
  { value: "SOCIAL", label: "Social" },
  { value: "CANCELLATION", label: "Cancellation" },
  { value: "INTERVIEW", label: "Interview" },
  { value: "NOTE", label: "Note" },
];

const SENTIMENTS: VocSentiment[] = ["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"];

const THEME_RULES = [
  {
    key: "onboarding",
    title: "Onboarding friction",
    terms: ["onboard", "setup", "start", "confusing", "activation", "tutorial", "learn"],
    rootCause: "Customers are not reaching first value quickly or clearly enough.",
    work: "Review onboarding steps, first-run guidance, and activation messaging.",
  },
  {
    key: "pricing",
    title: "Pricing or value objection",
    terms: ["price", "pricing", "expensive", "cost", "budget", "worth", "value"],
    rootCause: "Perceived value, packaging, or pricing explanation is not strong enough for this segment.",
    work: "Create a pricing/value objection brief and test clearer packaging or proof points.",
  },
  {
    key: "reliability",
    title: "Reliability and quality concern",
    terms: ["bug", "broken", "slow", "crash", "error", "reliable", "quality", "missing"],
    rootCause: "Customers are encountering quality or performance issues that reduce trust.",
    work: "Prioritize a reliability repair checklist with supporting customer excerpts.",
  },
  {
    key: "support",
    title: "Support experience gap",
    terms: ["support", "help", "reply", "response", "ticket", "service", "agent"],
    rootCause: "Customers need faster or clearer help paths for unresolved work.",
    work: "Review support macros, escalation paths, and self-serve help content.",
  },
  {
    key: "feature",
    title: "Feature request or capability gap",
    terms: ["feature", "wish", "need", "request", "integration", "export", "report", "dashboard"],
    rootCause: "A recurring use case is not sufficiently covered by the current product surface.",
    work: "Create a product opportunity brief that links demand, segment, and expected impact.",
  },
];

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampScore(value: unknown, fallback = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(5, Math.round(numeric)));
}

export function normalizeVocChannel(value: unknown): VocChannel {
  const candidate = String(value || "").toUpperCase();
  return VOC_CHANNELS.some((item) => item.value === candidate) ? candidate as VocChannel : "NOTE";
}

export function normalizeVocSentiment(value: unknown): VocSentiment {
  const candidate = String(value || "").toUpperCase();
  return SENTIMENTS.includes(candidate as VocSentiment) ? candidate as VocSentiment : "NEUTRAL";
}

export function normalizeVocSignalInput(data: Record<string, unknown>) {
  const excerpt = cleanText(data.excerpt || data.body || data.content);
  const title = cleanText(data.title, excerpt.slice(0, 80) || "Customer signal");
  return {
    channel: normalizeVocChannel(data.channel),
    sourceLabel: cleanText(data.sourceLabel) || undefined,
    customerSegment: cleanText(data.customerSegment) || undefined,
    lifecycleStage: cleanText(data.lifecycleStage) || undefined,
    sentiment: normalizeVocSentiment(data.sentiment),
    urgency: clampScore(data.urgency),
    accountValue: Number.isFinite(Number(data.accountValue)) ? Number(data.accountValue) : undefined,
    title: title.slice(0, 160),
    excerpt: excerpt.slice(0, 2000),
    provenanceUrl: cleanText(data.provenanceUrl) || undefined,
    occurredAt: typeof data.occurredAt === "string" && data.occurredAt ? new Date(data.occurredAt) : new Date(),
    metadata: typeof data.metadata === "object" && data.metadata && !Array.isArray(data.metadata)
      ? data.metadata as Prisma.InputJsonValue
      : {},
  };
}

type SignalLike = {
  id: string;
  title: string;
  excerpt: string;
  channel: string;
  customerSegment: string | null;
  lifecycleStage: string | null;
  sentiment: string;
  urgency: number;
  occurredAt: Date;
};

function matchingRule(signal: SignalLike) {
  const text = `${signal.title} ${signal.excerpt}`.toLowerCase();
  return THEME_RULES.find((rule) => rule.terms.some((term) => text.includes(term))) || {
    key: "general",
    title: "General customer signal",
    terms: [],
    rootCause: "Customers are expressing a recurring need that needs more evidence before deep prioritization.",
    work: "Collect more customer evidence, then convert the strongest pattern into product, messaging, or support work.",
  };
}

function confidenceFor(signals: SignalLike[]) {
  const recurrence = Math.min(30, signals.length * 10);
  const urgency = Math.round(signals.reduce((sum, signal) => sum + signal.urgency, 0) / Math.max(1, signals.length)) * 8;
  const channelSpread = new Set(signals.map((signal) => signal.channel)).size * 5;
  return Math.max(30, Math.min(95, 25 + recurrence + urgency + channelSpread));
}

function sentimentMix(signals: SignalLike[]) {
  return signals.reduce<Record<string, number>>((mix, signal) => {
    mix[signal.sentiment] = (mix[signal.sentiment] || 0) + 1;
    return mix;
  }, {});
}

export function buildVocThemeCandidates(signals: SignalLike[]) {
  const grouped = new Map<string, SignalLike[]>();
  for (const signal of signals) {
    const rule = matchingRule(signal);
    grouped.set(rule.key, [...(grouped.get(rule.key) || []), signal]);
  }

  return Array.from(grouped.entries()).map(([key, items]) => {
    const rule = THEME_RULES.find((candidate) => candidate.key === key) || matchingRule(items[0]);
    const segments = Array.from(new Set(items.map((item) => item.customerSegment).filter((value): value is string => Boolean(value)))).slice(0, 6);
    const excerpts = items.slice(0, 6).map((item) => ({
      signalId: item.id,
      channel: item.channel,
      excerpt: item.excerpt.slice(0, 240),
      sentiment: item.sentiment,
      urgency: item.urgency,
    }));
    const confidence = confidenceFor(items);
    const recurrenceScore = Math.min(5, items.length);
    const impactScore = Math.max(1, Math.min(5, Math.round((confidence / 20 + recurrenceScore) / 2)));
    const priorityScore = Math.round((impactScore * 30 + confidence + recurrenceScore * 10) / 2);

    return {
      title: rule.title,
      summary: `${items.length} customer signal${items.length === 1 ? "" : "s"} point to ${rule.title.toLowerCase()}.`,
      rootCauseHypothesis: rule.rootCause,
      affectedSegments: segments,
      signalIds: items.map((item) => item.id),
      supportingExcerpts: excerpts,
      sentimentMix: sentimentMix(items),
      trendDirection: items.length >= 3 ? "RISING" : "STABLE",
      confidence,
      impactScore,
      recurrenceScore,
      freshnessScore: 5,
      reviewState: Object.keys(sentimentMix(items)).length > 2 ? "REVIEW" : "READY",
      actionBrief: {
        title: `${rule.title} action brief`,
        rootCause: rule.rootCause,
        affectedSegment: segments[0],
        recommendedWork: rule.work,
        nextStepType: "CHECKLIST",
        priorityScore,
        evidence: excerpts,
      },
    };
  }).sort((a, b) => b.actionBrief.priorityScore - a.actionBrief.priorityScore);
}

export function summarizeVoc(signals: SignalLike[], themes: Array<{ confidence: number; reviewState: string }>, briefs: Array<{ status: string }>) {
  const negativeSignals = signals.filter((signal) => signal.sentiment === "NEGATIVE").length;
  const urgentSignals = signals.filter((signal) => signal.urgency >= 4).length;
  const avgConfidence = themes.length
    ? Math.round(themes.reduce((sum, theme) => sum + theme.confidence, 0) / themes.length)
    : 0;
  return {
    totalSignals: signals.length,
    negativeSignals,
    urgentSignals,
    totalThemes: themes.length,
    reviewThemes: themes.filter((theme) => theme.reviewState === "REVIEW").length,
    actionBriefs: briefs.length,
    openBriefs: briefs.filter((brief) => brief.status !== "ARCHIVED").length,
    averageThemeConfidence: avgConfidence,
  };
}
