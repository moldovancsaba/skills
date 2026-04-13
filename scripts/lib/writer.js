const { callOllamaJson } = require("./ai");
const { truncate, getWorkerConfig } = require("./shared");
const { getCompanyStrategicContext } = require("./context");

/**
 * Handles AI-returned objects/arrays for the 'body' field.
 */
function joinBody(body) {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) return body.join("\n\n");
  if (typeof body === "object" && body !== null) {
     return Object.entries(body).map(([k,v]) => `**${k}**: ${v}`).join("\n\n");
  }
  return String(body);
}

/**
 * The WRITER is the second stage of the Trinity.
 * It refines DRAFT cards and upgrades them to CHECKED.
 */
async function refineDraftFlashCard(prisma, flashCard, memoryPrompt) {
  const bodyLimit = getWorkerConfig(flashCard.company || {}, "write_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);

  const systemPrompt = [
    "You are the Checklist WRITER. Your goal is to refine DRAFT FlashCards.",
    "Your refinements MUST align with the following strategic context of the company:",
    strategicContext,
    "Return a SINGLE JSON object with the refined: title, body, kind, hashtags.",
    "If the content is redundant given the context, improve the depth or return the original.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${flashCard.title}\nDRAFT Body: ${flashCard.body}\nDRAFT Kind: ${flashCard.kind}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.title || !raw.body) return null;

  return {
    title: truncate(raw.title, 160),
    body: truncate(joinBody(raw.body), bodyLimit),
    kind: String(raw.kind || flashCard.kind).toUpperCase(), 
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : flashCard.hashtags,
    status: "CHECKED"
  };
}

async function refineDraftTaskCard(prisma, taskCard, memoryPrompt) {
  const descLimit = getWorkerConfig(taskCard.company || {}, "write_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, taskCard.companyId);

  const systemPrompt = [
    "You are the Checklist WRITER. Your goal is to refine DRAFT TaskCards.",
    "Ensure the task is strategically aligned with the TopicCards and existing work:",
    strategicContext,
    "Return a SINGLE JSON object with the refined: title, description, kind, impact, confidence, ease.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `DRAFT Title: ${taskCard.title}\nDRAFT Description: ${taskCard.description}\nDRAFT Kind: ${taskCard.kind}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.title || !raw.description) return null;

  return {
    title: truncate(raw.title, 160),
    description: truncate(joinBody(raw.description), descLimit),
    kind: String(raw.kind || taskCard.kind).toUpperCase(),
    impact: parseInt(raw.impact) || taskCard.impact,
    confidence: parseInt(raw.confidence) || taskCard.confidence,
    ease: parseInt(raw.ease) || taskCard.ease,
    status: "CHECKED"
  };
}

module.exports = {
  refineDraftFlashCard,
  refineDraftTaskCard
};
