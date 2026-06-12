import { cookies } from "next/headers";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getWebappRoute,
  resolveUnitCapabilities,
  type UnitModuleKey,
  type UnitWebappProfile,
} from "@/lib/intelligence-unit-capabilities";
import { resolveEffectiveUnitCapabilities, type ModuleKey, type BlockKey } from "@/lib/check-foundation";

export type UnitRouteAccessError = {
  allowed: false;
  redirectTo: string;
};

export type UnitRouteAccessContext = {
  allowed: true;
  companyId: string;
  membership: {
    id: string;
    email: string;
    name: string | null;
    role: "OWNER" | "ADMIN" | "MEMBER" | "SUPERADMIN";
    companyId: string;
  };
  profile: UnitWebappProfile;
  modules: Record<UnitModuleKey, boolean>;
  enabledBlocks: BlockKey[];
  enabledModules: ModuleKey[];
  enabledMiniapps: string[];
  webappRoute: string | null;
};

type UnitRouteAccessState = UnitRouteAccessContext | UnitRouteAccessError;

const LEGACY_MODULE_TO_CANONICAL: Partial<Record<UnitModuleKey, ModuleKey>> = {
  content: "miniapp",
  data: "data",
  checklist: "checklist",
  analytics: "analytics",
  goals: "goals",
  knowmore: "knowmore",
  pipeline: "aiQueue",
  review: "review",
  sales: "sales",
  tactical: "tactical",
  topics: "topics",
  "unit-board": "project",
};

function normalizeProfileFilter(input: UnitWebappProfile | UnitWebappProfile[]) {
  return Array.isArray(input) ? input : [input];
}

function normalizeMiniappFilter(input: string | string[]) {
  return Array.isArray(input) ? input : [input];
}

function isAuthorizedProfile(profile: UnitWebappProfile, allowed: UnitWebappProfile[]) {
  return allowed.length === 0 || allowed.includes(profile);
}

function resolveProfileFallback(companyId: string, profile: UnitWebappProfile): string | null {
  const fallbackRoute = getWebappRoute(profile);
  if (!fallbackRoute) return `/${companyId}`;
  return `/${companyId}/${fallbackRoute}`;
}

export async function requireUnitRouteAccess({
  companyId,
  requestPath,
  moduleKey,
  requiredProfiles = [],
  requiredMiniapps = [],
}: {
  companyId: string;
  requestPath: string;
  moduleKey?: UnitModuleKey;
  requiredProfiles?: UnitWebappProfile[] | UnitWebappProfile;
  requiredMiniapps?: string[] | string;
}): Promise<UnitRouteAccessState> {
  const requestedProfiles = normalizeProfileFilter(requiredProfiles);
  const requestedMiniapps = normalizeMiniappFilter(requiredMiniapps).filter(Boolean);

  if (!companyId) {
    return {
      allowed: false,
      redirectTo: "/login",
    };
  }

  const sessionCookie = (await cookies()).get(APP_SESSION_COOKIE)?.value;
  const session = readAppSessionToken(sessionCookie);
  if (!session) {
    return {
      allowed: false,
      redirectTo: `/login?returnTo=${encodeURIComponent(requestPath)}`,
    };
  }

  const membership = await prisma.user.findFirst({
    where: {
      email: session.email.trim().toLowerCase(),
      companyId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
    },
  });

  if (!membership) {
    return {
      allowed: false,
      redirectTo: "/",
    };
  }

  const [company, compareInstance, trainersInstance, athleteiqInstance] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, workerConfig: true },
    }),
    prisma.destinationInstance.findFirst({
      where: {
        companyId,
        destinationKey: "compare",
        isActive: true,
      },
      select: { id: true },
    }),
    prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey: "trainers", isActive: true },
      select: { id: true },
    }),
    prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey: "athleteiq", isActive: true },
      select: { id: true },
    }),
  ]);

  if (!company) {
    return {
      allowed: false,
      redirectTo: "/",
    };
  }

  const capabilities = resolveUnitCapabilities({
    workerConfig: company.workerConfig,
    hasCompareDestination: Boolean(compareInstance),
    hasTrainersDestination: Boolean(trainersInstance),
    hasAthleteIQDestination: Boolean(athleteiqInstance),
  });
  const effectiveCapabilities = resolveEffectiveUnitCapabilities({
    workerConfig: company.workerConfig,
    hasCompareDestination: Boolean(compareInstance),
    hasTrainersDestination: Boolean(trainersInstance),
    hasAthleteIQDestination: Boolean(athleteiqInstance),
  });

  if (moduleKey && capabilities.modules[moduleKey] === false) {
    return {
      allowed: false,
      redirectTo: `/${companyId}`,
    };
  }
  if (moduleKey) {
    const canonicalModule = LEGACY_MODULE_TO_CANONICAL[moduleKey];
    if (canonicalModule && !effectiveCapabilities.enabledModules.includes(canonicalModule)) {
      return {
        allowed: false,
        redirectTo: `/${companyId}`,
      };
    }
  }

  if (!isAuthorizedProfile(capabilities.profile, requestedProfiles)) {
    return {
      allowed: false,
      redirectTo: resolveProfileFallback(companyId, capabilities.profile) ?? `/${companyId}`,
    };
  }
  if (requestedMiniapps.length > 0) {
    const enabledMiniapps = new Set(effectiveCapabilities.enabledMiniapps);
    const hasRequiredMiniapp = requestedMiniapps.some((miniappId) => enabledMiniapps.has(miniappId));
    if (!hasRequiredMiniapp) {
      return {
        allowed: false,
        redirectTo: `/${companyId}`,
      };
    }
  }

  return {
    allowed: true,
    companyId,
    membership: {
      ...membership,
      name: membership.name,
      role: membership.role,
    },
    profile: capabilities.profile,
    modules: capabilities.modules,
    enabledBlocks: effectiveCapabilities.enabledBlocks,
    enabledModules: effectiveCapabilities.enabledModules,
    enabledMiniapps: effectiveCapabilities.enabledMiniapps,
    webappRoute: getWebappRoute(capabilities.profile),
  };
}
