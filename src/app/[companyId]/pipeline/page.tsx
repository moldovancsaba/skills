import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import PipelinePage from "./pipeline-client";

export default async function PipelineRoutePage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/pipeline`,
    moduleKey: "pipeline",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <PipelinePage companyId={companyId} />;
}
