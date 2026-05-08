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
        _count: {
          select: {
            sources: true,
            uploadedSourceFiles: true,
            topics: true,
            flashcards: true,
            goalcards: true,
            nbaItems: true,
          }
        },
        // We still need labels/tags for the header
        sources: {
          take: 0 // We only want the total count via _count
        },
        nbaItems: {
          where: { processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] } },
          orderBy: { iceScore: "desc" },
          take: 0, // We handle the count in _count, but filtering logic for 'pending' is complex in count
        },
      },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const enrichedCompanies = await Promise.all(companies.map(async (c) => {
      const [sources, files, topics, flashcards, goals, nbaItems] = await Promise.all([
        prisma.source.findMany({ where: { companyId: c.id, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
        prisma.uploadedSourceFile.findMany({ where: { companyId: c.id, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
        prisma.topic.findMany({ where: { companyId: c.id, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
        prisma.flashcard.findMany({ where: { companyId: c.id, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
        prisma.goalcard.findMany({ where: { companyId: c.id, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
        prisma.nBAItem.findMany({ where: { companyId: c.id, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
      ]);

      const [bSources, bFiles, bTopics, bFlashcards, bGoals, bNBA] = await Promise.all([
        prisma.source.count({ where: { companyId: c.id, createdAt: { lt: thirtyDaysAgo } } }),
        prisma.uploadedSourceFile.count({ where: { companyId: c.id, createdAt: { lt: thirtyDaysAgo } } }),
        prisma.topic.count({ where: { companyId: c.id, createdAt: { lt: thirtyDaysAgo } } }),
        prisma.flashcard.count({ where: { companyId: c.id, createdAt: { lt: thirtyDaysAgo } } }),
        prisma.goalcard.count({ where: { companyId: c.id, createdAt: { lt: thirtyDaysAgo } } }),
        prisma.nBAItem.count({ where: { companyId: c.id, createdAt: { lt: thirtyDaysAgo } } }),
      ]);

      const history = [];
      let curS = bSources + bFiles;
      let curT = bTopics;
      let curK = bFlashcards;
      let curG = bGoals;
      let curN = bNBA;

      for (let i = 0; i <= 30; i++) {
        const d = new Date(thirtyDaysAgo);
        d.setDate(d.getDate() + i);
        const dayStr = d.toISOString().split('T')[0];

        curS += sources.filter(s => s.createdAt.toISOString().split('T')[0] === dayStr).length;
        curS += files.filter(f => f.createdAt.toISOString().split('T')[0] === dayStr).length;
        curT += topics.filter(t => t.createdAt.toISOString().split('T')[0] === dayStr).length;
        curK += flashcards.filter(f => f.createdAt.toISOString().split('T')[0] === dayStr).length;
        curG += goals.filter(g => g.createdAt.toISOString().split('T')[0] === dayStr).length;
        curN += nbaItems.filter(n => n.createdAt.toISOString().split('T')[0] === dayStr).length;

        history.push({ date: dayStr, sources: curS, topics: curT, flashcards: curK, goals: curG, nba: curN });
      }

      const pendingNbaCount = await prisma.nBAItem.count({
        where: {
          companyId: c.id,
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
          activityState: { in: ["ACTIVE", "STALE"] },
          kanbanColumn: "CHECKLIST",
          scheduledDate: { lte: new Date() }
        }
      });

      const reviewCount = await prisma.nBAItem.count({
        where: {
          companyId: c.id,
          processingStatus: "REVIEW",
          activityState: { in: ["ACTIVE", "STALE"] },
        },
      });

      return {
        ...c,
        metrics: {
          data: (c._count.sources || 0) + (c._count.uploadedSourceFiles || 0),
          topics: c._count.topics || 0,
          knowmore: c._count.flashcards || 0,
          goals: c._count.goalcards || 0,
          review: reviewCount,
          checklist: pendingNbaCount,
          tactical: c._count.nbaItems || 0
        },
        analytics: history
      };
    }));

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
    await prisma.feedback.deleteMany({ where: { nbaItem: { companyId: id } } });
    await prisma.nBAItem.deleteMany({ where: { companyId: id } });
    await prisma.flashcard.deleteMany({ where: { companyId: id } });
    await prisma.user.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
