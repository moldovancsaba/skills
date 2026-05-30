import CompanyTopicsClient from "./topics-client";
import { getTopicsInitialData } from "@/lib/server-topics-page-data";
import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function CompanyTopicsPage(
  {
    params,
  }: {
    params: Promise<{ companyId: string }>;
  },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/topics`,
    moduleKey: "topics",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const initialData = companyId ? await getTopicsInitialData(companyId) : null;

  return (
    <CompanyTopicsClient
      companyId={companyId}
      initialData={initialData}
    />
  );
}
