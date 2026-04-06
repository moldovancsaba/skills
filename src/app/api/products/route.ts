import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";
import {
  prepareRawSourceInput,
} from "@/lib/url-enrichment";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import { syncCompanyKnowledge } from "@/lib/flashcards";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  
  try {
    await ensureSourcePublicIds(companyId ?? undefined);
    const where = companyId ? { companyId } : {};
    const products = await prisma.product.findMany({
      where,
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(
      products.map((product) => ({
        ...product,
        hashtags: normalizeSourceHashtags(product.hashtags, "product"),
      })),
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const raw = prepareRawSourceInput(data.name ?? "", data.urls || []);
    
    const product = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);

      return tx.product.create({
        data: {
          publicId,
          companyId: data.companyId,
          name: raw.name,
          hashtags: normalizeSourceHashtags(data.hashtags, "product"),
          description: data.description ?? null,
          pricing: data.pricing ?? null,
          features: data.features || [],
          urls: raw.urls,
        },
      });
    }, TRANSACTION_SETTINGS);

    await syncCompanyKnowledge(product.companyId);
    
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? undefined;
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { companyId: true },
    });
    await prisma.product.delete({ where: { id } });
    if (existing?.companyId) {
      await syncCompanyKnowledge(existing.companyId);
    }
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
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const raw = prepareRawSourceInput(
      data.name ?? existing.name,
      data.urls ?? existing.urls,
    );

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: raw.name,
        hashtags: normalizeSourceHashtags(data.hashtags ?? existing.hashtags, "product"),
        description: data.description ?? existing.description,
        pricing: data.pricing ?? existing.pricing,
        features: data.features ?? existing.features,
        urls: raw.urls,
      },
    });
    await syncCompanyKnowledge(product.companyId);
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
