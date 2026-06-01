import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { migrateVisitorFromExistingDestination } from "@/lib/visitor-migration";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;
  const { visitorKey } = await params;
  try {
    const result = await migrateVisitorFromExistingDestination(companyId, visitorKey, {
      activate: body.activate !== false,
    });
    return NextResponse.json({ ok: true, visitorKey, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

