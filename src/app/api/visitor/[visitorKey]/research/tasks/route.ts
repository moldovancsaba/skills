import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { listMiniappResearchTasks } from "@/lib/miniapp-research-planner";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  try {
    const tasks = await listMiniappResearchTasks(companyId, visitorKey, destinationKey);
    return NextResponse.json({
      ok: true,
      visitorKey,
      sourceCardInventoryIsSuccess: false,
      queuedCount: tasks.filter((task) => task.status === "QUEUED").length,
      tasks,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
