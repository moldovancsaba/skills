import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import {
  activateVisitorBlueprint,
  getVisitorBlueprint,
  upsertVisitorBlueprint,
  type VisitorBlueprint,
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
  const blueprint = await getVisitorBlueprint(companyId, visitorKey, destinationKey);
  if (!blueprint) return NextResponse.json({ ok: false, error: "Visitor blueprint not found" }, { status: 404 });
  return NextResponse.json({ ok: true, blueprint });
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
  const candidate = body.blueprint as VisitorBlueprint | undefined;
  if (!candidate || typeof candidate !== "object") {
    return NextResponse.json({ ok: false, error: "blueprint is required" }, { status: 400 });
  }

  try {
    const saved = await upsertVisitorBlueprint(companyId, {
      ...candidate,
      visitorKey,
    }, destinationKey);
    return NextResponse.json({ ok: true, blueprint: saved });
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
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (action !== "activate") {
    return NextResponse.json({ ok: false, error: "Unsupported action. Use action=activate." }, { status: 400 });
  }
  const { visitorKey } = await params;
  const destinationKey = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
  try {
    const blueprint = await activateVisitorBlueprint(companyId, visitorKey, destinationKey);
    return NextResponse.json({ ok: true, blueprint, activated: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
