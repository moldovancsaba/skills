import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { listCompanyWorkflowBlueprints } from "@/lib/workflow-blueprints";
import { syncCompanyPipelineJobs } from "@/lib/pipeline-queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const items = await listCompanyWorkflowBlueprints(companyId);
    return NextResponse.json(items);
  } catch (error) {
    console.error("[API:Workflows] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    const blueprintId = String(data.blueprintId || "");
    if (!companyId || !blueprintId) {
      return NextResponse.json({ error: "companyId and blueprintId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    await prisma.workflowBlueprint.update({
      where: { id: blueprintId },
      data: {
        controlMode: data.controlMode,
        queueColumn: data.queueColumn,
        status: data.status,
      },
    });
    await syncCompanyPipelineJobs(prisma, companyId);

    return NextResponse.json(await listCompanyWorkflowBlueprints(companyId));
  } catch (error) {
    console.error("[API:Workflows] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
