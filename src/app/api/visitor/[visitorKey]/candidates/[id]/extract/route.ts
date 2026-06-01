import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { extractVisitorCandidate } from "@/lib/visitor-candidate-pipeline";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string; id: string }> },
) {
  const bodyRaw = await request.json().catch(() => null);
  const body = bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw) ? bodyRaw : {};
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey, id } = await params;
  const facts = await extractVisitorCandidate(companyId, visitorKey, id);
  if (!facts) return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
  return NextResponse.json({ ok: true, visitorKey, candidateId: id, facts });
}
