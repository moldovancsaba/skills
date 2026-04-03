import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  
  try {
    const where = companyId ? { companyId } : {};
    const products = await prisma.product.findMany({ where });
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const product = await prisma.product.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        description: data.description,
        pricing: data.pricing,
        features: data.features || [],
        urls: data.urls || [],
      },
    });
    
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  
  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}