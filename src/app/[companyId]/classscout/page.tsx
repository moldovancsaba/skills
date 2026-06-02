import { redirect } from "next/navigation";
import { ClassScoutHome } from "@/components/classscout-home";
import { getClassScoutLandingSummary } from "@/lib/classscout-landing";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function ClassScoutPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/classscout`,
    requiredMiniapps: "classscout",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const initialSummary = await getClassScoutLandingSummary(companyId).catch(() => null);

  return <ClassScoutHome companyId={companyId} initialSummary={initialSummary} />;
}
