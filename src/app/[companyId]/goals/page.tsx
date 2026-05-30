import GoalsClient from "./goals-client";
import { getGoalsInitialData } from "@/lib/server-goals-page-data";
import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function GoalsPage(
  {
    params,
  }: {
    params: Promise<{ companyId: string }>;
  },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/goals`,
    moduleKey: "goals",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const initialData = companyId ? await getGoalsInitialData(companyId) : null;

  return (
    <GoalsClient
      companyId={companyId}
      initialData={initialData}
    />
  );
}
