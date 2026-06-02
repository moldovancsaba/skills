export type ClassScoutRouteContract = {
  landingRoute: `/${string}/classscout`;
  reviewRoute: `/${string}/review`;
  opsRoute: `/${string}/review?tab=ops`;
  observabilityRoute: `/${string}/observability`;
  destinationKey: "classscout";
};

export function resolveClassScoutRoutes(companyId: string): ClassScoutRouteContract {
  const encodedCompanyId = encodeURIComponent(companyId);
  return {
    landingRoute: `/${encodedCompanyId}/classscout`,
    reviewRoute: `/${encodedCompanyId}/review`,
    opsRoute: `/${encodedCompanyId}/review?tab=ops`,
    observabilityRoute: `/${encodedCompanyId}/observability`,
    destinationKey: "classscout",
  };
}

