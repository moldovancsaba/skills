import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionRun } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const run = await getDestinationMissionRun(companyId as string, id);
  if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}
