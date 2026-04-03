import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  
  try {
    const where = companyId ? { companyId } : {};
    const items = await prisma.nBAItem.findMany({
      where,
      orderBy: { iceScore: "desc" },
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const iceScore = (data.impact * (data.confidence / 100) * data.ease * 10);
    
    const item = await prisma.nBAItem.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        description: data.description,
        impact: data.impact || 5,
        confidence: data.confidence || 50,
        ease: data.ease || 5,
        iceScore,
        scheduledDate: data.scheduledDate,
        createdBy: data.createdBy,
      },
    });
    
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}