import { NextRequest, NextResponse } from "next/server";
import { syncComparePublicI18n } from "@/lib/compare-public-i18n";
import {
  getActiveComparePublicConfig,
  upsertComparePublicConfig,
  type ComparePublicPatchInput,
} from "@/lib/compare-public-config";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asRecordArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string }> },
) {
  try {
    const { unitId, miniappId } = await params;
    const guard = await resolveMiniappRouteContext({
      request,
      unitId,
      miniappIdRaw: miniappId,
      requiredRole: "ADMIN",
    });
    if ("error" in guard) return guard.error;

    if (guard.context.miniappId !== "compare") {
      return NextResponse.json({ error: `Miniapp ${guard.context.miniappId} has no public config endpoint.` }, { status: 404 });
    }

    const config = await getActiveComparePublicConfig(guard.context.unitId);
    return NextResponse.json({ ok: true, unitId: guard.context.unitId, miniappId: guard.context.miniappId, config });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string }> },
) {
  const { unitId, miniappId } = await params;
  const guard = await resolveMiniappRouteContext({
    request,
    unitId,
    miniappIdRaw: miniappId,
    requiredRole: "ADMIN",
  });
  if ("error" in guard) return guard.error;

  if (guard.context.miniappId !== "compare") {
    return NextResponse.json({ error: `Miniapp ${guard.context.miniappId} has no public config endpoint.` }, { status: 404 });
  }

  const bodyRaw = await request.json().catch(() => null);
  if (bodyRaw !== null && (typeof bodyRaw !== "object" || Array.isArray(bodyRaw))) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = asRecord(bodyRaw);
  if (!body) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }

  const sync = body.syncToMiniapp === undefined ? true : asBoolean(body.syncToMiniapp);
  const patch: ComparePublicPatchInput = {};

  if (body.publicCopy && asRecord(body.publicCopy)) {
    patch.publicCopy = body.publicCopy as ComparePublicPatchInput["publicCopy"];
  }
  const publicLocales = asRecordArray(body.publicLocales);
  if (publicLocales) {
    patch.publicLocales = asStringArray(publicLocales);
  }
  if (typeof body.publicDefaultLocale === "string") {
    patch.publicDefaultLocale = asString(body.publicDefaultLocale);
  }
  const guides = asRecordArray(body.guides);
  if (guides) {
    patch.guides = guides;
  }
  const locationHeroImages = asRecordArray(body.locationHeroImages);
  if (locationHeroImages) {
    patch.locationHeroImages = locationHeroImages;
  }
  if (typeof body.homeHeroUrl === "string") {
    patch.homeHeroUrl = asString(body.homeHeroUrl);
  }
  if (typeof body.discoverHeroUrl === "string") {
    patch.discoverHeroUrl = asString(body.discoverHeroUrl);
  }
  if (typeof body.publicCopyMaintainedBy === "string") {
    patch.publicCopyMaintainedBy = asString(body.publicCopyMaintainedBy);
  }

  try {
    const nextConfig = await upsertComparePublicConfig(
      guard.context.unitId,
      patch,
      { email: guard.context.sessionEmail },
    );

    let syncResult: unknown = { ok: true, skipped: true, reason: "syncToMiniapp=false" };
    if (sync) {
      syncResult = await syncComparePublicI18n(guard.context.unitId);
    }

    return NextResponse.json({
      ok: true,
      unitId: guard.context.unitId,
      miniappId: guard.context.miniappId,
      config: nextConfig,
      sync: syncResult,
    });
  } catch (error) {
    console.error("[API:Units:Miniapp:PublicConfig] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
