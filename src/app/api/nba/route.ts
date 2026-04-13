import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import { calculateICEScore, normalizeNBAMetrics } from "@/lib/nba-scoring";
import { ensureChecklistPublicIds, nextChecklistPublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { APP_VERSION, BRAIN_VERSION, NBA_PROMPT_VERSION } from "@/lib/release";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  
  try {
    const items = await prisma.nBAItem.findMany({
      where: { companyId: companyId as string },
      orderBy: [{ iceScore: "desc" }, { publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[API:NBA] Get failure:", error);
    // Iron-Clad: Never return a non-array crash object to the dashboard
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const auth = await verifyMembership(request, data.companyId);
    if (auth.error) return auth.error;

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
          sourceFlashcardIds: data.sourceFlashcardIds ?? [],
          hashtags: normalizeSourceHashtags(data.hashtags),
          appVersion: APP_VERSION,
          brainVersion: BRAIN_VERSION,
          promptVersion: NBA_PROMPT_VERSION,
          generatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }, TRANSACTION_SETTINGS);
    
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
