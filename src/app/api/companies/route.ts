import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";
import { verifyMembership, verifySuperAdmin } from "@/lib/permissions";
import { normalizeIndustryHashtags } from "@/lib/hashtags";
import { validateCompanyProfile } from "@/lib/profile-validation";
import { buildCompanyReadModel } from "@/lib/company-read-model";
import { createRequestProfiler } from "@/lib/request-profile";
import { provisionCompany } from "@/lib/check-lifecycle/provisioning-engine";
import { resolveEffectiveUnitCapabilities } from "@/lib/check-foundation";
import { deleteUnitData } from "@/lib/unit-crud";

export const dynamic = 'force-dynamic';

const COMPANY_MAIN_GOALS = [
  "GROW_REVENUE",
  "LAUNCH_PRODUCT",
  "ENTER_NEW_MARKET",
  "BUILD_AWARENESS",
  "GENERATE_LEADS",
] as const;

type CompanyMainGoal = (typeof COMPANY_MAIN_GOALS)[number];

function isCompanyMainGoal(value: unknown): value is CompanyMainGoal {
  return typeof value === "string" && COMPANY_MAIN_GOALS.includes(value as CompanyMainGoal);
}

export async function GET(request: NextRequest) {
  const profiler = createRequestProfiler(request, "companies-list");
  try {
    const session = await profiler.measure("readAppSession", () => readAppSession(request));
    if (!session) {
      return profiler.apply(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }

    const companies = await profiler.measure("listCompanies", () => prisma.company.findMany({
      where: {
        users: {
          some: {
            email: session.email.trim().toLowerCase()
          }
        }
      },
      select: {
        id: true,
        name: true,
        industry: true,
        industries: true,
        description: true,
        targetMarket: true,
        mainGoal: true,
        workerConfig: true,
        intelligenceSnapshot: {
          select: {
            webappProjection: true,
          },
        },
        destinationInstances: {
          where: {
            isActive: true,
            destinationKey: { in: ["compare", "trainers", "athleteiq"] },
          },
          select: {
            destinationKey: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }));

    const enrichedCompanies = companies.map((company) => {
      const snapshot = company.intelligenceSnapshot;
      const readModel = buildCompanyReadModel(snapshot);
      const destinationKeys = new Set(company.destinationInstances.map((instance) => instance.destinationKey));
      const effectiveCapabilities = resolveEffectiveUnitCapabilities({
        workerConfig: company.workerConfig,
        hasCompareDestination: destinationKeys.has("compare"),
        hasTrainersDestination: destinationKeys.has("trainers"),
        hasAthleteIQDestination: destinationKeys.has("athleteiq"),
      });
      return {
        ...company,
        metrics: {
          data: Number(readModel.navCounts.data ?? 0),
          topics: Number(readModel.navCounts.topics ?? 0),
          knowmore: Number(readModel.navCounts.knowmore ?? 0),
          goals: Number(readModel.navCounts.goals ?? 0),
          sales: Number(readModel.navCounts.sales ?? 0),
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
        enabledModules: effectiveCapabilities.enabledModules,
        enabledBlocks: effectiveCapabilities.enabledBlocks,
        enabledMiniapps: effectiveCapabilities.enabledMiniapps,
      };
    });

    const response = NextResponse.json(
      profiler.enabled
        ? { companies: enrichedCompanies, profile: profiler.getSummary() }
        : enrichedCompanies,
    );
    return profiler.apply(response);
  } catch (error) {
    return profiler.apply(NextResponse.json({ error: String(error) }, { status: 500 }));
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;
    const { session } = auth;

    const dataRaw = await request.json().catch(() => ({}));
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = dataRaw as Record<string, any>;
    
    // Validate Profile
    const v = validateCompanyProfile(data);
    if (!v.valid) {
      return NextResponse.json({ error: "Validation failed", details: v.errors }, { status: 400 });
    }

    const industries = normalizeIndustryHashtags(data.industries || (data.industry ? [data.industry] : []));
    
    const createData: Prisma.CompanyCreateInput = {
      name: data.name,
      industry: industries[0] || null,
      industries,
      description: data.description || null,
      targetMarket: data.targetMarket || null,
      website: data.website || null,
      businessModel: data.businessModel || null,
      productCategories: data.productCategories || [],
      demographics: data.demographics || {},
      competitors: data.competitors || [],
      users: {
        create: {
          email: session.email,
          name: session.name,
          role: "OWNER"
        }
      }
    };
    
    if (isCompanyMainGoal(data.mainGoal)) {
      createData.mainGoal = data.mainGoal;
    }
    
    const provisioned = await provisionCompany({
      company: createData,
      destinationKeys: Array.isArray(data.destinationKeys) ? data.destinationKeys : [],
      actorId: session.email,
      source: "api:companies:create",
    });
    
    return NextResponse.json(provisioned);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Company ID required" }, { status: 400 });
    }

    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;

    const dataRaw = await request.json().catch(() => ({}));
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = dataRaw as Record<string, any>;
    
    // Validate Profile (Partial validation for PATCH)
    const v = validateCompanyProfile(data);
    if (!v.valid) {
      return NextResponse.json({ error: "Validation failed", details: v.errors }, { status: 400 });
    }

    const industries = data.industries ? normalizeIndustryHashtags(data.industries) : undefined;
    
    const updateData: Prisma.CompanyUpdateInput = {
      name: data.name,
      industry: industries ? industries[0] : (data.industry || undefined),
      industries: industries || undefined,
      description: data.description || null,
      targetMarket: data.targetMarket || null,
      website: data.website !== undefined ? data.website : undefined,
      businessModel: data.businessModel !== undefined ? data.businessModel : undefined,
      productCategories: data.productCategories !== undefined ? data.productCategories : undefined,
      demographics: data.demographics !== undefined ? data.demographics : undefined,
      competitors: data.competitors !== undefined ? data.competitors : undefined,
    };

    const company = await prisma.company.update({
      where: { id },
      data: updateData,
    });
    
    return NextResponse.json(company);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Company ID required" }, { status: 400 });
    }
    
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;

    await deleteUnitData(prisma, id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
