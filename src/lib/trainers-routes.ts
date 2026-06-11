export type TrainersRouteContract = {
  landingRoute: `/${string}/trainers`;
  reviewRoute: `/${string}/review`;
  opsRoute: `/${string}/review?tab=ops`;
  observabilityRoute: `/${string}/observability`;
  visitorOpsRoute: `/${string}/trainers/visitor-ops`;
  destinationKey: "trainers";
};

export type TrainersEntryPointIntent =
  | "open-app-home"
  | "open-content-ops"
  | "open-live-catalog"
  | "open-mission-control"
  | "open-visitor-ops"
  | "open-project-board";

export type TrainersEntryPointClassification = {
  sourceSurface: string;
  intent: TrainersEntryPointIntent;
  targetDestination: string;
  preservesDeepLink: boolean;
  compatibilityRedirectRequired: boolean;
  accessibleLabel: string;
};

export function resolveTrainersRoutes(companyId: string): TrainersRouteContract {
  const encodedCompanyId = encodeURIComponent(companyId);
  return {
    landingRoute: `/${encodedCompanyId}/trainers`,
    reviewRoute: `/${encodedCompanyId}/review`,
    opsRoute: `/${encodedCompanyId}/review?tab=ops`,
    observabilityRoute: `/${encodedCompanyId}/observability`,
    visitorOpsRoute: `/${encodedCompanyId}/trainers/visitor-ops`,
    destinationKey: "trainers",
  };
}

export function resolveTrainersEntryPoint(input: {
  companyId: string;
  sourceSurface: string;
  intent?: TrainersEntryPointIntent;
}): TrainersEntryPointClassification {
  const routes = resolveTrainersRoutes(input.companyId);
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
      accessibleLabel: "Open Trainers review cards",
    };
  }

  if (intent === "open-live-catalog") {
    return {
      ...base,
      targetDestination: routes.opsRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open Trainers live catalog queue",
    };
  }

  if (intent === "open-mission-control") {
    return {
      ...base,
      targetDestination: routes.observabilityRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open Trainers mission control",
    };
  }

  if (intent === "open-visitor-ops") {
    return {
      ...base,
      targetDestination: routes.visitorOpsRoute,
      preservesDeepLink: true,
      accessibleLabel: "Open Trainers visitor operations",
    };
  }

  if (intent === "open-project-board") {
    return {
      ...base,
      targetDestination: `/${encodeURIComponent(input.companyId)}/unit-board?module=trainers`,
      preservesDeepLink: true,
      accessibleLabel: "Open Trainers project board",
    };
  }

  return {
    ...base,
    targetDestination: routes.landingRoute,
    preservesDeepLink: false,
    accessibleLabel: "Open Trainers home",
  };
}
