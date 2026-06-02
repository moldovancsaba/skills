export type ClassScoutRouteContract = {
  landingRoute: `/${string}/classscout`;
  reviewRoute: `/${string}/review`;
  opsRoute: `/${string}/review?tab=ops`;
  observabilityRoute: `/${string}/observability`;
  visitorOpsRoute: `/${string}/classscout/visitor-ops`;
  destinationKey: "classscout";
};

export type ClassScoutEntryPointIntent =
  | "open-app-home"
  | "open-content-ops"
  | "open-live-catalog"
  | "open-mission-control"
  | "open-visitor-ops"
  | "open-project-board";

export type ClassScoutEntryPointClassification = {
  sourceSurface: string;
  intent: ClassScoutEntryPointIntent;
  targetDestination: string;
  preservesDeepLink: boolean;
  compatibilityRedirectRequired: boolean;
  accessibleLabel: string;
};

export function resolveClassScoutRoutes(companyId: string): ClassScoutRouteContract {
  const encodedCompanyId = encodeURIComponent(companyId);
  return {
    landingRoute: `/${encodedCompanyId}/classscout`,
    reviewRoute: `/${encodedCompanyId}/review`,
    opsRoute: `/${encodedCompanyId}/review?tab=ops`,
    observabilityRoute: `/${encodedCompanyId}/observability`,
    visitorOpsRoute: `/${encodedCompanyId}/classscout/visitor-ops`,
    destinationKey: "classscout",
  };
}

export function resolveClassScoutEntryPoint(input: {
  companyId: string;
  sourceSurface: string;
  intent?: ClassScoutEntryPointIntent;
}): ClassScoutEntryPointClassification {
  const routes = resolveClassScoutRoutes(input.companyId);
  const intent = input.intent ?? "open-app-home";
  const base = {
    sourceSurface: input.sourceSurface,
    intent,
    compatibilityRedirectRequired: false,
  };

  if (intent === "open-content-ops") {
    return {
      ...base,
      targetDestination: routes.reviewRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open ClassScout review cards",
    };
  }

  if (intent === "open-live-catalog") {
    return {
      ...base,
      targetDestination: routes.opsRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open ClassScout live catalog queue",
    };
  }

  if (intent === "open-mission-control") {
    return {
      ...base,
      targetDestination: routes.observabilityRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open ClassScout mission control",
    };
  }

  if (intent === "open-visitor-ops") {
    return {
      ...base,
      targetDestination: routes.visitorOpsRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open ClassScout visitor operations",
    };
  }

  if (intent === "open-project-board") {
    return {
      ...base,
      targetDestination: `/${encodeURIComponent(input.companyId)}/unit-board?module=classscout`,
      preservesDeepLink: true,
      accessibleLabel: "Open ClassScout project board",
    };
  }

  return {
    ...base,
    targetDestination: routes.landingRoute,
    preservesDeepLink: false,
    accessibleLabel: "Open ClassScout home",
  };
}
