import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateICEScore, normalizeNBAMetrics } from "@/lib/nba-scoring";
import { ensureChecklistPublicIds, nextChecklistPublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  
  try {
    await ensureChecklistPublicIds(companyId ?? undefined);
    const where = companyId ? { companyId } : {};
    const items = await prisma.nBAItem.findMany({
      where,
      orderBy: [{ iceScore: "desc" }, { publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const { impact, confidence, ease } = normalizeNBAMetrics(data);
    const iceScore = calculateICEScore({ impact, confidence, ease });
    
    const item = await prisma.$transaction(async (tx) => {
      const publicId = await nextChecklistPublicId(tx);
      return tx.nBAItem.create({
        data: {
          publicId,
          companyId: data.companyId,
          title: data.title,
          description: data.description,
          impact,
          confidence,
          ease,
          iceScore,
          scheduledDate: data.scheduledDate,
          createdBy: data.createdBy,
        },
      });
    }, TRANSACTION_SETTINGS);
    
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
