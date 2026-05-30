import { redirect } from "next/navigation";
import { ClassScoutHome } from "@/components/classscout-home";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function ClassScoutPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/classscout`,
    requiredProfiles: "CLASSSCOUT",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <ClassScoutHome companyId={companyId} />;
}
