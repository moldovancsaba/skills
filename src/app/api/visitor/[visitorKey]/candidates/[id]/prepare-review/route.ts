import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { prepareVisitorReviewPacket } from "@/lib/visitor-candidate-pipeline";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string; id: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey, id } = await params;
  const packet = await prepareVisitorReviewPacket(companyId, visitorKey, id);
  if (!packet) return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
  return NextResponse.json({ ok: true, visitorKey, candidateId: id, packet });
}
