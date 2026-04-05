import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureSourcePublicIds, nextSourcePublicId } from "@/lib/source-public-ids";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  
  try {
    await ensureSourcePublicIds(companyId ?? undefined);
    const where = companyId ? { companyId } : {};
    const products = await prisma.product.findMany({
      where,
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const product = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);

      return tx.product.create({
        data: {
          publicId,
          companyId: data.companyId,
          name: data.name,
          description: data.description,
          pricing: data.pricing,
          features: data.features || [],
          urls: data.urls || [],
        },
      });
    });
    
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? undefined;
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const data = await request.json();
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        pricing: data.pricing,
        features: data.features,
        urls: data.urls,
      },
    });
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
