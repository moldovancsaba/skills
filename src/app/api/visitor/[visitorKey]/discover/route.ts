import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { queueVisitorLocalIntent } from "@/lib/visitor-intent-queue";

export const dynamic = "force-dynamic";

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
  const receipt = await queueVisitorLocalIntent({
    companyId,
    visitorKey,
    intentKind: "candidate.discover",
    destinationKey: asString(body.destinationKey) || null,
  });
  return NextResponse.json(receipt, { status: 202 });
}
