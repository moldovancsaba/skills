import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { validateVisitorTaxonomyAgainstLive } from "@/lib/visitor-taxonomy-validation";

export const dynamic = "force-dynamic";

function asNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const payload = await request.json().catch(() => null);
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;
  const { visitorKey } = await params;
  try {
    const destinationKey = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
    const result = await validateVisitorTaxonomyAgainstLive(companyId, visitorKey, asNumber(body.limit, 500), destinationKey);
    return NextResponse.json({ ok: true, visitorKey, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
