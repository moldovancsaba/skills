import { NextRequest, NextResponse } from "next/server";
import { syncComparePublicI18n } from "@/lib/compare-public-i18n";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function asDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

export async function POST(request: NextRequest) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const syncNow = body.syncNow === undefined ? true : asBoolean(body.syncNow);
  if (syncNow === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "syncNow=false" });
  }

  const now = asDate(body.now);
  const result = await syncComparePublicI18n(companyId, now);
  return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : result.status || 502 });
}
