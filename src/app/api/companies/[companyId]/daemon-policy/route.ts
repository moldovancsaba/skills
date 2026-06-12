import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import {
  applyDestinationDaemonPolicyPatchToWorkerConfig,
  resolveDestinationDaemonPolicy,
  type DestinationDaemonLimits,
  type DestinationDaemonPolicyPatch,
} from "@/lib/check-foundation/destination-daemon-policy";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readApiSafeDaemonDefaults(): DestinationDaemonLimits {
  const maxRuns = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_RUNS ?? 5);
  const maxPasses = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_PASSES ?? 3);
  const maxAutoRejections = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_AUTO_REJECTIONS ?? 5);
  const maxRevisionIntakes = Number(process.env.DESTINATION_MAINTENANCE_MAX_REVISION_INTAKES ?? 10);
  const maxApprovedPublishes = Number(process.env.DESTINATION_MAINTENANCE_MAX_APPROVED_PUBLISHES ?? 10);

  return {
    maxRuns: Number.isFinite(maxRuns) ? Math.max(1, Math.min(Math.round(maxRuns), 20)) : 5,
    maxPasses: Number.isFinite(maxPasses) ? Math.max(1, Math.min(Math.round(maxPasses), 8)) : 3,
    maxAutoRejections: Number.isFinite(maxAutoRejections) ? Math.max(1, Math.min(Math.round(maxAutoRejections), 10)) : 5,
    maxRevisionIntakes: Number.isFinite(maxRevisionIntakes) ? Math.max(1, Math.min(Math.round(maxRevisionIntakes), 20)) : 10,
    maxApprovedPublishes: Number.isFinite(maxApprovedPublishes) ? Math.max(1, Math.min(Math.round(maxApprovedPublishes), 20)) : 10,
  };
}

function normalizePatchPayload(input: unknown): { patch: DestinationDaemonPolicyPatch } | { error: string } {
  const incoming = asRecord(input);
  if (!incoming) {
    return { error: "Request body must be a JSON object." };
  }

  const patchSource = asRecord(incoming.patch) ?? incoming;
  const patch: DestinationDaemonPolicyPatch = {};

  if (patchSource.defaults !== undefined) {
    const defaults = asRecord(patchSource.defaults);
    if (!defaults) {
      return { error: `"defaults" must be an object when provided.` };
    }
    patch.defaults = defaults as DestinationDaemonPolicyPatch["defaults"];
  }

  if (patchSource.miniapps !== undefined) {
    const miniapps = asRecord(patchSource.miniapps);
    if (!miniapps) {
      return { error: `"miniapps" must be an object when provided.` };
    }
    if (miniapps.compare !== undefined && !asRecord(miniapps.compare)) {
      return { error: `"miniapps.compare" must be an object when provided.` };
    }
    patch.miniapps = miniapps as DestinationDaemonPolicyPatch["miniapps"];
  }

  if (patch.defaults === undefined && patch.miniapps === undefined) {
    return { error: `Provide at least one of "defaults" or "miniapps".` };
  }

  return { patch };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, workerConfig: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const defaults = readApiSafeDaemonDefaults();
    const resolved = resolveDestinationDaemonPolicy({
      workerConfig: company.workerConfig,
      fallbackDefaults: defaults,
    });
    const workerConfig = asRecord(company.workerConfig);
    const storedPolicy = asRecord(workerConfig?.destinationDaemonPolicy);

    return NextResponse.json({
      unitId: companyId,
      source: resolved.source,
      defaults: resolved.defaults,
      byDestination: resolved.byDestination,
      warnings: resolved.warnings,
      storedPolicy,
    });
  } catch (error) {
    console.error("[API:CompanyDaemonPolicy] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    const bodyRaw = await request.json().catch(() => null);
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, unknown>;
    const patchResult = normalizePatchPayload(body);
    if ("error" in patchResult) {
      return NextResponse.json({ error: patchResult.error }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, workerConfig: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const defaults = readApiSafeDaemonDefaults();
    const next = applyDestinationDaemonPolicyPatchToWorkerConfig({
      workerConfig: company.workerConfig,
      patch: patchResult.patch,
      fallbackDefaults: defaults,
    });

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        workerConfig: next.workerConfig as Prisma.JsonValue,
      },
      select: {
        id: true,
        workerConfig: true,
      },
    });

    return NextResponse.json({
      unitId: updated.id,
      source: next.resolved.source,
      defaults: next.resolved.defaults,
      byDestination: next.resolved.byDestination,
      warnings: next.resolved.warnings,
      storedPolicy: asRecord(asRecord(updated.workerConfig)?.destinationDaemonPolicy),
    });
  } catch (error) {
    console.error("[API:CompanyDaemonPolicy] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
