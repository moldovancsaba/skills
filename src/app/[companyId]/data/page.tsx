import CompanyDataClient from "./data-client";
import { getDataPageInitialData } from "@/lib/server-company-page-data";

export default async function CompanyDataPage(
  {
    params,
  }: {
    params: Promise<{ companyId: string }>;
  },
) {
  const { companyId } = await params;
  const initialData = companyId ? await getDataPageInitialData(companyId, 12) : null;

  return (
    <CompanyDataClient
      companyId={companyId}
      initialData={initialData}
    />
  );
}
