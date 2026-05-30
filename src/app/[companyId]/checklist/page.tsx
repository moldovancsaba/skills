import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

import { ChecklistPage } from "@/components/checklist-page";

export default async function CompanyChecklistPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/checklist`,
    moduleKey: "checklist",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <ChecklistPage companyId={companyId} />;
}
