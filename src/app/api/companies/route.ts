import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";
import { verifyMembership, verifySuperAdmin } from "@/lib/permissions";
import { normalizeIndustryHashtags } from "@/lib/hashtags";
import { validateCompanyProfile } from "@/lib/profile-validation";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await readAppSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companies = await prisma.company.findMany({
      where: {
        users: {
          some: {
            email: session.email.trim().toLowerCase()
          }
        }
      },
      include: {
        intelligenceSnapshot: true,
      },
    });

    const enrichedCompanies = companies.map((company) => {
      const snapshot = company.intelligenceSnapshot;
      return {
        ...company,
        metrics: {
          data: snapshot?.dataIngressCount ?? 0,
          topics: snapshot?.topicSynthesisCount ?? 0,
          knowmore: snapshot?.knowmoreCount ?? 0,
          goals: snapshot?.strategicGoalsCount ?? 0,
          review: snapshot?.reviewGatewayCount ?? 0,
          checklist: snapshot?.checklistCount ?? 0,
          tactical: snapshot?.tacticalBoardCount ?? 0,
        },
        analytics: Array.isArray(snapshot?.analyticsHistory) ? snapshot.analyticsHistory : [],
      };
    });

    return NextResponse.json(enrichedCompanies);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
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
    
    const createData: any = {
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
    
    if (data.mainGoal && ["GROW_REVENUE", "LAUNCH_PRODUCT", "ENTER_NEW_MARKET", "BUILD_AWARENESS", "GENERATE_LEADS"].includes(data.mainGoal)) {
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
    
    const company = await prisma.company.update({
      where: { id },
      data: {
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
      },
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
