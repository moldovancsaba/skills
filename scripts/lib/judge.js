const { callOllamaJson } = require("./ai");
const { getCompanyStrategicContext } = require("./context");

/**
 * The JUDGE is the final stage of the Trinity Quality Gate.
 * It audits CHECKED cards and either promotes to VERIFIED or demotes to DRAFT.
 */
async function auditCheckedFlashCard(prisma, flashCard, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);

  const systemPrompt = [
    "You are the Checklist JUDGE. Your goal is to audit FlashCards for high-quality marketing standards.",
    "Your audit MUST consider the following strategic context of the company:",
    strategicContext,
    "Return a SINGLE JSON object with: decision ('VERIFIED' or 'REJECTED'), and reason.",
    "If the card is perfectly aligned and unique, VERIFIED. If it is redundant or off-strategy, REJECTED.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${flashCard.title}\nBody: ${flashCard.body}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.decision) return { status: "CHECKED" }; 

  if (raw.decision === "VERIFIED") {
    return { status: "VERIFIED" };
  } else {
    return { status: "DRAFT", userAnnotation: `[JUDGE REJECTION]: ${raw.reason}` };
  }
}

async function auditCheckedTaskCard(prisma, taskCard, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, taskCard.companyId);

  const systemPrompt = [
    "You are the Checklist JUDGE. Audit this TaskCard for actionable quality.",
    "The task MUST be strategically aligned with the TopicCards and existing work:",
    strategicContext,
    "Return a SINGLE JSON object with: decision ('VERIFIED' or 'REJECTED'), and reason.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Title: ${taskCard.title}\nDescription: ${taskCard.description}`;

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!raw || !raw.decision) return { status: "CHECKED" };

  if (raw.decision === "VERIFIED") {
    return { status: "VERIFIED" };
  } else {
    return { status: "DRAFT", userAnnotation: `[JUDGE REJECTION]: ${raw.reason}` };
  }
}

module.exports = {
  auditCheckedFlashCard,
  auditCheckedTaskCard
};
