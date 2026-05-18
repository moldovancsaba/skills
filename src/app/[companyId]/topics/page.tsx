import CompanyTopicsClient from "./topics-client";
import { getTopicsInitialData } from "@/lib/server-topics-page-data";

export default async function CompanyTopicsPage(
  {
    params,
  }: {
    params: Promise<{ companyId: string }>;
  },
) {
  const { companyId } = await params;
  const initialData = companyId ? await getTopicsInitialData(companyId) : null;

  return (
    <CompanyTopicsClient
      companyId={companyId}
      initialData={initialData}
    />
  );
}
