import { NextRequest, NextResponse } from "next/server";
import { normalizeClassScoutManhattanSourceLeads, type ClassScoutManhattanSourceLead } from "@/lib/classscout-source-import";
import { importClassScoutManhattanSourceDatacards } from "@/lib/classscout-source-import-server";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const leads = Array.isArray(body.leads) ? (body.leads as ClassScoutManhattanSourceLead[]) : [];
  if (leads.length === 0) return NextResponse.json({ ok: false, error: "leads must be a non-empty array" }, { status: 400 });
  if (leads.length > 500) return NextResponse.json({ ok: false, error: "at most 500 leads can be imported per request" }, { status: 413 });

  const { visitorKey } = await params;
  const importBatchId = asString(body.importBatchId) || undefined;
  const destinationKey = asString(body.destinationKey) || undefined;
  const dryRun = body.dryRun !== false;

  try {
    const result = dryRun
      ? normalizeClassScoutManhattanSourceLeads(leads, importBatchId)
      : await importClassScoutManhattanSourceDatacards({
          companyId,
          visitorKey,
          destinationKey,
          importBatchId,
          leads,
          dryRun: false,
        });
    return NextResponse.json({ ...result, dryRun }, { status: result.ok ? (dryRun ? 200 : 201) : 422 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
