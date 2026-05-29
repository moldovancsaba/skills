import { UnitProjectBoardClient } from "./unit-project-board-client";

export default async function UnitProjectBoardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return <UnitProjectBoardClient key={companyId} companyId={companyId} />;
}
