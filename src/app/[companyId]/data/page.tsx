import CompanyDataClient from "./data-client";
import { getDataPageInitialData } from "@/lib/server-company-page-data";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import { redirect } from "next/navigation";

export default async function CompanyDataPage(
  {
    params,
  }: {
    params: Promise<{ companyId: string }>;
  },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/data`,
    moduleKey: "data",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const initialData = companyId ? await getDataPageInitialData(companyId, 12) : null;

  return (
    <CompanyDataClient
      companyId={companyId}
      initialData={initialData}
    />
  );
}
