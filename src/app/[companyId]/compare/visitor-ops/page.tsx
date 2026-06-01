import { VisitorOpsWorkspace } from "@/components/visitor-ops-workspace";
import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function CompareVisitorOpsPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/compare/visitor-ops`,
    requiredMiniapps: "compare",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <VisitorOpsWorkspace companyId={companyId} defaultVisitorKey="compare" />;
}
