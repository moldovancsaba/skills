import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { buildCustomerOperationsSummary } from "@/lib/customer-value-delivery";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const summary = await buildCustomerOperationsSummary(companyId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[API:CustomerOperations] Failure:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
