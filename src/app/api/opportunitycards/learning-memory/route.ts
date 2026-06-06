import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { getOpportunityLearningMemory } from "@/lib/customer-value-delivery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(await getOpportunityLearningMemory(companyId as string));
  } catch (error) {
    console.error("[API:OpportunityLearningMemory] Failure:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
