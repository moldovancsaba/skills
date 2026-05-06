import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

/**
 * STRATEGIC FEEDBACK API
 * v0.16.0
 * 
 * Implements State Snapshot Architecture:
 * - ISOLATION: Writes exclusively to StrategicFeedback to prevent AI overwrites.
 * - UNIFIED: Handles Goal, Task, and Knowledge feedback in one stream.
 */

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const feedbacks = await prisma.strategicFeedback.findMany({
      where: { 
        companyId,
        processedByAI: false 
      },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json(feedbacks);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { companyId, entityId, entityType, action, annotation, modifiedTitle, modifiedDescription, declineClass } = data;

    if (!companyId || !entityId || !entityType) {
      return NextResponse.json({ error: "Missing required feedback fields" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    
    // Save to the isolated StrategicFeedback table
    // This is the "Journal" that the Local AI Server will pull and reconcile
    const feedback = await prisma.strategicFeedback.create({
      data: {
        companyId,
        entityId,
        entityType,
        action,
        annotation,
        modifiedTitle,
        modifiedDescription,
        declineClass,
        processedByAI: false
      },
    });
    
    return NextResponse.json(feedback);
  } catch (error) {
    console.error("[API:Feedback] Submission failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
