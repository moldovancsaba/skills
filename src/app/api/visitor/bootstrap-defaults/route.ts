import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { syncComparePublicI18n } from "@/lib/compare-public-i18n";
import { seedComparePublicConfig } from "@/lib/compare-public-config";
import { bootstrapVisitorDefaults } from "@/lib/visitor-bootstrap";
import { migrateVisitorFromExistingDestination } from "@/lib/visitor-migration";

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
  try {
    const result = await bootstrapVisitorDefaults(companyId);
    const importExisting = body.importExisting !== false;
    let migrationResults: unknown[] = [];
    if (importExisting) {
      migrationResults = await Promise.all([
        migrateVisitorFromExistingDestination(companyId, "classscout-new-york", { activate: true }),
        migrateVisitorFromExistingDestination(companyId, "rangescout-hungary", { activate: true }),
      ]);
    }
    await seedComparePublicConfig(companyId);
    const syncPublicI18n = body.syncPublicI18n === false
      ? { ok: true, skipped: true, reason: "syncPublicI18n=false" }
      : await syncComparePublicI18n(companyId);
    return NextResponse.json({ ok: true, result, migrationResults, importExisting, syncPublicI18n });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
