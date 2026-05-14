import { redirect } from "next/navigation";

export default async function LegacyChecklistRouteRedirect({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  redirect(`/${companyId}/checklist`);
}
