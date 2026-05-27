import { NextRequest, NextResponse } from "next/server";
import { buildDestinationTrainingExport, getDestinationLearningSummary, getDestinationReplayCandidates } from "@/lib/destination-learning";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = String(body.companyId || "");
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const exportType = typeof body.exportType === "string" ? body.exportType : "training";
    if (exportType === "summary") {
      const summary = await getDestinationLearningSummary({
        companyId,
        destinationKey: body.destinationKey,
      });
      return NextResponse.json({ ok: true, exportType, summary });
    }

    if (exportType === "replay-candidates") {
      const items = await getDestinationReplayCandidates({
        companyId,
        destinationKey: body.destinationKey,
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
      destinationKey: body.destinationKey,
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
