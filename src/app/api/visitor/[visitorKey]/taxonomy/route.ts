import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import {
  getVisitorTaxonomy,
  upsertVisitorTaxonomy,
  type VisitorTaxonomy,
} from "@/lib/visitor-blueprints";

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
  const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  const taxonomy = await getVisitorTaxonomy(companyId, visitorKey, destinationKey);
  if (!taxonomy) return NextResponse.json({ ok: false, error: "Visitor taxonomy not found" }, { status: 404 });
  return NextResponse.json({ ok: true, taxonomy });
}

export async function PUT(
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

  const { visitorKey } = await params;
  const destinationKey = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
  const candidate = body.taxonomy as VisitorTaxonomy | undefined;
  if (!candidate || typeof candidate !== "object") {
    return NextResponse.json({ ok: false, error: "taxonomy is required" }, { status: 400 });
  }

  try {
    const saved = await upsertVisitorTaxonomy(companyId, {
      ...candidate,
      visitorKey,
    }, destinationKey);
    return NextResponse.json({ ok: true, taxonomy: saved });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
