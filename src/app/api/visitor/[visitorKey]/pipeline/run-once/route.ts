import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { runVisitorPipelineOnce } from "@/lib/visitor-pipeline-runner";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;
  const { visitorKey } = await params;
  try {
    const run = await runVisitorPipelineOnce({
      companyId,
      visitorKey,
      discoverLimit: asNumber(body.discoverLimit, 30),
      processLimit: asNumber(body.processLimit, 20),
      destinationKey: asString(body.destinationKey) || undefined,
      autoApprove: body.autoApprove === true,
      autoPublish: body.autoPublish === true,
    });
    return NextResponse.json({ ok: true, visitorKey, run });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
