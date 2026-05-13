import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { listCompanyWorkflowBlueprints } from "@/lib/workflow-blueprints";
import { issueSystemCommand } from "@/lib/system-commands";

export const dynamic = "force-dynamic";

const VALID_CONTROL_MODES = new Set(["AI_ONLY", "HUMAN_GUIDED"]);
const VALID_QUEUE_COLUMNS = new Set(["NOW", "SOON", "LATER", "PARKED"]);
const VALID_BLUEPRINT_STATUSES = new Set(["ACTIVE", "PAUSED"]);

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

    const blueprint = await prisma.workflowBlueprint.findFirst({
      where: { id: blueprintId, companyId },
      select: { id: true },
    });
    if (!blueprint) {
      return NextResponse.json({ error: "Workflow blueprint not found for company" }, { status: 404 });
    }

    const controlMode = String(data.controlMode || "");
    const queueColumn = String(data.queueColumn || "");
    const status = String(data.status || "");

    if (!VALID_CONTROL_MODES.has(controlMode)) {
      return NextResponse.json({ error: "Invalid controlMode" }, { status: 400 });
    }
    if (!VALID_QUEUE_COLUMNS.has(queueColumn)) {
      return NextResponse.json({ error: "Invalid queueColumn" }, { status: 400 });
    }
    if (!VALID_BLUEPRINT_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await prisma.workflowBlueprint.update({
      where: { id: blueprintId },
      data: {
        controlMode: controlMode as "AI_ONLY" | "HUMAN_GUIDED",
        queueColumn: queueColumn as "NOW" | "SOON" | "LATER" | "PARKED",
        status: status as "ACTIVE" | "PAUSED",
      },
    });
    await issueSystemCommand("SYNC_PIPELINE_JOBS", { companyId });

    return NextResponse.json(await listCompanyWorkflowBlueprints(companyId));
  } catch (error) {
    console.error("[API:Workflows] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
