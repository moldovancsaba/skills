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
    
    const company = await prisma.company.create({
      data: {
        name: data.name,
        industry: data.industry,
        description: data.description,
        targetMarket: data.targetMarket,
        mainGoal: data.mainGoal,
      },
    });
    
    return NextResponse.json(company);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}