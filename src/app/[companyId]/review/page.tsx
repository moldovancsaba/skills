import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";
import ReviewPage from "./review-client";

export default async function ReviewRoutePage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/review`,
    moduleKey: "review",
  });

  if (!access.allowed) {
    redirect(access.redirectTo);
  }

  return <ReviewPage companyId={companyId} />;
}
