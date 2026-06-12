import { NextRequest, NextResponse } from "next/server";
import {
  listDestinationMissionRuns,
  startDestinationMissionRun,
} from "@/lib/destination-missions";
import { resolveDestinationKeyForCompany } from "@/lib/destination-key-resolution";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const destinationKey = request.nextUrl.searchParams.get("destinationKey");
  const missionKind = request.nextUrl.searchParams.get("missionKind");
  if (destinationKey && !normalizeDestinationKey(destinationKey)) {
    return NextResponse.json({ error: "destinationKey must be supported by checklist" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  const resolvedDestinationKey = await resolveDestinationKeyForCompany(companyId, destinationKey);

  const runs = await listDestinationMissionRuns({
    companyId,
    destinationKey: resolvedDestinationKey,
    missionKind: missionKind === "rulebook_new_listing" ? "rulebook_new_listing" : undefined,
  });
  return NextResponse.json({ ok: true, runs });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;
    const companyId = String(body.companyId || "");
    if (!companyId || !body.destinationKey || !body.missionKind) {
      return NextResponse.json(
        { error: "companyId, destinationKey, and missionKind are required" },
        { status: 400 },
      );
    }
    const destinationKey = normalizeDestinationKey(body.destinationKey);
    if (!destinationKey) {
      return NextResponse.json(
        { error: "destinationKey must be supported by checklist" },
        { status: 400 },
      );
    }
    const missionKindRaw = String(body.missionKind || "").trim();
    if (missionKindRaw !== "rulebook_new_listing") {
      return NextResponse.json(
        { error: "missionKind must be rulebook_new_listing" },
        { status: 400 },
      );
    }

    const membership = await verifyMembership(request, companyId, "ADMIN");
    const ingestAuth = membership.error ? await verifyIngestSecret(request) : null;
    if (membership.error && ingestAuth?.error) {
      return membership.error;
    }

    const run = await startDestinationMissionRun({
      companyId,
      destinationKey,
      missionKind: missionKindRaw as "rulebook_new_listing",
      missionDefinitionId: typeof body.missionDefinitionId === "string" ? body.missionDefinitionId : undefined,
      policySnapshot: asRecord(body.policySnapshot),
      metadata: asRecord(body.metadata),
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    console.error("[API:DestinationMissions:Runs] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
