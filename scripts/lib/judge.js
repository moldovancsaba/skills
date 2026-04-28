/**
 * checklist JUDGE
 * v2.0.0 — Ground Truth Edition
 */
const { callOllamaJson, callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, trinity_JUDGE_TIMEOUT_MS } = require("./core");
const { getCompanyStrategicContext } = require("./context");
const { getWorkerConfig, calculatePercentile, parseBoundedInt, canonicalSourceText } = require("./shared");
const { unifyObject } = require("./synthesis-utils");

/**
 * Audits a CHECKED Flashcard and determines its promotion path.
 * Implements Claim-Level Grounding (v2.0.0).
 */
async function auditCheckedFlashCard(prisma, flashCard, memoryPrompt, topic = null, sourceContent = null, workerContext = {}) {
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);

  const systemPrompt = [
    "You are the checklist JUDGE. Audit the following FlashCard for production quality.",
    "### [GROUNDING RULES (v2.0.0)]",
    "Every factual claim MUST have at least one verified citation.",
    "A citation MUST include: claim, sourceId, startOffset, endOffset, quote.",
    "Offsets refer to the canonicalSourceText(raw).",
    "If any claim is unsupported, decision = REJECTED.",
    "### [VALIDATION]",
    "- Max 160 char title, 1200 char body.",
    "- 100% Monolingual.",
    memoryPrompt,
    sourceContent ? `SOURCE CONTENT:\n${canonicalSourceText(sourceContent)}` : ""
  ].join("\n");

  const userPrompt = `Title: ${flashCard.title}\nBody: ${flashCard.body}`;
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.JUDGE, { timeoutMs: trinity_JUDGE_TIMEOUT_MS });
  const raw = unifyObject(res);

  if (!raw || !raw.decision) return { processingStatus: "CHECKED" };

  // v2.0.0: Claim-Level Verification Pass
  if (raw.decision === "VERIFIED" && sourceContent) {
    const canonicalText = canonicalSourceText(sourceContent);
    const claims = raw.claims || [];
    
    for (const claim of claims) {
      for (const cit of (claim.citations || [])) {
        const actual = canonicalText.substring(cit.startOffset, cit.endOffset);
        if (actual !== cit.quote) {
          return { processingStatus: "DRAFT", userAnnotation: `[JUDGE REJECTED]: Hallucination in claim "${claim.claim}"` };
        }
      }
    }
  }

  return {
    processingStatus: raw.decision === "VERIFIED" ? "VERIFIED" : "DRAFT",
    confidenceScore: parseBoundedInt(raw.confidenceScore, 1, 10),
    evidence: { claims: raw.claims },
    userAnnotation: `[v2.0.0] [JUDGE]: ${raw.reason || "Processed."}`,
    // Provenance
    promptName: "judge-audit",
    promptVersion: "2.0.0",
    modelName: STAGE_MODELS.JUDGE[0],
    temperature: 0.1
  };
}

module.exports = {
  auditCheckedFlashCard
};
