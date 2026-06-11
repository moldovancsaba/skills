import type { TextDirection, UiLanguage } from "@/lib/ui-language-config";

// Verified by scripts/test-gds-runtime-provider.mjs against @doneisbetter/gds locale metadata.
export const GDS_LOCALE_DIRECTION_MAP = {
  en: "ltr",
  hu: "ltr",
  es: "ltr",
  ar: "rtl",
  he: "rtl",
} as const satisfies Record<UiLanguage, TextDirection>;
