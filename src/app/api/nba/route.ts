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
      where: { 
        companyId: companyId as string,
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
        activityState: { in: ["ACTIVE", "STALE"] }
      },
      orderBy: [{ iceScore: "desc" }, { confidenceScore: "desc" }, { publicId: "asc" }],
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

    // Passive Ingress: No logic, no scoring, no ID generation.
    // The Local AI Worker will pick this up for hardening.
    const item = await prisma.nBAItem.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        description: data.description,
        processingStatus: "DRAFT",
        activityState: "ACTIVE",
        status: "PENDING", // Legacy Sync
        scheduledDate: data.scheduledDate,
        createdBy: data.createdBy,
        appVersion: APP_VERSION,
        brainVersion: BRAIN_VERSION,
        promptVersion: NBA_PROMPT_VERSION,
        generatedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    
    return NextResponse.json(item);
  } catch (error) {
    console.error("[API:NBA] Post failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
