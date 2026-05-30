import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import CompanyAnalyticsPage from "./analytics-client";

export default async function CompanyAnalyticsPageRoute(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/analytics`,
    moduleKey: "analytics",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <CompanyAnalyticsPage companyId={companyId} />;
}
