import { NextRequest, NextResponse } from "next/server";
import { getDestinationWorkflowRun } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const run = await getDestinationWorkflowRun(companyId, id);
  if (!run) return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
  return NextResponse.json(run);
}
