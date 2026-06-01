import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { updateVisitorSourceDatacard } from "@/lib/visitor-source-graph";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string; sourceId: string }> },
) {
  const payload = await request.json().catch(() => null);
  const body = asRecord(payload);
  if (!body) return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const patch = asRecord(body.patch);
  if (!patch) return NextResponse.json({ ok: false, error: "patch is required" }, { status: 400 });

  const { visitorKey, sourceId } = await params;
  try {
    const source = await updateVisitorSourceDatacard(companyId, visitorKey, sourceId, patch as never);
    if (!source) return NextResponse.json({ ok: false, error: "Datacard not found" }, { status: 404 });
    return NextResponse.json({ ok: true, source });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
