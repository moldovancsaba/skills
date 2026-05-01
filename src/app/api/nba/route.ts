import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import { calculateICEScore, normalizeNBAMetrics } from "@/lib/nba-scoring";
import { ensurechecklistPublicIds, nextchecklistPublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { APP_VERSION, BRAIN_VERSION, NBA_PROMPT_VERSION } from "@/lib/release";
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const isArchived = request.nextUrl.searchParams.get("archived") === "true";
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  
  try {
    const where: any = { companyId: companyId as string };

    if (isArchived) {
      where.OR = [
        { activityState: "ARCHIVED" },
        { processingStatus: { in: ["ACCEPTED", "DECLINED"] } }
      ];
    } else {
      where.processingStatus = { in: ["DRAFT", "CHECKED", "VERIFIED"] };
      where.activityState = { in: ["ACTIVE", "STALE"] };
      // Only show tasks that are not scheduled for the future
      where.OR = [
        { scheduledDate: null },
        { scheduledDate: { isSet: false } },
        { scheduledDate: { lte: new Date() } }
      ];
    }

    const items = await prisma.nBAItem.findMany({
      where,
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
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
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

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data = await request.json();
    const existing = await prisma.nBAItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const updated = await prisma.nBAItem.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        processingStatus: data.processingStatus ?? existing.processingStatus,
        activityState: data.activityState ?? existing.activityState,
        scheduledDate: data.scheduledDate !== undefined ? (data.scheduledDate ? new Date(data.scheduledDate) : null) : existing.scheduledDate,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API:NBA] Patch failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
