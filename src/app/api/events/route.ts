import { NextRequest, NextResponse } from "next/server";

import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest } from "@/lib/audit-ledger";
import { classifyPersistenceFailure } from "@/lib/persistence-failures";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => ({}));
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, any>;
    const companyId = typeof body.companyId === "string" ? body.companyId : null;

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: typeof body.surface === "string" ? body.surface : "unknown",
      interactionType: typeof body.interactionType === "string" ? body.interactionType : "unknown",
      entityType: typeof body.entityType === "string" ? body.entityType : undefined,
      entityId: typeof body.entityId === "string" ? body.entityId : undefined,
      beforeState: body.beforeState,
      afterState: body.afterState,
      payload: body.payload,
      teachingWeight: typeof body.teachingWeight === "number" ? body.teachingWeight : 30,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const persistenceFailure = classifyPersistenceFailure(error);
    if (persistenceFailure) {
      console.warn("[API:EVENTS] Ignoring interaction-event write because Atlas storage is quota-blocked.");
      return NextResponse.json({
        success: false,
        ignored: true,
        reasonCode: persistenceFailure.reasonCode,
      }, { status: 202 });
    }
    console.error("[API:EVENTS] Post failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
