import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";
import {
  enrichProductSeed,
  normalizeQuickAddInput,
} from "@/lib/url-enrichment";
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
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const normalized = normalizeQuickAddInput(data.name ?? "");
    const urls = Array.from(
      new Set([...(data.urls || []), ...normalized.urls].filter(Boolean)),
    );
    const enriched = await enrichProductSeed({
      name: normalized.inputWasUrl ? normalized.name : data.name,
      description: data.description,
      pricing: data.pricing,
      features: data.features || [],
      urls,
    });
    
    const product = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);

      return tx.product.create({
        data: {
          publicId,
          companyId: data.companyId,
          name: enriched.name || normalized.name || data.name,
          description: enriched.description,
          pricing: enriched.pricing,
          features: enriched.features,
          urls: enriched.urls,
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
    const normalized = normalizeQuickAddInput(data.name ?? "");
    const urls = Array.from(
      new Set([...(data.urls || []), ...normalized.urls].filter(Boolean)),
    );
    const enriched = await enrichProductSeed({
      name: normalized.inputWasUrl ? normalized.name : data.name,
      description: data.description,
      pricing: data.pricing,
      features: data.features || [],
      urls,
    });

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: enriched.name || normalized.name || data.name,
        description: enriched.description,
        pricing: enriched.pricing,
        features: enriched.features,
        urls: enriched.urls,
      },
    });
    await syncCompanyKnowledge(product.companyId);
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
