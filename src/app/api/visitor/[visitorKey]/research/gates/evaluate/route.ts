import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { queueVisitorLocalIntent } from "@/lib/visitor-intent-queue";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  const receipt = await queueVisitorLocalIntent({
    companyId,
    visitorKey,
    intentKind: "research.gates.evaluate",
    candidateId: asString(body.candidateId) || null,
    destinationKey: asString(body.destinationKey) || null,
    payload: {
      limit: Number(body.limit) || 25,
    },
  });
  return NextResponse.json(receipt, { status: 202 });
}
