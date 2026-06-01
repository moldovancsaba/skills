import { CompareHome } from "@/components/compare-home";
import { getDashboardInitialData } from "@/lib/server-company-page-data";
import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function ComparePage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/compare`,
    requiredMiniapps: "compare",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const initialData = await getDashboardInitialData(companyId);

  return <CompareHome companyId={companyId} modules={initialData?.unitModules ?? {}} />;
}
