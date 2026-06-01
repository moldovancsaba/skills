import { NextRequest, NextResponse } from "next/server";
import { syncComparePublicI18n } from "@/lib/compare-public-i18n";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function POST(request: NextRequest) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const result = await syncComparePublicI18n();
  return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : result.status || 502 });
}
