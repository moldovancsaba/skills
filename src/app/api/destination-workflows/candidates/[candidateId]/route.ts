import { NextRequest, NextResponse } from "next/server";
import { getDestinationCandidateGraph } from "@/lib/destination-workflows";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { candidateId } = await params;
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId required" }, { status: 400 });
  }

  const graph = await getDestinationCandidateGraph(companyId, candidateId);
  if (!graph) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  return NextResponse.json(graph);
}
