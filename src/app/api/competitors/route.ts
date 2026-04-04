import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  
  try {
    const where = companyId ? { companyId } : {};
    const competitors = await prisma.competitor.findMany({ where });
    return NextResponse.json(competitors);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const competitor = await prisma.competitor.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        urls: data.urls || [],
        pricing: data.pricing,
        strengths: data.strengths || [],
        weaknesses: data.weaknesses || [],
        positioning: data.positioning,
        watchedContent: data.watchedContent,
      },
    });
    
    return NextResponse.json(competitor);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const data = await request.json();
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const competitor = await prisma.competitor.update({
      where: { id },
      data: {
        name: data.name,
        urls: data.urls,
        pricing: data.pricing,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        positioning: data.positioning,
        watchedContent: data.watchedContent,
      },
    });
    return NextResponse.json(competitor);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await prisma.competitor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}