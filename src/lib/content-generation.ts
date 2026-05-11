export type ContentTone = "clear" | "bold" | "executive" | "friendly" | "technical";

export type ContentGenerationInput = {
  companyName: string;
  industry?: string | null;
  description?: string | null;
  targetMarket?: string | null;
  productContext: string[];
  competitorContext: string[];
  goalContext: string[];
  tone: ContentTone;
  campaignBrief?: string | null;
};

export type GeneratedContentBundle = {
  tone: ContentTone;
  positioning: {
    audience: string;
    promise: string;
    proof: string;
    competitorAngle: string;
  };
  emailSubjectLines: string[];
  adCopy: Array<{
    platform: "Facebook" | "Google" | "LinkedIn";
    headline: string;
    primaryText: string;
    cta: string;
    characterLimit: string;
  }>;
  socialPosts: Array<{
    platform: "Twitter" | "LinkedIn" | "Facebook";
    post: string;
    characterLimit: string;
  }>;
  landingPage: {
    heroHeadline: string;
    heroSubheadline: string;
    benefits: string[];
    cta: string;
  };
};

const TONE_PROFILES: Record<ContentTone, { verb: string; adjective: string; cta: string }> = {
  clear: { verb: "turn", adjective: "clear", cta: "See the next best action" },
  bold: { verb: "accelerate", adjective: "decisive", cta: "Lead the market" },
  executive: { verb: "align", adjective: "board-ready", cta: "Review the plan" },
  friendly: { verb: "make", adjective: "practical", cta: "Start improving today" },
  technical: { verb: "operationalize", adjective: "evidence-backed", cta: "Inspect the workflow" },
};

const PLATFORM_LIMITS = {
  emailSubject: 72,
  facebookAd: 125,
  googleHeadline: 30,
  googleDescription: 90,
  linkedinAd: 150,
  twitterPost: 280,
  linkedinPost: 600,
  facebookPost: 500,
};

function compact(value: string, maxLength: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

function firstMeaningful(values: Array<string | null | undefined>, fallback: string) {
  const found = values.find((value) => typeof value === "string" && value.trim().length > 0);
  return found?.trim() || fallback;
}

function phraseFromContext(values: string[], fallback: string) {
  const source = firstMeaningful(values, fallback);
  return compact(source.replace(/[#*_`]/g, ""), 110);
}

function inferAudience(input: ContentGenerationInput) {
  return compact(
    firstMeaningful(
      [input.targetMarket, input.industry ? `${input.industry} teams` : null, input.description],
      "growth teams",
    ),
    80,
  );
}

function inferPromise(input: ContentGenerationInput) {
  const profile = TONE_PROFILES[input.tone] ?? TONE_PROFILES.clear;
  const productSignal = phraseFromContext(input.productContext, input.description || "market and product context");
  const brief = input.campaignBrief ? ` for ${input.campaignBrief}` : "";
  return compact(`${profile.verb} ${productSignal}${brief} into ${profile.adjective} marketing action`, 140);
}

function inferProof(input: ContentGenerationInput) {
  return phraseFromContext(
    [...input.goalContext, ...input.productContext],
    "built from product, customer, and market evidence already in CHECKLIST",
  );
}

function inferCompetitorAngle(input: ContentGenerationInput) {
  return phraseFromContext(
    input.competitorContext,
    "differentiate against slower, less evidence-backed alternatives",
  );
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word)
    .join(" ");
}

export function generateContentBundle(input: ContentGenerationInput): GeneratedContentBundle {
  const profile = TONE_PROFILES[input.tone] ?? TONE_PROFILES.clear;
  const audience = inferAudience(input);
  const promise = inferPromise(input);
  const proof = inferProof(input);
  const competitorAngle = inferCompetitorAngle(input);
  const companyName = compact(input.companyName || "Your company", 48);

  const subjectSeeds = [
    `${companyName}: ${titleCase(profile.adjective)} Growth Starts Here`,
    `A better way to ${profile.verb} ${audience}`,
    `Turn market context into action this week`,
    `${titleCase(audience)} deserve sharper recommendations`,
    `What to do next, backed by your evidence`,
  ];

  const emailSubjectLines = subjectSeeds.map((subject) => compact(subject, PLATFORM_LIMITS.emailSubject));

  const adCopy = [
    {
      platform: "Facebook" as const,
      headline: compact(`${companyName} for ${audience}`, 40),
      primaryText: compact(`${promise}. Use your product and competitor evidence to decide what to say next.`, PLATFORM_LIMITS.facebookAd),
      cta: profile.cta,
      characterLimit: `${PLATFORM_LIMITS.facebookAd} primary-text chars`,
    },
    {
      platform: "Google" as const,
      headline: compact(`${profile.adjective} marketing`, PLATFORM_LIMITS.googleHeadline),
      primaryText: compact(`${promise}. ${profile.cta}.`, PLATFORM_LIMITS.googleDescription),
      cta: "Learn more",
      characterLimit: `${PLATFORM_LIMITS.googleHeadline} headline / ${PLATFORM_LIMITS.googleDescription} description chars`,
    },
    {
      platform: "LinkedIn" as const,
      headline: compact(`${companyName} helps ${audience}`, 70),
      primaryText: compact(`${proof}. ${competitorAngle}. ${profile.cta}.`, PLATFORM_LIMITS.linkedinAd),
      cta: "Request a review",
      characterLimit: `${PLATFORM_LIMITS.linkedinAd} intro chars`,
    },
  ];

  const socialPosts = [
    {
      platform: "Twitter" as const,
      post: compact(`${companyName} helps ${audience} ${promise}. The edge: ${competitorAngle}.`, PLATFORM_LIMITS.twitterPost),
      characterLimit: `${PLATFORM_LIMITS.twitterPost} chars`,
    },
    {
      platform: "LinkedIn" as const,
      post: compact(`${audience} do not need more generic marketing ideas. They need ${profile.adjective} actions grounded in product, customer, and competitor evidence. ${companyName} helps teams ${promise}.`, PLATFORM_LIMITS.linkedinPost),
      characterLimit: `${PLATFORM_LIMITS.linkedinPost} chars`,
    },
    {
      platform: "Facebook" as const,
      post: compact(`Marketing works better when every message has evidence behind it. ${companyName} helps ${audience} ${promise}.`, PLATFORM_LIMITS.facebookPost),
      characterLimit: `${PLATFORM_LIMITS.facebookPost} chars`,
    },
  ];

  return {
    tone: input.tone,
    positioning: {
      audience,
      promise,
      proof,
      competitorAngle,
    },
    emailSubjectLines,
    adCopy,
    socialPosts,
    landingPage: {
      heroHeadline: compact(`${titleCase(profile.adjective)} marketing decisions for ${audience}`, 86),
      heroSubheadline: compact(`${companyName} helps you ${promise}, using the product and competitor context your team already trusts.`, 180),
      benefits: [
        compact(`Ground every campaign in live product and market evidence: ${proof}.`, 120),
        compact(`Sharpen differentiation with competitor context: ${competitorAngle}.`, 120),
        compact(`Move from content ideas to ${profile.adjective} next actions without manual blank-page work.`, 120),
      ],
      cta: profile.cta,
    },
  };
}

export function serializeContentSection(title: string, value: unknown) {
  if (Array.isArray(value)) {
    return [`# ${title}`, "", ...value.map((item) => `- ${String(item)}`)].join("\n");
  }
  if (typeof value === "object" && value !== null) {
    return [`# ${title}`, "", JSON.stringify(value, null, 2)].join("\n");
  }
  return [`# ${title}`, "", String(value ?? "")].join("\n");
}
