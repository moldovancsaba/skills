import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import { getDashboardInitialData } from "@/lib/server-company-page-data";
import { resolveFirstSupportedDestinationKey } from "@/lib/destination-scope";
import ReviewPage from "./review-client";

export default async function ReviewRoutePage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/review`,
    moduleKey: "review",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const initialData = await getDashboardInitialData(companyId);
  const enabledMiniapps = Array.isArray(initialData?.enabledMiniapps) ? initialData.enabledMiniapps : [];
  const firstEnabledMiniapp = resolveFirstSupportedDestinationKey(enabledMiniapps);
  const initialDestinationKey = firstEnabledMiniapp ?? "compare";

  return <ReviewPage companyId={companyId} initialDestinationKey={initialDestinationKey} />;
}
