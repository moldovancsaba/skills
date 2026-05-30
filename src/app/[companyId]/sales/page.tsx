import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import SalesPage from "./sales-client";

export default async function SalesRoutePage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/sales`,
    moduleKey: "sales",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <SalesPage companyId={companyId} />;
}
