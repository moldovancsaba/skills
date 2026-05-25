import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { buildTaskcardCsv, buildTaskcardCsvFilename } from "@/lib/taskcard-csv";

export const dynamic = "force-dynamic";

function parseScope(value: string | null): "planning" | "checklist" {
  return value === "checklist" ? "checklist" : "planning";
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const archived = request.nextUrl.searchParams.get("archived") === "true";
  const scope = parseScope(request.nextUrl.searchParams.get("scope"));

  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const where: Record<string, unknown> = { companyId };

  if (archived) {
    where.OR = [{ activityState: "ARCHIVED" }, { processingStatus: "DECLINED" }];
  } else if (scope === "checklist") {
    where.processingStatus = { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] };
    where.activityState = { in: ["ACTIVE", "STALE"] };
    where.kanbanColumn = "CHECKLIST";
    where.scheduledDate = { lte: new Date() };
  } else {
    where.processingStatus = { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] };
    where.activityState = { in: ["ACTIVE", "STALE"] };
  }

  const rows = await prisma.checklistTask.findMany({
    where,
    select: {
      publicId: true,
      title: true,
      description: true,
      kanbanColumn: true,
      processingStatus: true,
      activityState: true,
      candidateState: true,
      status: true,
      impact: true,
      confidence: true,
      confidenceScore: true,
      ease: true,
      iceScore: true,
      qualityScore: true,
      urgencyScore: true,
      freshnessScore: true,
      scheduledDate: true,
      createdAt: true,
      updatedAt: true,
      generatedAt: true,
      hashtags: true,
      userAnnotation: true,
      evaluationReason: true,
      departmentKey: true,
    },
    orderBy:
      archived || scope === "planning"
        ? [
            { kanbanColumn: "asc" },
            { sortOrder: "asc" },
            { iceScore: "desc" },
            { publicId: "asc" },
          ]
        : [
            { iceScore: "desc" },
            { confidenceScore: "desc" },
            { updatedAt: "desc" },
            { publicId: "asc" },
          ],
  });

  const csv = buildTaskcardCsv(rows);
  const filename = buildTaskcardCsvFilename({
    companyName: company.name,
    scope,
    archived,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

