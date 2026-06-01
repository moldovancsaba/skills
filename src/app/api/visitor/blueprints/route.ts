import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { upsertVisitorBlueprint, type VisitorBlueprint } from "@/lib/visitor-blueprints";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const body = asRecord(payload);
  if (!body) return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const blueprint = body.blueprint as VisitorBlueprint | undefined;
  if (!blueprint || typeof blueprint !== "object") {
    return NextResponse.json({ ok: false, error: "blueprint is required" }, { status: 400 });
  }

  try {
    const destinationKey = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
    const saved = await upsertVisitorBlueprint(companyId, blueprint, destinationKey);
    return NextResponse.json({ ok: true, blueprint: saved });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
