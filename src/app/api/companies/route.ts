import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";
import { verifyMembership } from "@/lib/permissions";

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
            email: session.email
          }
        }
      },
      include: {
        products: true,
        customers: true,
        competitors: true,
        nbaItems: {
          where: { status: "PENDING" },
          orderBy: { iceScore: "desc" },
          take: 3,
        },
      },
    });
    return NextResponse.json(companies);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await readAppSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();
    
    const createData: any = {
      name: data.name,
      industry: data.industry || null,
      description: data.description || null,
      targetMarket: data.targetMarket || null,
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

    const auth = await verifyMembership(request, id, "OWNER");
    if (auth.error) return auth.error;

    const data = await request.json();
    
    const company = await prisma.company.update({
      where: { id },
      data: {
        name: data.name,
        industry: data.industry || null,
        description: data.description || null,
        targetMarket: data.targetMarket || null,
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
    
    const auth = await verifyMembership(request, id, "OWNER");
    if (auth.error) return auth.error;

    // Delete related data first
    await prisma.feedback.deleteMany({ where: { nbaItem: { companyId: id } } });
    await prisma.nBAItem.deleteMany({ where: { companyId: id } });
    await prisma.flashcard.deleteMany({ where: { companyId: id } });
    await prisma.product.deleteMany({ where: { companyId: id } });
    await prisma.customer.deleteMany({ where: { companyId: id } });
    await prisma.competitor.deleteMany({ where: { companyId: id } });
    await prisma.user.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
