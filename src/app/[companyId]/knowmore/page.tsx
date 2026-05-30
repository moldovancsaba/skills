import KnowmoreClient from "./knowmore-client";
import { getKnowmoreInitialData } from "@/lib/server-knowmore-page-data";
import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function CompanyKnowmorePage(
  {
    params,
    searchParams,
  }: {
    params: Promise<{ companyId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/knowmore`,
    moduleKey: "knowmore",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const resolvedSearchParams = await searchParams;
  const initialData = companyId
    ? await getKnowmoreInitialData(companyId, {
        pageSize: 12,
        searchParams: resolvedSearchParams,
      })
    : null;

  return (
    <KnowmoreClient
      companyId={companyId}
      initialData={initialData}
    />
  );
}
