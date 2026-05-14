const LanguageDetect = require("languagedetect");
const detector = new LanguageDetect();

const LANGUAGE_LABELS = Object.freeze({
  zh: "Mandarin Chinese",
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  ar: "Modern Standard Arabic",
  bn: "Bengali",
  pt: "Portuguese",
  ru: "Russian",
  ur: "Urdu",
  id: "Indonesian",
  de: "Standard German",
  ja: "Japanese",
  sw: "Swahili",
  mr: "Marathi",
  te: "Telugu",
  tr: "Turkish",
  ta: "Tamil",
  yue: "Yue Chinese (Cantonese)",
  vi: "Vietnamese",
  ko: "Korean",
  it: "Italian",
  th: "Thai",
  gu: "Gujarati",
  fa: "Persian (Farsi)",
  pl: "Polish",
  uk: "Ukrainian",
  ml: "Malayalam",
  kn: "Kannada",
  or: "Odia",
  pa: "Punjabi",
  ro: "Romanian",
  nl: "Dutch",
  az: "Azerbaijani",
  ku: "Kurdish (Kurmanji)",
  ha: "Hausa",
  my: "Burmese",
  am: "Amharic",
  yo: "Yoruba",
  sd: "Sindhi",
  si: "Sinhala",
  km: "Khmer",
  ne: "Nepali",
  ps: "Pashto",
  zu: "Zulu",
  cs: "Czech",
  hu: "Hungarian",
  el: "Greek",
  sv: "Swedish",
  fi: "Finnish",
});

const STORAGE_ALIASES = Object.freeze({
  zh: "zh",
  chinese: "zh",
  mandarin: "zh",
  "mandarin chinese": "zh",
  en: "en",
  english: "en",
  hi: "hi",
  hindi: "hi",
  es: "es",
  spanish: "es",
  fr: "fr",
  french: "fr",
  ar: "ar",
  arabic: "ar",
  "modern standard arabic": "ar",
  bn: "bn",
  bengali: "bn",
  pt: "pt",
  portuguese: "pt",
  ru: "ru",
  russian: "ru",
  ur: "ur",
  urdu: "ur",
  id: "id",
  indonesian: "id",
  de: "de",
  german: "de",
  "standard german": "de",
  ja: "ja",
  japanese: "ja",
  sw: "sw",
  swahili: "sw",
  mr: "mr",
  marathi: "mr",
  te: "te",
  telugu: "te",
  tr: "tr",
  turkish: "tr",
  ta: "ta",
  tamil: "ta",
  yue: "yue",
  cantonese: "yue",
  "yue chinese (cantonese)": "yue",
  vi: "vi",
  vietnamese: "vi",
  ko: "ko",
  korean: "ko",
  it: "it",
  italian: "it",
  th: "th",
  thai: "th",
  gu: "gu",
  gujarati: "gu",
  fa: "fa",
  persian: "fa",
  farsi: "fa",
  "persian (farsi)": "fa",
  pl: "pl",
  polish: "pl",
  uk: "uk",
  ukrainian: "uk",
  ml: "ml",
  malayalam: "ml",
  kn: "kn",
  kannada: "kn",
  or: "or",
  odia: "or",
  pa: "pa",
  punjabi: "pa",
  ro: "ro",
  romanian: "ro",
  nl: "nl",
  dutch: "nl",
  az: "az",
  azerbaijani: "az",
  ku: "ku",
  kurdish: "ku",
  "kurdish (kurmanji)": "ku",
  ha: "ha",
  hausa: "ha",
  my: "my",
  burmese: "my",
  am: "am",
  amharic: "am",
  yo: "yo",
  yoruba: "yo",
  sd: "sd",
  sindhi: "sd",
  si: "si",
  sinhala: "si",
  km: "km",
  khmer: "km",
  ne: "ne",
  nepali: "ne",
  ps: "ps",
  pashto: "ps",
  zu: "zu",
  zulu: "zu",
  cs: "cs",
  czech: "cs",
  hu: "hu",
  hungarian: "hu",
  magyar: "hu",
  el: "el",
  greek: "el",
  sv: "sv",
  swedish: "sv",
  fi: "fi",
  finnish: "fi",
});

