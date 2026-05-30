import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import TacticalPage from "./tactical-client";

export default async function TacticalRoutePage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/tactical`,
    moduleKey: "tactical",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <TacticalPage companyId={companyId} />;
}
