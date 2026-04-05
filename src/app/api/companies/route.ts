import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
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
    const data = await request.json();
    
    const createData: any = {
      name: data.name,
      industry: data.industry || null,
      description: data.description || null,
      targetMarket: data.targetMarket || null,
    };
    
    // Only add mainGoal if it's a valid enum value
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
    const data = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: "Company ID required" }, { status: 400 });
    }
    
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
    
    // Delete related data first
    await prisma.feedback.deleteMany({ where: { nbaItem: { companyId: id } } });
    await prisma.nBAItem.deleteMany({ where: { companyId: id } });
    await prisma.flashcard.deleteMany({ where: { companyId: id } });
    await prisma.product.deleteMany({ where: { companyId: id } });
    await prisma.customer.deleteMany({ where: { companyId: id } });
    await prisma.competitor.deleteMany({ where: { companyId: id } });
    await prisma.company.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
