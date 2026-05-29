import { ClassScoutHome } from "@/components/classscout-home";

export default async function ClassScoutPage(
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;

  return <ClassScoutHome companyId={companyId} />;
}
