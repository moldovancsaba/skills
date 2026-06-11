import { redirect } from "next/navigation";
import { TrainersHome } from "@/components/trainers-home";
import { getTrainersLandingSummary } from "@/lib/trainers-landing";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function TrainersPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/trainers`,
    requiredMiniapps: "trainers",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  const initialSummary = await getTrainersLandingSummary(companyId).catch(() => null);

  return <TrainersHome companyId={companyId} initialSummary={initialSummary} />;
}
