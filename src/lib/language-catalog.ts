export type LanguageDefinition = {
  id: string;
  label: string;
  nativeName: string;
  value: string;
};

export const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  { id: "zh", label: "Mandarin Chinese", nativeName: "中文 / 汉语", value: "zh" },
  { id: "en", label: "English", nativeName: "English", value: "en" },
  { id: "hi", label: "Hindi", nativeName: "हिन्दी", value: "hi" },
  { id: "es", label: "Spanish", nativeName: "Español", value: "es" },
  { id: "fr", label: "French", nativeName: "Français", value: "fr" },
  { id: "ar", label: "Modern Standard Arabic", nativeName: "العربية", value: "ar" },
  { id: "bn", label: "Bengali", nativeName: "বাংলা", value: "bn" },
  { id: "pt", label: "Portuguese", nativeName: "Português", value: "pt" },
  { id: "ru", label: "Russian", nativeName: "Русский", value: "ru" },
  { id: "ur", label: "Urdu", nativeName: "اردو", value: "ur" },
  { id: "id", label: "Indonesian", nativeName: "Bahasa Indonesia", value: "id" },
  { id: "de", label: "Standard German", nativeName: "Deutsch", value: "de" },
  { id: "ja", label: "Japanese", nativeName: "日本語", value: "ja" },
  { id: "sw", label: "Swahili", nativeName: "Kiswahili", value: "sw" },
  { id: "mr", label: "Marathi", nativeName: "मराठी", value: "mr" },
  { id: "te", label: "Telugu", nativeName: "తెలుగు", value: "te" },
  { id: "tr", label: "Turkish", nativeName: "Türkçe", value: "tr" },
  { id: "ta", label: "Tamil", nativeName: "தமிழ்", value: "ta" },
  { id: "yue", label: "Yue Chinese (Cantonese)", nativeName: "粵語", value: "yue" },
  { id: "vi", label: "Vietnamese", nativeName: "Tiếng Việt", value: "vi" },
  { id: "ko", label: "Korean", nativeName: "한국어 / 조선어", value: "ko" },
  { id: "it", label: "Italian", nativeName: "Italiano", value: "it" },
  { id: "th", label: "Thai", nativeName: "ไทย", value: "th" },
  { id: "gu", label: "Gujarati", nativeName: "ગુજરાતી", value: "gu" },
  { id: "fa", label: "Persian (Farsi)", nativeName: "فارسی", value: "fa" },
  { id: "pl", label: "Polish", nativeName: "Polski", value: "pl" },
  { id: "uk", label: "Ukrainian", nativeName: "Українська", value: "uk" },
  { id: "ml", label: "Malayalam", nativeName: "മലയാളം", value: "ml" },
  { id: "kn", label: "Kannada", nativeName: "ಕನ್ನಡ", value: "kn" },
  { id: "or", label: "Odia", nativeName: "ଓଡ଼ିଆ", value: "or" },
  { id: "pa", label: "Punjabi", nativeName: "ਪੰਜਾਬੀ", value: "pa" },
  { id: "ro", label: "Romanian", nativeName: "Română", value: "ro" },
  { id: "nl", label: "Dutch", nativeName: "Nederlands", value: "nl" },
  { id: "az", label: "Azerbaijani", nativeName: "Azərbaycan dili", value: "az" },
  { id: "ku", label: "Kurdish (Kurmanji)", nativeName: "Kurdî", value: "ku" },
  { id: "ha", label: "Hausa", nativeName: "Hausa", value: "ha" },
  { id: "my", label: "Burmese", nativeName: "မြန်မာဘာသာ", value: "my" },
  { id: "am", label: "Amharic", nativeName: "አማርኛ", value: "am" },
  { id: "yo", label: "Yoruba", nativeName: "Yorùbá", value: "yo" },
  { id: "sd", label: "Sindhi", nativeName: "سنڌي", value: "sd" },
  { id: "si", label: "Sinhala", nativeName: "සිංහල", value: "si" },
  { id: "km", label: "Khmer", nativeName: "ខ្មែរ", value: "km" },
  { id: "ne", label: "Nepali", nativeName: "नेपाली", value: "ne" },
  { id: "ps", label: "Pashto", nativeName: "پښتو", value: "ps" },
  { id: "zu", label: "Zulu", nativeName: "isiZulu", value: "zu" },
  { id: "cs", label: "Czech", nativeName: "Čeština", value: "cs" },
  { id: "hu", label: "Hungarian", nativeName: "Magyar", value: "hu" },
  { id: "el", label: "Greek", nativeName: "Ελληνικά", value: "el" },
  { id: "sv", label: "Swedish", nativeName: "Svenska", value: "sv" },
  { id: "fi", label: "Finnish", nativeName: "Suomi", value: "fi" },
];

const LANGUAGE_ALIAS_TO_ID = new Map<string, string>();

for (const language of LANGUAGE_DEFINITIONS) {
  LANGUAGE_ALIAS_TO_ID.set(language.id.toLowerCase(), language.id);
  LANGUAGE_ALIAS_TO_ID.set(language.label.toLowerCase(), language.id);
  LANGUAGE_ALIAS_TO_ID.set(language.nativeName.toLowerCase(), language.id);
}

[
  ["german", "de"],
  ["arabic", "ar"],
  ["farsi", "fa"],
  ["persian", "fa"],
  ["chinese", "zh"],
  ["mandarin", "zh"],
  ["cantonese", "yue"],
  ["hungarian", "hu"],
  ["magyar", "hu"],
  ["english", "en"],
].forEach(([alias, id]) => LANGUAGE_ALIAS_TO_ID.set(alias, id));

export function canonicalizeAllowedLanguagesForStorage(values: string[] = []): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const key = String(value || "").trim().toLowerCase();
    if (!key) continue;
    const canonical = LANGUAGE_ALIAS_TO_ID.get(key) || key;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push(canonical);
  }

  return normalized;
}

export function toHumanReadableAllowedLanguages(values: string[] = []): string[] {
  return canonicalizeAllowedLanguagesForStorage(values).map((id) => {
    const language = LANGUAGE_DEFINITIONS.find((entry) => entry.id === id);
    return language?.label || id;
  });
}
