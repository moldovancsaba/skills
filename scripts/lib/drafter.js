/**
 * checklist DRAFTER
 * v0.11.4-STABLE
 * 
 * The induction stage of the trinity pipeline.
 * Extracts raw intelligence from DataCards (Sources/Files) into structured DRAFT cards.
 */
const crypto = require("crypto");
const { callOllamaJson, callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, trinity_DRAFT_TIMEOUT_MS } = require("./core");
const { truncate, hashValue, nextPublicId, getWorkerConfig, parseBoundedInt } = require("./shared");
const { getCompanyStrategicContext } = require("./context");
const { unifyArray } = require("./synthesis-utils");

// --- UTILITIES ---

/**
 * Normalizes complex AI-returned body content into a professional string.
 */
function joinBody(body) {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) {
    return body.map(item => {
      if (typeof item === "string") return item;
      if (item.text) return `${item.key ? `**${item.key}**: ` : ""}${item.text}`;
      return JSON.stringify(item);
    }).join("\n\n");
  }
  if (typeof body === "object" && body !== null) {
    return Object.entries(body).map(([key, val]) => `**${key}**: ${val}`).join("\n\n");
  }
  return String(body);
}

// --- DRAFTING ENGINE ---

/**
 * Generates one or more Flashcard DRAFTs from a raw Source or File.
 * Aligns extraction with the company's current strategic TopicCards.
 */
