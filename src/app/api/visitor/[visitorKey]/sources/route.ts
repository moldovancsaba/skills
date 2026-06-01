import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import {
  createVisitorSourceDatacard,
  listVisitorSourceDatacards,
} from "@/lib/visitor-source-graph";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  try {
    const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
    const sources = await listVisitorSourceDatacards(companyId, visitorKey, destinationKey);
    return NextResponse.json({ ok: true, sources });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const payload = await request.json().catch(() => null);
  const body = asRecord(payload);
  if (!body) return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const datacard = asRecord(body.datacard);
  if (!datacard) return NextResponse.json({ ok: false, error: "datacard is required" }, { status: 400 });

  const { visitorKey } = await params;
  const destinationKey = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
  try {
    const source = await createVisitorSourceDatacard(companyId, visitorKey, datacard as never, destinationKey);
    return NextResponse.json({ ok: true, source });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
