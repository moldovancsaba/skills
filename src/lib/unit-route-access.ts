import { cookies } from "next/headers";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getWebappRoute,
  resolveUnitCapabilities,
  type UnitModuleKey,
  type UnitWebappProfile,
} from "@/lib/intelligence-unit-capabilities";

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
  webappRoute: string | null;
};

type UnitRouteAccessState = UnitRouteAccessContext | UnitRouteAccessError;

function normalizeProfileFilter(input: UnitWebappProfile | UnitWebappProfile[]) {
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
}: {
  companyId: string;
  requestPath: string;
  moduleKey?: UnitModuleKey;
  requiredProfiles?: UnitWebappProfile[] | UnitWebappProfile;
}): Promise<UnitRouteAccessState> {
  const requestedProfiles = normalizeProfileFilter(requiredProfiles);

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

  const [company, classScoutInstance, compareInstance] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, workerConfig: true },
    }),
    prisma.destinationInstance.findFirst({
      where: {
        companyId,
        destinationKey: "classscout",
        isActive: true,
      },
      select: { id: true },
    }),
    prisma.destinationInstance.findFirst({
      where: {
        companyId,
        destinationKey: "compare",
        isActive: true,
      },
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
    hasClassScoutDestination: Boolean(classScoutInstance),
    hasCompareDestination: Boolean(compareInstance),
  });

  if (moduleKey && capabilities.modules[moduleKey] === false) {
    return {
      allowed: false,
      redirectTo: `/${companyId}`,
    };
  }

  if (!isAuthorizedProfile(capabilities.profile, requestedProfiles)) {
    return {
      allowed: false,
      redirectTo: resolveProfileFallback(companyId, capabilities.profile) ?? `/${companyId}`,
    };
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
    webappRoute: getWebappRoute(capabilities.profile),
  };
}
