import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import CustomerOperationsClient from "./customer-operations-client";

export default async function CustomerOperationsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/customer-operations`,
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <CustomerOperationsClient companyId={companyId} />;
}
