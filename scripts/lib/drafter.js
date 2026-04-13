const crypto = require("crypto");
const { callOllamaJson } = require("./ai");
const { truncate, hashValue, nextPublicId, getWorkerConfig } = require("./shared");
const { getCompanyStrategicContext } = require("./context");

/**
 * Handles AI-returned objects/arrays for the 'body' field
 * and converts them into a single professional string.
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

/**
 * The DRAFTER is the first stage of the Trinity.
 * It reads raw DataCards (Sources) and proposes the initial DRAFT cards.
 */
async function draftFlashcardFromDataCard(prisma, company, dataCard, memoryPrompt) {
  const bodyLimit = getWorkerConfig(company, "draft_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);

  const systemPrompt = [
    "You are the Checklist DRAFTER. Your goal is to extract intelligence from DataCards (raw data).",
    "Your synthesis MUST align with the following strategic context of the company:",
    strategicContext,
    "Required fields: title, body, kind, confidence, impact, weight, hashtags.",
    "If the intelligence already exists in the provided context, do NOT duplicate it.",
    "Status will be DRAFT.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nDataCard Context: ${truncate(dataCard.content, 1500)}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.title || !raw.body) return null;

  const publicId = await nextPublicId(prisma, "Flashcard");
  
  return {
    id: crypto.randomUUID(),
    publicId,
    companyId: company.id,
    title: truncate(raw.title, 160),
    body: truncate(joinBody(raw.body), bodyLimit),
    confidence: parseInt(raw.confidence) || 50,
    impact: parseInt(raw.impact) || 5,
    weight: parseInt(raw.weight) || 5,
    status: "DRAFT",
    kind: String(raw.kind || "SUMMARY").toUpperCase(), 
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : [],
    fingerprint: hashValue(`EVO:FC:${company.id}:${dataCard.id}:${raw.title}`),
    createdBy: "drafter-agent"
  };
}

async function draftTaskcardFromFlashCard(prisma, company, flashCard, memoryPrompt) {
  const descLimit = getWorkerConfig(company, "draft_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);

  const systemPrompt = [
    "You are the Checklist DRAFTER. Your goal is to turn FlashCards into actionable TaskCards.",
    "Your tasks MUST be strategically aligned with the company's TopicCards and existing work:",
    strategicContext,
    "Required fields: title, description, kind, impact, confidence, ease.",
    "Check the context carefully. Do NOT draft a task that is already present.",
    "Status will be DRAFT.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nFlashCard: ${flashCard.title}\nInsight: ${flashCard.body}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.title || !raw.description) return null;

  const publicId = await nextPublicId(prisma, "NBAItem");

  return {
    id: crypto.randomUUID(),
    publicId,
    companyId: company.id,
    title: truncate(raw.title, 160),
    description: truncate(joinBody(raw.description), descLimit),
    kind: String(raw.kind || "TASK").toUpperCase(),
    impact: parseInt(raw.impact) || 5,
    confidence: parseInt(raw.confidence) || 50,
    ease: parseInt(raw.ease) || 5,
    status: "DRAFT",
    createdBy: "drafter-agent"
  };
}

module.exports = {
  draftFlashcardFromDataCard,
  draftTaskcardFromFlashCard
};
