import { CompareHome } from "@/components/compare-home";
import { getDashboardInitialData } from "@/lib/server-company-page-data";

export default async function ComparePage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const initialData = await getDashboardInitialData(companyId);

  return <CompareHome companyId={companyId} modules={initialData?.unitModules ?? {}} />;
}