async function draftFlashcardFromDataCard(prisma, company, dataCard, memoryPrompt, topic = null) {
  const bodyLimit = await getWorkerConfig(prisma, company, "draft_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);

  const { getSkillForSource } = require("./skills");
  const skill = getSkillForSource(dataCard);
  const skillPrompt = skill 
    ? `\n### [SPECIALIZED SKILL ACTIVATED: ${skill.label}]\nYou MUST apply the following marketing framework to this synthesis:\n${skill.framework}\n`
    : "";

  const systemPrompt = [
    "You are the checklist DRAFTER. Your goal matches DataCards (raw data) to potential FlashCards.",
    "Your synthesis MUST align with the following strategic context of the company:",
    strategicContext,
    topic ? `\n### [PRIMARY STRATEGIC GOAL: ${topic.label}]\nYou MUST prioritize insights that relate to: ${topic.notes || topic.label}\n` : "",
    skillPrompt,
    "Required fields: title, body, kind, confidence, impact, weight, hashtags.",
    "checklist AXIOM: You MUST generate strict integer scores for confidence, impact, and weight. The scale is STRICTLY 1 to 10 (1=Lowest, 10=Highest). NO zeros. NO percentages.",
    "If the intelligence already exists in the provided context, do NOT duplicate it.",
    "You may propose MULTIPLE FlashCards if the raw data contains distinct insights.",
    "Format: Return a JSON array of objects.",
    "APERTUS Purity Principle: A single card MUST be 100% monolingual. Do not mix languages within a single card. The chosen language must be exactly ONE of the languages listed in the [Allowed Languages Policy]. Any mixed languages (e.g., English title with Hungarian body, or English words inside a Hungarian sentence) are strictly forbidden. If the source is in a disallowed language, translate it fully.",
    "STRATEGIC FOCUS: Use the [TopicCards] provided in the context as anchors. Prioritize extracting evidence and insights that relate directly to these topics.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nDataCard Context: ${truncate(dataCard.content, 1500)}`;

  const raw = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.DRAFT, { timeoutMs: trinity_DRAFT_TIMEOUT_MS });
  const rawArray = unifyArray(raw);
  if (!Array.isArray(rawArray)) return [];

  const drafts = [];
  for (const raw of rawArray) {
    if (!raw.title || !raw.body) continue;
    const publicId = await nextPublicId(prisma, "Flashcard");
    
    let confidence, impact, weight;
    let procStatus = "DRAFT";
    
    try {
      confidence = parseBoundedInt(raw.confidence, 1, 10);
      impact = parseBoundedInt(raw.impact, 1, 10);
      weight = parseBoundedInt(raw.weight, 1, 10);
    } catch (e) {
      // Axiom 2: Human Review Circuit
      confidence = 1; impact = 1; weight = 1;
      procStatus = "REVIEW";
    }
    
    drafts.push({
      id: crypto.randomUUID(),
      publicId,
      companyId: company.id,
      title: truncate(raw.title, 160),
      body: truncate(joinBody(raw.body), bodyLimit),
      confidenceScore: confidence, // Reusing confidenceScore as strict 1-10 metric
      confidence: confidence,
      impact: impact,
      weight: weight,
      processingStatus: procStatus,
      activityState: "ACTIVE",
      status: "ACTIVE", 
      reviewStatus: "PENDING", 
      kind: String(raw.kind || "SUMMARY").toUpperCase(), 
      hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : [],
      fingerprint: hashValue(`EVO:FC:${company.id}:${dataCard.id}:${raw.title}`),
      createdBy: "drafter-agent",
      sourceId: dataCard.id,
      sourceType: dataCard.type
    });
  }
  return drafts;
}

/**
 * Generates actionable TaskCard (NBA) DRAFTs from a verified Flashcard.
 * Transforms static knowledge into strategic operational tasks.
 */
async function draftTaskcardFromFlashCard(prisma, company, flashCard, memoryPrompt, topic = null) {
  const descLimit = await getWorkerConfig(prisma, company, "draft_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);

  const systemPrompt = [
    "You are the checklist DRAFTER. Your goal is to turn FlashCards into actionable TaskCards.",
    "Your tasks MUST be strategically aligned with the company's TopicCards and existing work:",
    strategicContext,
    topic ? `\n### [PRIMARY STRATEGIC GOAL: ${topic.label}]\nEnsure this task directly supports the following objective: ${topic.notes || topic.label}\n` : "",
    "Required fields: title, description, kind, impact, confidence, ease.",
    "checklist AXIOM: You MUST generate strict integer scores for confidence, impact, and ease. The scale is STRICTLY 1 to 10 (1=Lowest, 10=Highest). NO zeros. NO percentages.",
    "Check the context carefully. Do NOT draft a task that is already present.",
    "You may propose MULTIPLE TaskCards if appropriate.",
    "Format: Return a JSON array of objects.",
    "APERTUS Purity Principle: A single card MUST be 100% monolingual. Do not mix languages within a single card. The chosen language must be exactly ONE of the languages listed in the [Allowed Languages Policy]. Any mixed languages (e.g., English title with Hungarian body, or English words inside a Hungarian sentence) are strictly forbidden. If the source is in a disallowed language, translate it fully.",
    "STRATEGIC FOCUS: Generate TaskCards that directly support the [TopicCards] listed in the context.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nFlashCard: ${flashCard.title}\nInsight: ${flashCard.body}`;

  const raw = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.DRAFT, { timeoutMs: trinity_DRAFT_TIMEOUT_MS });
  const rawArray = unifyArray(raw);
  if (!Array.isArray(rawArray)) return [];

  const drafts = [];
  for (const raw of rawArray) {
    if (!raw.title || !raw.description) continue;
    const publicId = await nextPublicId(prisma, "NBAItem");

    let confidence, impact, ease, iceScore;
    let procStatus = "DRAFT";
    
    try {
      confidence = parseBoundedInt(raw.confidence, 1, 10);
      impact = parseBoundedInt(raw.impact, 1, 10);
      ease = parseBoundedInt(raw.ease, 1, 10);
      iceScore = impact * confidence * ease;
    } catch (e) {
      // Axiom 2: Human Review Circuit
      confidence = 1; impact = 1; ease = 1; iceScore = 1;
      procStatus = "REVIEW";
    }

    drafts.push({
      id: crypto.randomUUID(),
      publicId,
      companyId: company.id,
      title: truncate(raw.title, 160),
      description: truncate(joinBody(raw.description), descLimit),
      kind: String(raw.kind || "TASK").toUpperCase(),
      impact: impact,
      confidenceScore: confidence,
      confidence: confidence, // syncing both for legacy columns
      ease: ease,
      iceScore: iceScore,
      processingStatus: procStatus,
      activityState: "ACTIVE",
      status: "PENDING", 
      createdBy: "drafter-agent",
      fingerprint: hashValue(`EVO:TC:${company.id}:${flashCard.id}:${raw.title}`)
    });
  }
  return drafts;
}

module.exports = {
  draftFlashcardFromDataCard,
  draftTaskcardFromFlashCard
};
