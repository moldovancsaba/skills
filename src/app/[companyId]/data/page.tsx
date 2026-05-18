import { redirect } from "next/navigation";
import CompanyDataClient from "./data-client";
import { getDataPageInitialData } from "@/lib/server-company-page-data";

export default async function CompanyDataPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const initialData = await getDataPageInitialData(companyId);

  if (!initialData) {
    redirect("/");
  }

  return <CompanyDataClient companyId={companyId} initialData={initialData} />;
}
