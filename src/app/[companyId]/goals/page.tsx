import GoalsClient from "./goals-client";
import { getGoalsInitialData } from "@/lib/server-goals-page-data";

export default async function GoalsPage(
  {
    params,
  }: {
    params: Promise<{ companyId: string }>;
  },
) {
  const { companyId } = await params;
  const initialData = companyId ? await getGoalsInitialData(companyId) : null;

  return (
    <GoalsClient
      companyId={companyId}
      initialData={initialData}
    />
  );
}
