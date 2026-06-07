import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import {
  getCompanySurfaceReadModel,
  markCompanySurfaceProjectionDirty,
} from "@/lib/surface-projections";

export const dynamic = "force-dynamic";

type SurfaceActionStatus = "ACCEPTED" | "APPLIED" | "REJECTED" | "CONFLICT";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJsonBody(request: NextRequest) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function receipt(status: SurfaceActionStatus, message: string, extra: Record<string, unknown> = {}) {
  return {
    ok: status !== "REJECTED" && status !== "CONFLICT",
    receiptId: crypto.randomUUID(),
    status,
    message,
    ...extra,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; surfaceKey: string }> },
) {
  const { companyId, surfaceKey: rawSurfaceKey } = await params;
  const surfaceKey = decodeURIComponent(rawSurfaceKey || "");
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  if (!surfaceKey) return NextResponse.json({ ok: false, error: "surfaceKey is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });

  const action = readString(body.action);
  const projectionRevision = readString(body.projectionRevision);
  const currentProjection = await getCompanySurfaceReadModel(prisma, { companyId, surfaceKey });
  const currentRevision = currentProjection.observability.checksum || "";

  if (projectionRevision && currentRevision && projectionRevision !== currentRevision) {
    return NextResponse.json(
      receipt("CONFLICT", "Surface projection changed before this action could be applied.", {
        currentRevision,
        nextProjection: currentProjection,
      }),
      { status: 409 },
    );
  }

  if (action === "refreshProjection") {
    await markCompanySurfaceProjectionDirty(prisma, companyId, surfaceKey, "surface-action:refreshProjection");
    return NextResponse.json(
      receipt("ACCEPTED", "Surface projection refresh was queued for the local snapshot worker.", {
        projectionRevision: currentRevision || null,
      }),
      { status: 202 },
    );
  }

  return NextResponse.json(
    receipt("REJECTED", `Unsupported surface action: ${action || "(missing)"}`, {
      allowedActions: ["refreshProjection"],
    }),
    { status: 400 },
  );
}
