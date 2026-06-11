export type AthleteIQRouteContract = {
  landingRoute: `/${string}/athleteiq`;
  reviewRoute: `/${string}/review`;
  opsRoute: `/${string}/review?tab=ops`;
  observabilityRoute: `/${string}/observability`;
  visitorOpsRoute: `/${string}/athleteiq/visitor-ops`;
  destinationKey: "athleteiq";
};

export type AthleteIQEntryPointIntent =
  | "open-app-home"
  | "open-content-ops"
  | "open-live-catalog"
  | "open-mission-control"
  | "open-visitor-ops"
  | "open-project-board";

export type AthleteIQEntryPointClassification = {
  sourceSurface: string;
  intent: AthleteIQEntryPointIntent;
  targetDestination: string;
  preservesDeepLink: boolean;
  compatibilityRedirectRequired: boolean;
  accessibleLabel: string;
};

export function resolveAthleteIQRoutes(companyId: string): AthleteIQRouteContract {
  const encodedCompanyId = encodeURIComponent(companyId);
  return {
    landingRoute: `/${encodedCompanyId}/athleteiq`,
    reviewRoute: `/${encodedCompanyId}/review`,
    opsRoute: `/${encodedCompanyId}/review?tab=ops`,
    observabilityRoute: `/${encodedCompanyId}/observability`,
    visitorOpsRoute: `/${encodedCompanyId}/athleteiq/visitor-ops`,
    destinationKey: "athleteiq",
  };
}

export function resolveAthleteIQEntryPoint(input: {
  companyId: string;
  sourceSurface: string;
  intent?: AthleteIQEntryPointIntent;
}): AthleteIQEntryPointClassification {
  const routes = resolveAthleteIQRoutes(input.companyId);
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
      accessibleLabel: "Open AthleteIQ review cards",
    };
  }

  if (intent === "open-live-catalog") {
    return {
      ...base,
      targetDestination: routes.opsRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open AthleteIQ live catalog queue",
    };
  }

  if (intent === "open-mission-control") {
    return {
      ...base,
      targetDestination: routes.observabilityRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open AthleteIQ mission control",
    };
  }

  if (intent === "open-visitor-ops") {
    return {
      ...base,
      targetDestination: routes.visitorOpsRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open AthleteIQ visitor operations",
    };
  }

  if (intent === "open-project-board") {
    return {
      ...base,
      targetDestination: `/${encodeURIComponent(input.companyId)}/unit-board?module=athleteiq`,
      preservesDeepLink: true,
      accessibleLabel: "Open AthleteIQ project board",
    };
  }

  return {
    ...base,
    targetDestination: routes.landingRoute,
    preservesDeepLink: false,
    accessibleLabel: "Open AthleteIQ home",
  };
}
