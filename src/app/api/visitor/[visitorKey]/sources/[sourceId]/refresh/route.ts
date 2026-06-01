import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { refreshVisitorSourceDatacard } from "@/lib/visitor-source-graph";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string; sourceId: string }> },
) {
  const bodyRaw = await request.json().catch(() => ({}));
  const companyId = typeof bodyRaw?.companyId === "string" ? bodyRaw.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { visitorKey, sourceId } = await params;
  try {
    const source = await refreshVisitorSourceDatacard(companyId, visitorKey, sourceId);
    if (!source) return NextResponse.json({ ok: false, error: "Datacard not found" }, { status: 404 });
    return NextResponse.json({ ok: true, source });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
