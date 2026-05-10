import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { getCompanyObservabilitySnapshot } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const snapshot = await getCompanyObservabilitySnapshot(companyId);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[API:Observability] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
