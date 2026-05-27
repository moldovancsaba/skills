import { NextRequest, NextResponse } from "next/server";
import { listDestinationCandidatesForWorkflow } from "@/lib/destination-workflows";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const candidates = await listDestinationCandidatesForWorkflow(companyId as string, id);
  return NextResponse.json({ ok: true, candidates });
}
