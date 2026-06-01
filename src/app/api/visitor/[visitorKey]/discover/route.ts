import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { discoverVisitorCandidates } from "@/lib/visitor-candidate-pipeline";

export const dynamic = "force-dynamic";

function asNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const bodyRaw = await request.json().catch(() => null);
  const body = bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw) ? bodyRaw : {};
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  try {
    const result = await discoverVisitorCandidates(
      companyId,
      visitorKey,
      Math.max(1, Math.min(200, asNumber(body.limit, 50))),
      asString(body.destinationKey) || undefined,
    );
    return NextResponse.json({ ok: true, visitorKey, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
