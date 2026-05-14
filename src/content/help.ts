export type HelpSection = {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type ExpertTip = {
  id: string;
  category: string;
  title: string;
  body: string;
  whyItMatters: string;
  ctaLabel: string;
  ctaHref: string;
  samplePhrases?: string[];
};

export type DashboardTipContext = {
  companyId: string;
  productCount: number;
  customerCount: number;
  competitorCount: number;
  fileCount: number;
  flashcardCount: number;
  pendingTaskCount: number;
};

export const manualSections: HelpSection[] = [
  {
    id: "system-model",
    title: "Understand the three system layers",
    summary: "checklist works best when you treat data, Knowmore, and tasks as separate jobs, and keep the webapp and local AI roles separate.",
    bullets: [
      "Data is raw source input: notes, URLs, research snippets, and uploaded files.",
      "Knowmore is the knowledge layer: flashcards generated from evidence and enrichment.",
      "checklist is the action layer: next-best tasks generated from company context and flashcards.",
      "The webapp reads persisted results from MongoDB Atlas and writes user interactions or repair intents back.",
      "The local AI system pulls those records, calculates authoritative state, and pushes the updated results back into MongoDB Atlas.",
      "If the source data is weak, the flashcards and tasks will drift.",
    ],
  },
  {
    id: "best-sources",
    title: "Add the highest-value sources first",
    summary: "The AI team gets the best results from sources that expose real market language and real constraints.",
    bullets: [
      "Add offer pages, pricing pages, onboarding pages, FAQs, sales decks, and audience notes before broad descriptive copy.",
      "Add alternative market positioning, competitor evidence, and proof pages instead of just a homepage snapshot.",
      "Upload files when they contain detail that the public web does not show, such as call notes, sales docs, and internal briefs.",
      "Markdown and plain-text files are valid evidence inputs. Their text should remain readable in Data cards and shared card views after upload.",
      "Use clear raw source text and useful hashtags so the system can cluster the source correctly.",
    ],
  },
  {
    id: "flashcard-feedback",
    title: "Review flashcards like an operator, not a spectator",
    summary: "A good flashcard review explains why a card is useful, wrong, early, or unsupported.",
    bullets: [
      "Accept a flashcard when it is directionally right and useful for decisions.",
      "Decline a flashcard when it is wrong, misleading, outdated, or too weakly supported.",
      "Use Modify + accept when the idea is useful but the wording needs correction.",
      "Use direct correction controls when review alone is not enough: pin strong knowledge, hide noise, mark wrong facts, request refresh, or suppress a bad source.",
      "State what is missing: missing evidence, wrong audience, stale claim, or overconfident conclusion.",
    ],
  },
  {
    id: "task-feedback",
    title: "Use task feedback to teach timing and readiness",
    summary: "Task feedback should tell the system whether the idea is good, bad, early, blocked, or already covered.",
    bullets: [
      "Decline with intent: already doing this, not relevant, too early, blocked by budget, blocked by team capacity, blocked by missing data.",
      "Use timing phrases when the idea is good but premature, such as after summer, after launch, after hiring, or revisit in Q4.",
      "Use Modify + accept when the task is right but needs a narrower title or a more realistic execution scope.",
      "Short vague comments like not now or maybe later are much less useful than explicit readiness language.",
    ],
  },
  {
    id: "scores-and-priority",
    title: "Read ICE and priority the right way",
    summary: "ICE is the visible card score, but checklist ranks action work with a broader priority model.",
    bullets: [
      "ICE expresses impact, confidence, and ease for the specific card and company context.",
      "Priority uses ICE plus quality, urgency, freshness, human guidance, lifecycle state, risk, and company memory to decide ordering.",
      "Two cards can have similar ICE and still appear in a different order when one is fresher, more urgent, more trusted, or more human-guided.",
      "The best way to improve future scores is still better evidence and sharper accept, decline, modify, and delivery feedback.",
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshoot weak output systematically",
    summary: "When the system feels off, the fastest fix is usually better inputs and better feedback.",
    bullets: [
      "If tasks are generic, add sharper pricing, market, and audience evidence.",
      "If flashcards feel wrong, decline them with specific reasons instead of silently ignoring them.",
      "If a flashcard is structurally wrong or keeps coming back, use the direct Knowmore correction controls instead of repeating the same review comment.",
      "If tasks are good but mistimed, say what prerequisite is missing so the AI team can learn to postpone rather than discard.",
      "If the rank order feels surprising, check whether urgency, readiness, delivery difficulty, or older human feedback is separating cards with similar visible ICE.",
      "If a company has very little data, start on the Data page before judging the rest of the system.",
    ],
  },
  {
    id: "repair-actions",
    title: "Understand repair actions correctly",
    summary: "Repair buttons do not make the webapp do AI work directly.",
    bullets: [
      "Knowmore health and Observability actions write repair intents or worker commands into MongoDB Atlas.",
      "The local AI worker picks those commands up on its loop and performs queue sync, repair, recovery, or snapshot refresh work.",
      "If a repair button was pressed but nothing changes, check the local worker health and the shared database connection before blaming the webapp.",
      "Queue pages should show persisted queue state; simply opening a page should not recalculate or repair anything.",
    ],
  },
  {
    id: "language-policy",
    title: "Use language policy intentionally",
    summary: "Permitted languages constrain what the local AI system is allowed to write.",
    bullets: [
      "The allowed-language setting is a hard policy for synthesis and refinement, not a soft preference.",
      "If Hungarian is the only permitted language, new and refreshed cards should stay Hungarian.",
      "If wording is wrong but the language is right, use review and correction controls so the local AI system revisits the card.",
      "If a card violates the selected language policy, treat that as a quality error and repair it rather than accepting it as normal variation.",
    ],
  },
];

export const faqItems: FaqItem[] = [
  {
    id: "what-to-add-first",
    question: "What kind of data should I add first?",
    answer:
      "Start with the sources that expose real business detail: product pages, pricing, positioning, customer notes, competitor pricing, and internal files with market language. Generic homepage copy is much less useful than real constraints and proof.",
  },
  {
    id: "why-flashcards-first",
    question: "Why do I see flashcards before tasks?",
    answer:
      "Knowmore is the system's knowledge layer. The app turns source evidence into flashcards first, then uses those flashcards to generate better checklist items. Weak flashcards usually lead to weak tasks.",
  },
  {
    id: "how-to-decline-task",
    question: "How should I decline a task?",
    answer:
      "Explain why the task should not be done now. Good decline comments identify whether the task is wrong, already handled, irrelevant, too early, blocked by resources, or good but mistimed. Specific timing language is especially valuable.",
  },
  {
    id: "not-now-vs-never",
    question: "How do I tell the system not now instead of never?",
    answer:
      "Use timing or dependency phrases. Examples: after summer, after launch, after we hire an SDR, after budget approval, after CRM migration, or revisit in Q4. That teaches the AI team to postpone instead of kill the idea.",
  },
  {
    id: "flashcard-trust",
    question: "What makes a flashcard trustworthy?",
    answer:
      "A trustworthy flashcard has clear evidence behind it, matches the company context, and survives review. If it feels off, call out what is unsupported, stale, overconfident, or aimed at the wrong audience.",
  },
  {
    id: "ice-vs-priority",
    question: "What is the difference between ICE and priority?",
    answer:
      "ICE is the visible score on cards. Priority is the broader ranking model used for tactical ordering. Priority keeps ICE visible but also accounts for urgency, freshness, human guidance, quality, risk, lifecycle state, and company-specific history.",
  },
  {
    id: "how-scores-improve",
    question: "How does the system improve its scores over time?",
    answer:
      "The system learns from better evidence, flashcard review, task review, and delivered work. Accepted, declined, modified, and delivered outcomes all feed the scoring contract, so precise feedback improves future impact, confidence, ease, and ordering.",
  },
  {
    id: "how-local-learning-works",
    question: "How will the local model learn from our feedback over time?",
    answer:
      "The active plan is to export training datasets from checklist feedback and corrections, fine-tune candidate models locally on Apple Silicon through MLX / MLX-LM, and promote them back into Ollama only after evaluation gates. Parked research tools are not part of the live rollout unless the architecture changes.",
  },
  {
    id: "how-to-repair-knowmore",
    question: "What should I do if Knowmore looks stale or wrong?",
    answer:
      "Use the Knowmore health actions first: sync, request repair, or recover failed jobs. Those actions write persisted repair intents or worker commands; the local AI worker executes the actual repair work. On individual cards, use direct correction controls like pin, hide, mark wrong, request refresh, or suppress a bad source so the worker has a precise corrective signal to consume.",
  },
  {
    id: "why-webapp-does-not-calculate",
    question: "Why does the webapp not calculate the AI state directly?",
    answer:
      "Because the architecture contract is strict: the webapp shows persisted results from MongoDB Atlas and writes interaction or repair-intent records back. The local AI system is the only authority that calculates queue state, score health, observability summaries, and other intelligence outputs.",
  },
  {
    id: "markdown-files-in-data",
    question: "How should uploaded Markdown files appear in Data?",
    answer:
      "Uploaded `.md` and other plain-text files should keep their extracted text visible in Data cards, Data modals, and shared single-card pages. If you only see a filename or an empty body, that is a rendering or resolver bug, not expected behavior.",
  },
  {
    id: "language-policy-behavior",
    question: "How should the language policy behave?",
    answer:
      "The language setting is a hard synthesis rule for the local AI system. The app should store the policy, the worker should obey it, and refreshed cards should continue to respect it. Wrong-language output is a system error, not acceptable drift.",
  },
  {
    id: "why-weak-suggestions",
    question: "Why do I still see weak suggestions sometimes?",
    answer:
      "Usually because the system has weak or limited source coverage, or because previous feedback did not clearly explain what was wrong. Better source quality and sharper review comments improve the next cycle.",
  },
  {
    id: "can-i-correct-ai",
    question: "Can I correct the AI directly?",
    answer:
      "Yes. Use Modify + accept when the idea is useful but the wording or scope is wrong. Use Decline with a precise reason when the idea itself should not survive. Both paths teach the system much more than silence.",
  },
];

const expertTips = {
  foundation: (companyId: string): ExpertTip => ({
    id: "foundation",
    category: "Data to add",
    title: "Build a stronger evidence base before judging the AI",
    body:
      "Add at least a few real sources or files. The best early additions are pricing pages, offer pages, onboarding pages, FAQs, interview notes, and research snippets.",
    whyItMatters:
      "Weak source coverage creates weak flashcards and generic tasks. A small set of sharp sources beats a large set of vague descriptive pages.",
    ctaLabel: "Open Data",
    ctaHref: `/${companyId}/data`,
  }),
  evidence: (companyId: string): ExpertTip => ({
    id: "evidence",
    category: "Source quality",
    title: "Upload the artifacts the public web cannot see",
    body:
      "If you have no files yet, add one or two internal assets such as sales notes, briefs, positioning docs, or interview summaries.",
    whyItMatters:
      "Uploaded files often contain the strongest language about objections, demand, timing, and priorities, which makes the generated knowledge much sharper.",
    ctaLabel: "Add files",
    ctaHref: `/${companyId}/data`,
  }),
  flashcards: (companyId: string): ExpertTip => ({
    id: "flashcards",
    category: "Knowmore review",
    title: "Use flashcard feedback to explain what is wrong, not just that it feels wrong",
    body:
      "When you decline a flashcard, state whether it is unsupported, outdated, overconfident, aimed at the wrong audience, or missing a key source.",
    whyItMatters:
      "Clear flashcard reviews improve the knowledge layer directly and make the next task cycle less noisy.",
    ctaLabel: "Open Knowmore",
    ctaHref: `/${companyId}/knowmore`,
  }),
  postpone: (companyId: string): ExpertTip => ({
    id: "postpone",
    category: "Task declines",
    title: "Teach the system when a task is good but too early",
    body:
      "When declining a task, use timing language like after summer, after launch, after hiring, or revisit in Q4 instead of a vague not now.",
    whyItMatters:
      "Specific readiness signals help the AI team postpone ideas instead of treating them as permanently bad.",
    ctaLabel: "Open checklist",
    ctaHref: `/${companyId}/checklist`,
    samplePhrases: [
      "We will be ready for this task after the summer.",
      "Revisit this after the September intake.",
      "Do this once the new landing page is live.",
    ],
  }),
  help: (): ExpertTip => ({
    id: "help",
    category: "Help center",
    title: "Use the in-app FAQ when you want better output faster",
    body:
      "The FAQ explains what to add as data, how to review flashcards well, and how to use decline language that teaches timing and readiness.",
    whyItMatters:
      "The fastest way to improve results is to match your inputs and feedback to how the system actually works.",
    ctaLabel: "Open FAQ",
    ctaHref: "/faq",
  }),
  architecture: (companyId: string): ExpertTip => ({
    id: "architecture",
    category: "Operator model",
    title: "Use the app as control and evidence capture, not as the AI engine",
    body:
      "The webapp records your inputs, feedback, and repair intents. The local AI worker is responsible for recalculating knowledge, queue state, and downstream outputs.",
    whyItMatters:
      "When a page looks wrong, the next place to inspect is usually the persisted evidence or the local worker health, not a hidden browser calculation.",
    ctaLabel: "Open Observability",
    ctaHref: `/${companyId}/observability`,
  }),
};

export function getDashboardExpertTip(context: DashboardTipContext): ExpertTip {
  const totalSources =
    context.productCount +
    context.customerCount +
    context.competitorCount +
    context.fileCount;

  if (totalSources < 3) {
    return expertTips.foundation(context.companyId);
  }

  if (context.flashcardCount === 0 && totalSources > 0) {
    return expertTips.architecture(context.companyId);
  }

  if (context.fileCount === 0) {
    return expertTips.evidence(context.companyId);
  }

  if (context.pendingTaskCount > 0) {
    return expertTips.postpone(context.companyId);
  }

  if (context.flashcardCount > 0) {
    return expertTips.flashcards(context.companyId);
  }

  return expertTips.help();
}
