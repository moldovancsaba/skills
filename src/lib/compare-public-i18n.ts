import { patchCompareSite } from "@/lib/destination-compare";
import { buildComparePublicI18nPatch } from "@/lib/compare-public-config";

export async function syncComparePublicI18n(companyId: string, now = new Date()) {
  const patch = await buildComparePublicI18nPatch(companyId, now);
  return patchCompareSite({
    patch,
  });
}
