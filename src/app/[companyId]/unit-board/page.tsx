import { UnitProjectBoardClient } from "./unit-project-board-client";
import { redirect } from "next/navigation";
import { requireUnitRouteAccess } from "@/lib/unit-route-access";

export default async function UnitProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : null;
  const moduleFromRoute = (() => {
    const raw = resolvedSearchParams?.module;
    if (Array.isArray(raw)) {
      return raw[0];
    }
    return raw;
  })();
  const normalizedModuleFromRoute = typeof moduleFromRoute === "string"
    ? moduleFromRoute.trim().toLowerCase()
    : undefined;
  const allowedModules = new Set(["unit-board", "unitBoard", "unit", "compare", "classscout", "project-board", "goals", "topics", "data", "pipeline"]);
  const boardModule = normalizedModuleFromRoute && allowedModules.has(normalizedModuleFromRoute)
    ? normalizedModuleFromRoute
    : "unit-board";

  const access = await requireUnitRouteAccess({
    companyId,
    requestPath: `/${companyId}/unit-board`,
    moduleKey: "unit-board",
  });
  if (!access.allowed) {
    redirect(access.redirectTo);
  }
  return <UnitProjectBoardClient key={`${companyId}-${boardModule}`} companyId={companyId} boardModule={boardModule} />;
}
