import { UnitProjectBoardClient } from "./unit-project-board-client";
import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function UnitProjectBoardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/unit-board`,
    moduleKey: "unit-board",
  });
  if (!access.allowed) {
    redirect(access.redirectTo);
  }
  return <UnitProjectBoardClient key={`${companyId}-unit-board`} companyId={companyId} boardModule="unit-board" />;
}
