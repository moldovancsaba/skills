import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readTask(row: {
  id: string;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const task = asRecord(asRecord(row.metadata)?.miniappResearchTask);
  if (!task) return null;
  const createdFrom = asRecord(task.createdFrom) ?? {};
  const query = asString(task.query);
  const fingerprint = asString(task.fingerprint);
  if (!query || !fingerprint) return null;
  return {
    id: row.id,
    miniappKey: asString(task.miniappKey),
    destinationKey: asString(task.destinationKey),
    contractKey: asString(task.contractKey),
    coverageGoalId: asString(task.coverageGoalId),
    query,
    locale: asString(task.locale) || undefined,
    expectedEvidenceType: asString(task.expectedEvidenceType),
    priority: asNumber(task.priority),
    status: asString(task.status) || "QUEUED",
    fingerprint,
    blockedDomains: asStringArray(task.blockedDomains),
    attemptCount: asNumber(task.attemptCount),
    timeoutMs: asNumber(task.timeoutMs, 15000),
    createdFrom: {
      datacardIds: asStringArray(createdFrom.datacardIds),
      flashcardIds: asStringArray(createdFrom.flashcardIds),
      memoryIds: asStringArray(createdFrom.memoryIds),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim()
    || resolveDestinationKeyForVisitorWithHint(visitorKey, undefined);
  if (!destinationKey) {
    return NextResponse.json({ ok: true, visitorKey, sourceCardInventoryIsSuccess: false, queuedCount: 0, tasks: [] });
  }
  try {
    const instance = await prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey, isActive: true },
      select: { id: true },
    });
    if (!instance) {
      return NextResponse.json({ ok: true, visitorKey, sourceCardInventoryIsSuccess: false, queuedCount: 0, tasks: [] });
    }
    const rows = await prisma.destinationSourceDocument.findMany({
      where: {
        companyId,
        destinationInstanceId: instance.id,
        sourceType: "miniapp_research_task",
      },
      select: {
        id: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ fetchedAt: "desc" }, { updatedAt: "desc" }],
      take: 500,
    });
    const tasks = rows.map(readTask).filter((task): task is NonNullable<ReturnType<typeof readTask>> => Boolean(task));
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
