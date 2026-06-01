import { NextRequest, NextResponse } from "next/server";
import { buildDestinationTrainingExport, getDestinationLearningSummary, getDestinationReplayCandidates } from "@/lib/destination-learning";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;
    const companyId = String(body.companyId || "");
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
    }
    const destinationKeyRaw = body.destinationKey;
    if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
      return NextResponse.json({ ok: false, error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    if (!destinationKey) {
      return NextResponse.json({ ok: false, error: "destinationKey is required" }, { status: 400 });
    }
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const exportType = typeof body.exportType === "string" ? body.exportType : "training";
    if (exportType === "summary") {
      const summary = await getDestinationLearningSummary({
        companyId,
        destinationKey,
      });
      return NextResponse.json({ ok: true, exportType, summary });
    }

    if (exportType === "replay-candidates") {
      const items = await getDestinationReplayCandidates({
        companyId,
        destinationKey,
      });
      return NextResponse.json({
        ok: true,
        exportType,
        exportedAt: new Date().toISOString(),
        count: items.length,
        items,
      });
    }

    const dataset = await buildDestinationTrainingExport({
      companyId,
      destinationKey,
      labels: Array.isArray(body.labels)
        ? body.labels.filter((item: unknown): item is string => typeof item === "string")
        : undefined,
    });

    return NextResponse.json({ ok: true, exportType, ...dataset });
  } catch (error) {
    console.error("[API:DestinationLearning:Exports] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
