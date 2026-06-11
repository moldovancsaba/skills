export type UiLanguage = "en" | "hu" | "es" | "ar" | "he";
export type TextDirection = "ltr" | "rtl";

export const UI_LANGUAGE_STORAGE_KEY = "checklist-ui-language";
export const UI_LANGUAGE_VALUES = ["en", "hu", "es", "ar", "he"] as const satisfies readonly UiLanguage[];
export const FALLBACK_LANGUAGE: UiLanguage = "en";
