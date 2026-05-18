import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";
import { verifyMembership, verifySuperAdmin } from "@/lib/permissions";
import { normalizeIndustryHashtags } from "@/lib/hashtags";
import { validateCompanyProfile } from "@/lib/profile-validation";
import { getProjectionFreshness, normalizeWebappProjection } from "@/lib/webapp-projection";
import { createRequestProfiler } from "@/lib/request-profile";

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
        intelligenceSnapshot: {
          select: {
            webappProjection: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }));

    const enrichedCompanies = companies.map((company) => {
      const snapshot = company.intelligenceSnapshot;
      const projection = normalizeWebappProjection(snapshot?.webappProjection);
      const counts = projection?.counts;
      const navCounts = projection?.navCounts;
      const checklistCount = Number(navCounts?.checklist ?? counts?.checklistCount ?? 0);
      const tacticalCount = Math.max(
        Number(navCounts?.tactical ?? counts?.tacticalCount ?? 0),
        checklistCount,
      );
      return {
        ...company,
        metrics: {
          data: Number(navCounts?.data ?? counts?.sources ?? 0),
          topics: Number(navCounts?.topics ?? counts?.topics ?? 0),
          knowmore: Number(navCounts?.knowmore ?? counts?.flashcards ?? 0),
          goals: Number(navCounts?.goals ?? counts?.goals ?? 0),
          review: Number(navCounts?.review ?? counts?.reviewCount ?? 0),
          checklist: checklistCount,
          tactical: tacticalCount,
        },
        projection: {
          available: Boolean(projection),
          freshness: getProjectionFreshness(projection?.generatedAt ?? null),
          generatedAt: projection?.generatedAt ?? null,
        },
        charts: projection?.homeCharts ?? {
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

    const data = await request.json();
    
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
    
    const company = await prisma.company.create({
      data: createData,
    });
    
    return NextResponse.json(company);
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

    const data = await request.json();
    
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

    // Delete related data first
    await prisma.feedback.deleteMany({ where: { checklistTask: { companyId: id } } });
    await prisma.checklistTask.deleteMany({ where: { companyId: id } });
    await prisma.flashcard.deleteMany({ where: { companyId: id } });
    await prisma.user.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
