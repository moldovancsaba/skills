const LanguageDetect = require("languagedetect");
const detector = new LanguageDetect();

/**
 * Validates if the given text matches the company's allowed languages.
 * 
 * @param {string} text - The content to validate.
 * @param {string[]} allowedLanguages - List of allowed languages (e.g. ["english", "hungarian"]).
 * @returns {boolean} True if text matches an allowed language or detection is low confidence.
 */
function isLanguageAccepted(text, allowedLanguages) {
  if (!text || !allowedLanguages || allowedLanguages.length === 0) return true;

  const results = detector.detect(text, 2); // Get top 2
  if (results.length === 0) return true; // Can't detect, allow for now

  const topMatch = results[0][0].toLowerCase();
  const topScore = results[0][1];

  // Normalize allowed list to lowercase for robust matching
  const normalizedAllowed = allowedLanguages.map(l => l.toLowerCase());

  // If top match is in allowed list, it's good
  if (normalizedAllowed.includes(topMatch)) return true;

  // If score is very low (< 0.2), allow it as it might be technical content or mixed
  if (topScore < 0.2) return true;

  return false;
}

/**
 * Enforces the language policy by deleting the record if it fails validation.
 * 
 * @param {object} prisma - Prisma client
 * @param {object} record - The Flashcard or NBAItem record
 * @param {string} type - "FLASHCARD" or "TASK"
 * @param {object} company - The Company record
 */
async function enforceLanguagePolicy(prisma, record, type, company) {
  const content = record.title + " " + (record.body || record.description || "");
  const allowed = company.allowedLanguages || [];
  
  if (allowed.length === 0) return; // No policy set

  if (!isLanguageAccepted(content, allowed)) {
    console.warn(`[POLICY] [${type}] Deleting card ${record.id} due to language violation. Allowed: ${allowed.join(", ")}, Detected: ${detector.detect(content, 1)[0]?.[0]}`);
    
    if (type === "FLASHCARD") {
      await prisma.flashcard.delete({ where: { id: record.id } });
    } else {
      await prisma.nBAItem.delete({ where: { id: record.id } });
    }
    return true; // Deleted
  }
  return false;
}

module.exports = {
  isLanguageAccepted,
  enforceLanguagePolicy
};