const DETECTOR_LANGUAGE_BY_CODE = Object.freeze({
  zh: "chinese",
  en: "english",
  hi: "hindi",
  es: "spanish",
  fr: "french",
  ar: "arabic",
  bn: "bengali",
  pt: "portuguese",
  ru: "russian",
  ur: "urdu",
  id: "indonesian",
  de: "german",
  ja: "japanese",
  sw: "swahili",
  mr: "marathi",
  te: "telugu",
  tr: "turkish",
  ta: "tamil",
  yue: "chinese",
  vi: "vietnamese",
  ko: "korean",
  it: "italian",
  th: "thai",
  gu: "gujarati",
  fa: "persian",
  pl: "polish",
  uk: "ukrainian",
  ml: "malayalam",
  kn: "kannada",
  or: "oriya",
  pa: "punjabi",
  ro: "romanian",
  nl: "dutch",
  az: "azerbaijani",
  ku: "kurdish",
  ha: "hausa",
  my: "burmese",
  am: "amharic",
  yo: "yoruba",
  sd: "sindhi",
  si: "sinhalese",
  km: "khmer",
  ne: "nepali",
  ps: "pashto",
  zu: "zulu",
  cs: "czech",
  hu: "hungarian",
  el: "greek",
  sv: "swedish",
  fi: "finnish",
});

function normalizeLanguageToken(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const code = STORAGE_ALIASES[normalized];
  if (code) {
    return DETECTOR_LANGUAGE_BY_CODE[code] || normalized;
  }
  return normalized;
}

function canonicalizeAllowedLanguages(allowedLanguages = []) {
  const seen = new Set();
  return allowedLanguages
    .map((value) => {
      const normalized = String(value || "").trim().toLowerCase();
      return STORAGE_ALIASES[normalized] || normalized;
    })
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function normalizeAllowedLanguages(allowedLanguages = []) {
  return canonicalizeAllowedLanguages(allowedLanguages)
    .map((value) => DETECTOR_LANGUAGE_BY_CODE[value] || normalizeLanguageToken(value))
    .filter(Boolean);
}

function humanReadableAllowedLanguages(allowedLanguages = []) {
  return canonicalizeAllowedLanguages(allowedLanguages).map((value) => LANGUAGE_LABELS[value] || value);
}

function uniqueLanguageLabels(allowedLanguages = []) {
  return [...new Set(humanReadableAllowedLanguages(allowedLanguages).filter(Boolean))];
}

function getLanguagePolicyPrompt(allowedLanguages = []) {
  const labels = uniqueLanguageLabels(allowedLanguages);
  if (labels.length === 0) {
    return "No explicit language policy is set.";
  }

  if (labels.length === 1) {
    return `Output must be written entirely in ${labels[0]}. Translate the full card into ${labels[0]} whenever the source material is in another language. Never leave English titles, section labels, or mixed-language phrasing unless the term is an official brand, product, or legal name.`;
  }

  return `Output must be written entirely in exactly one of these permitted languages: ${labels.join(", ")}. Do not mix languages inside a single card.`;
}

/**
 * Validates if the given text matches the company's allowed languages.
 * 
 * @param {string} text - The content to validate.
 * @param {string[]} allowedLanguages - List of allowed languages (e.g. ["english", "hungarian"]).
 * @returns {boolean} True if text matches an allowed language or detection is low confidence.
 */
function isLanguageAccepted(text, allowedLanguages) {
  if (!text || !allowedLanguages || allowedLanguages.length === 0) return true;
  const normalizedAllowed = normalizeAllowedLanguages(allowedLanguages);

  const normalizedText = String(text).trim();
  const alphaChars = (normalizedText.match(/\p{L}/gu) || []).length;
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length;
  if (alphaChars < 24 || wordCount < 4) return true;
  if (wordCount < 12 && !/[.!?]/.test(normalizedText)) return true;
  if (
    normalizedAllowed.length === 1 &&
    normalizedAllowed[0] === "english" &&
    /^[\p{Script=Latin}\p{N}\s.,:;!?'"/()&+%#@_=\-\u2192]+$/u.test(normalizedText)
  ) {
    return true;
  }

  const results = detector.detect(normalizedText, 3); // Get top 3
  if (results.length === 0) return true; // Can't detect, allow for now

  const topMatch = normalizeLanguageToken(results[0][0]);
  const topScore = results[0][1];

  if (results.some(([language]) => normalizedAllowed.includes(normalizeLanguageToken(language)))) {
    return true;
  }

  // If score is very low (< 0.2), allow it as it might be technical content or mixed
  if (topScore < 0.2) return true;

  return false;
}

/**
 * Enforces the language policy by deleting the record if it fails validation.
 * 
 * @param {object} prisma - Prisma client
 * @param {object} record - The Flashcard or ChecklistTask record
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
      await prisma.checklistTask.delete({ where: { id: record.id } });
    }
    return true; // Deleted
  }
  return false;
}

module.exports = {
  isLanguageAccepted,
  enforceLanguagePolicy,
  canonicalizeAllowedLanguages,
  normalizeAllowedLanguages,
  humanReadableAllowedLanguages,
  getLanguagePolicyPrompt,
};
