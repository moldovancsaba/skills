import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/permissions";
import { type ProjectionFreshness } from "@/lib/webapp-projection";
import { buildCompanyReadModel } from "@/lib/company-read-model";

type HomeInitialCompany = {
  id: string;
  name: string;
  industry: string | null;
  industries: string[];
  metrics: {
    data: number;
    topics: number;
    knowmore: number;
    goals: number;
    review: number;
    checklist: number;
    tactical: number;
  };
  projection: {
    available: boolean;
    freshness: ProjectionFreshness;
    generatedAt: string | null;
  };
  charts: {
    data: Array<{ date: string; value: number }>;
    topics: Array<{ date: string; value: number }>;
    goals: Array<{ date: string; value: number }>;
    review: Array<{ date: string; value: number }>;
    knowmore: Array<{ date: string; value: number }>;
    tactical: Array<{ date: string; value: number }>;
    checklist: Array<{ date: string; value: number }>;
  };
};

export type HomeInitialSession = {
  authenticated: boolean;
  id: string;
  email: string;
  name: string;
  picture?: string;
  isSuperAdmin: boolean;
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string;
    isSuperAdmin: boolean;
  };
} | null;

export type HomeInitialData = {
  companies: HomeInitialCompany[];
  suggestedIndustries: string[];
  session: HomeInitialSession;
};

function normalizeLegacyIndustry(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized.startsWith("#")
    ? normalized.toLowerCase()
    : `#${normalized.toLowerCase().replace(/\s+/g, "-")}`;
}

export async function getHomeInitialData(): Promise<HomeInitialData> {
  const cookieStore = await cookies();
  const session = readAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) {
    return {
      companies: [],
      suggestedIndustries: [],
      session: null,
    };
  }

  const [companies, isSuperAdmin] = await Promise.all([
    prisma.company.findMany({
      where: {
        users: {
          some: {
            email: session.email.trim().toLowerCase(),
          },
        },
      },
      select: {
        id: true,
        name: true,
        industries: true,
        industry: true,
        intelligenceSnapshot: {
          select: {
            webappProjection: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    isSuperAdminEmail(session.email),
  ]);

  const industrySuggestions = new Set([
    "#saas",
    "#ecommerce",
    "#healthcare",
    "#finance",
    "#education",
    "#retail",
    "#technology",
    "#manufacturing",
  ]);

  const normalizedCompanies: HomeInitialCompany[] = companies.map((company) => {
    const readModel = buildCompanyReadModel(company.intelligenceSnapshot);

    for (const tag of company.industries || []) {
      if (tag) industrySuggestions.add(tag);
    }
    const legacyTag = normalizeLegacyIndustry(company.industry);
    if (legacyTag) industrySuggestions.add(legacyTag);

    return {
      id: company.id,
      name: company.name,
      industry: company.industry,
      industries: company.industries?.length
        ? company.industries
        : legacyTag
          ? [legacyTag]
          : [],
      metrics: {
        data: Number(readModel.navCounts.data ?? 0),
        topics: Number(readModel.navCounts.topics ?? 0),
        knowmore: Number(readModel.navCounts.knowmore ?? 0),
        goals: Number(readModel.navCounts.goals ?? 0),
        review: Number(readModel.navCounts.review ?? 0),
        checklist: Number(readModel.navCounts.checklist ?? 0),
        tactical: Number(readModel.navCounts.tactical ?? 0),
      },
      projection: {
        available: Boolean(readModel.projection),
        freshness: readModel.projectionFreshness,
        generatedAt: readModel.projection?.generatedAt ?? null,
      },
      charts: readModel.projection?.homeCharts ?? {
        data: [],
        topics: [],
        goals: [],
        review: [],
        knowmore: [],
        tactical: [],
        checklist: [],
      },
    };
  });

  return {
    companies: normalizedCompanies,
    suggestedIndustries: Array.from(industrySuggestions).sort(),
    session: {
      authenticated: true,
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      isSuperAdmin,
      user: {
        id: session.sub,
        email: session.email,
        name: session.name,
        picture: session.picture,
        isSuperAdmin,
      },
    },
  };
}
