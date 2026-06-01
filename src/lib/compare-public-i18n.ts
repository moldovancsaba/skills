import comparePublicCopy from "@/config/compare-public-copy.json";
import { patchCompareSite } from "@/lib/destination-compare";
import { getMiniappDefinition } from "@/lib/check-foundation/miniapp-registry";

export type ComparePublicCopyLocale = "en" | "hu" | "it";

export const COMPARE_PUBLIC_COPY = comparePublicCopy as Record<ComparePublicCopyLocale, Record<string, string>>;

export function buildComparePublicI18nPatch(now = new Date()) {
  const miniapp = getMiniappDefinition("compare");
  return {
    publicCopy: COMPARE_PUBLIC_COPY,
    publicLocales: miniapp.availableLocales,
    publicDefaultLocale: miniapp.defaultLocale,
    publicCopyMaintainedAt: now.toISOString(),
    publicCopyMaintainedBy: "CHECK Local compare-public-i18n-steward",
    guides: [],
    locationHeroImages: [],
    homeHeroUrl: "",
    discoverHeroUrl: "",
  };
}

export async function syncComparePublicI18n() {
  return patchCompareSite({
    patch: buildComparePublicI18nPatch(),
  });
}
