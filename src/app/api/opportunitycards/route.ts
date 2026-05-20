import { NextRequest, NextResponse } from "next/server";
import { ChecklistKanbanColumn, DepartmentKey, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { verifyMembership } from "@/lib/permissions";
import { buildOpportunityFingerprint, buildOpportunityLearningAnnotation, SALES_DEPARTMENT_KEY } from "@/lib/opportunitycards";
import { nextOpportunityPublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { getManualLaneCooldownUntil } from "@/lib/planner-contract";
import { sanitizeOptionalUserFacingText } from "@/lib/ui-utils";
import { markCompanyPipelineTopologyDirty } from "@/lib/pipeline-queue";

export const dynamic = "force-dynamic";

function buildManualLaneOverrideData(column: ChecklistKanbanColumn, actorId: string, now = new Date()) {
  return {
    manualLaneOverrideAt: now,
    manualLaneCooldownUntil: getManualLaneCooldownUntil(now),
    manualLaneFloorColumn: column,
    manualLaneOverrideBy: actorId,
  };
}

function sanitizeHashtags(input: unknown) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((tag) => sanitizeOptionalUserFacingText(tag))
        .filter((tag): tag is string => Boolean(tag))
        .map((tag) => tag.replace(/^#/, "").toLowerCase()),
    ),
  );
}

function sanitizeOpportunityType(value: unknown) {
  const candidate = String(value || "").toUpperCase();
  if (candidate === "PROSPECT" || candidate === "PARTNER" || candidate === "RESELLER") {
    return candidate;
  }
  return "PROSPECT";
}

function sanitizeStringArray(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => sanitizeOptionalUserFacingText(value))
    .filter((value): value is string => Boolean(value));
}


export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const showAll = request.nextUrl.searchParams.get("all") === "true";
  const kanbanColumn = request.nextUrl.searchParams.get("kanbanColumn") ?? request.nextUrl.searchParams.get("column");
  const departmentKey = (request.nextUrl.searchParams.get("departmentKey") || SALES_DEPARTMENT_KEY) as DepartmentKey;
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const where: Prisma.OpportunitycardWhereInput = { companyId: companyId as string };
    if (departmentKey) {
      where.departmentKey = departmentKey;
    }
    if (!showAll) {
      where.activityState = { in: ["ACTIVE", "STALE"] };
    }
    if (kanbanColumn) {
      where.kanbanColumn = kanbanColumn as ChecklistKanbanColumn;
    }

    const items = await prisma.opportunitycard.findMany({
      where,
      orderBy: showAll || Boolean(kanbanColumn)
        ? [
            { sortOrder: "asc" },
            { iceScore: "desc" },
            { confidenceScore: "desc" },
            { publicId: "asc" },
          ]
        : [
            { iceScore: "desc" },
            { confidenceScore: "desc" },
            { updatedAt: "desc" },
            { publicId: "asc" },
          ],
      include: {
        feedback: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
    return NextResponse.json(items);
  } catch (error) {
    console.error("[API:OPPORTUNITYCARDS] GET failure:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const auth = await verifyMembership(request, data.companyId);
    if (auth.error) return auth.error;

    if (data.mode === "MINE") {
      await markCompanyPipelineTopologyDirty(prisma, data.companyId, "manual-opportunity-mine");
      await recordInteractionEventFromRequest(request, {
        companyId: data.companyId,
        surface: "sales",
        interactionType: "OPPORTUNITY_MINE",
        entityType: "OPPORTUNITYCARD",
        entityId: data.companyId,
        payload: { queued: true },
        teachingWeight: 60,
      });
      return NextResponse.json({
        success: true,
        queued: true,
        message: "Sales opportunitycard mining is queued for the local AI worker.",
      }, { status: 202 });
    }

    const companyName = sanitizeOptionalUserFacingText(data.companyName) || sanitizeOptionalUserFacingText(data.title) || "Opportunitycard";
    const title = sanitizeOptionalUserFacingText(data.title) || companyName;
    const body = sanitizeOptionalUserFacingText(data.body) || "Sales opportunity candidate.";
    const website = sanitizeOptionalUserFacingText(data.website);
    const opportunityType = sanitizeOpportunityType(data.opportunityType);
    const hashtags = sanitizeHashtags(data.hashtags);
    const salesGeographies = sanitizeStringArray(data.salesGeographies);
    const fingerprint = buildOpportunityFingerprint({
      website,
      companyName,
      opportunityType,
    });

    const created = await prisma.$transaction(async (tx) => {
      const publicId = await nextOpportunityPublicId(tx);
      return tx.opportunitycard.create({
        data: {
          publicId,
          companyId: data.companyId,
          companyName,
          title,
          body,
          website,
          linkedinUrl: sanitizeOptionalUserFacingText(data.linkedinUrl),
          instagramUrl: sanitizeOptionalUserFacingText(data.instagramUrl),
          facebookUrl: sanitizeOptionalUserFacingText(data.facebookUrl),
          xUrl: sanitizeOptionalUserFacingText(data.xUrl),
          location: sanitizeOptionalUserFacingText(data.location),
          coreOffer: sanitizeOptionalUserFacingText(data.coreOffer),
          financialBackground: sanitizeOptionalUserFacingText(data.financialBackground),
          fitRationale: sanitizeOptionalUserFacingText(data.fitRationale),
          opportunityType: opportunityType as never,
          departmentKey: "SALES",
          confidence: Number(data.confidence || 0),
          confidenceScore: Number(data.confidenceScore || 0),
          impact: Number(data.impact || 0),
          weight: Number(data.weight || 0),
          iceScore: Number(data.iceScore || 0),
          hashtags,
          salesGeographies,
          contactInfo: data.contactInfo && typeof data.contactInfo === "object" && !Array.isArray(data.contactInfo)
            ? data.contactInfo as Prisma.InputJsonValue
            : null,
          scoreProfile: null,
          sourceFlashcardIds: Array.isArray(data.sourceFlashcardIds) ? data.sourceFlashcardIds : [],
          generatedFromIds: Array.isArray(data.generatedFromIds) ? data.generatedFromIds : [],
          fingerprint,
          processingStatus: "DRAFT",
          activityState: "STALE",
          kanbanColumn: (typeof data.kanbanColumn === "string" ? data.kanbanColumn : "IDEABANK") as ChecklistKanbanColumn,
          generatedAt: new Date(),
          refreshedAt: new Date(),
        },
      });
    }, TRANSACTION_SETTINGS);
    await markCompanyPipelineTopologyDirty(prisma, data.companyId, "opportunitycard-create");

    await recordInteractionEventFromRequest(request, {
      companyId: data.companyId,
      surface: "sales",
      interactionType: "OPPORTUNITYCARD_CREATE",
      entityType: "OPPORTUNITYCARD",
      entityId: created.id,
      afterState: {
        companyName: created.companyName,
        opportunityType: created.opportunityType,
        iceScore: created.iceScore,
        kanbanColumn: created.kanbanColumn,
      },
      teachingWeight: 50,
    });

    return NextResponse.json(created);
  } catch (error) {
    console.error("[API:OPPORTUNITYCARDS] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const data = await request.json();
    const existing = await prisma.opportunitycard.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    if (Array.isArray(data.destinationColumnOrderIds) && data.destinationColumn) {
      const destinationColumn = String(data.destinationColumn) as ChecklistKanbanColumn;
      const sourceColumn = (data.sourceColumn ? String(data.sourceColumn) : destinationColumn) as ChecklistKanbanColumn;
      const actorId = auth.membership.id || auth.session.email || "webapp-user";
      const destinationColumnOrderIds = data.destinationColumnOrderIds.filter((value: unknown): value is string => typeof value === "string");
      const sourceColumnOrderIds = Array.isArray(data.sourceColumnOrderIds)
        ? data.sourceColumnOrderIds.filter((value: unknown): value is string => typeof value === "string")
        : [];
      const overrideTimestamp = new Date();

      await prisma.$transaction(async (tx) => {
        for (const [index, itemId] of destinationColumnOrderIds.entries()) {
          await tx.opportunitycard.update({
            where: { id: itemId },
            data: {
              kanbanColumn: destinationColumn,
              sortOrder: index - destinationColumnOrderIds.length,
              updatedAt: new Date(),
              ...(itemId === id ? buildManualLaneOverrideData(destinationColumn, actorId, overrideTimestamp) : {}),
            },
          });
        }
        for (const [index, itemId] of sourceColumnOrderIds.entries()) {
          await tx.opportunitycard.update({
            where: { id: itemId },
            data: {
              kanbanColumn: sourceColumn,
              sortOrder: index - sourceColumnOrderIds.length,
              updatedAt: new Date(),
              ...(itemId === id ? buildManualLaneOverrideData(sourceColumn, actorId, overrideTimestamp) : {}),
            },
          });
        }
      }, TRANSACTION_SETTINGS);

      const updated = await prisma.opportunitycard.findUnique({ where: { id } });
      await markCompanyPipelineTopologyDirty(prisma, existing.companyId, "opportunitycard-reorder");
      return NextResponse.json(updated);
    }

    const action = typeof data.action === "string" ? data.action : null;
    if (action) {
      const annotation = sanitizeOptionalUserFacingText(data.annotation);
      const declineReason = typeof data.declineReason === "string" ? data.declineReason : undefined;
      await prisma.opportunitycardFeedback.create({
        data: {
          companyId: existing.companyId,
          opportunitycardId: existing.id,
          action: action as never,
          declineReason: declineReason as never,
          annotation,
          modifiedCompanyName: sanitizeOptionalUserFacingText(data.companyName),
          modifiedTitle: sanitizeOptionalUserFacingText(data.title),
          modifiedBody: sanitizeOptionalUserFacingText(data.body),
          modifiedWebsite: sanitizeOptionalUserFacingText(data.website),
          modifiedLocation: sanitizeOptionalUserFacingText(data.location),
          modifiedCoreOffer: sanitizeOptionalUserFacingText(data.coreOffer),
          modifiedFitRationale: sanitizeOptionalUserFacingText(data.fitRationale),
          actedBy: auth.session.email ?? "webapp-user",
        },
      });

      const nextData: Prisma.OpportunitycardUpdateInput = {
        lastActionAt: new Date(),
        userAnnotation: buildOpportunityLearningAnnotation({ declineReason, annotation }),
        updatedAt: new Date(),
      };

      if (action === "DECLINE") {
        nextData.processingStatus = "DECLINED";
        nextData.feedbackScore = Number(existing.feedbackScore || 0) - 1;
        nextData.declineCount = { increment: 1 };
        nextData.evaluationReason = declineReason || annotation || existing.evaluationReason;
      } else if (action === "ACCEPT") {
        nextData.processingStatus = "ACCEPTED";
        nextData.feedbackScore = Number(existing.feedbackScore || 0) + 1;
        nextData.acceptanceCount = { increment: 1 };
      } else if (action === "PIN") {
        nextData.kanbanColumn = "CHECKLIST";
      } else if (action === "REQUEST_REFRESH") {
        nextData.activityState = "STALE";
      } else if (action === "ARCHIVE") {
        nextData.activityState = "ARCHIVED";
      } else if (action === "MODIFY") {
        Object.assign(nextData, {
          companyName: sanitizeOptionalUserFacingText(data.companyName) ?? existing.companyName,
          title: sanitizeOptionalUserFacingText(data.title) ?? existing.title,
          body: sanitizeOptionalUserFacingText(data.body) ?? existing.body,
          website: sanitizeOptionalUserFacingText(data.website) ?? existing.website,
          linkedinUrl: sanitizeOptionalUserFacingText(data.linkedinUrl) ?? existing.linkedinUrl,
          instagramUrl: sanitizeOptionalUserFacingText(data.instagramUrl) ?? existing.instagramUrl,
          facebookUrl: sanitizeOptionalUserFacingText(data.facebookUrl) ?? existing.facebookUrl,
          xUrl: sanitizeOptionalUserFacingText(data.xUrl) ?? existing.xUrl,
          location: sanitizeOptionalUserFacingText(data.location) ?? existing.location,
          coreOffer: sanitizeOptionalUserFacingText(data.coreOffer) ?? existing.coreOffer,
          financialBackground: sanitizeOptionalUserFacingText(data.financialBackground) ?? existing.financialBackground,
          fitRationale: sanitizeOptionalUserFacingText(data.fitRationale) ?? existing.fitRationale,
          opportunityType: sanitizeOpportunityType(data.opportunityType ?? existing.opportunityType) as never,
          hashtags: Array.isArray(data.hashtags) ? sanitizeHashtags(data.hashtags) : existing.hashtags,
          salesGeographies: Array.isArray(data.salesGeographies) ? sanitizeStringArray(data.salesGeographies) : existing.salesGeographies,
          contactInfo: data.contactInfo && typeof data.contactInfo === "object" && !Array.isArray(data.contactInfo)
            ? data.contactInfo as Prisma.InputJsonValue
            : existing.contactInfo,
          refreshedAt: new Date(),
          processingStatus: "REVIEW",
          activityState: "STALE",
          feedbackScore: Number(existing.feedbackScore || 0) + 0.5,
        });
      }

      const updated = await prisma.opportunitycard.update({
        where: { id },
        data: nextData,
      });
      await markCompanyPipelineTopologyDirty(prisma, existing.companyId, `opportunitycard-action:${action.toLowerCase()}`);

      await recordOutcomeEvent({
        companyId: existing.companyId,
        actorType: "USER",
        entityType: "OPPORTUNITYCARD",
        entityId: existing.id,
        outcomeType: action,
        outcomeValue: declineReason ?? action,
        annotation: annotation ?? undefined,
        teachingWeight: action === "DECLINE" ? 100 : action === "MODIFY" ? 95 : 80,
      });

      return NextResponse.json(updated);
    }

    const updated = await prisma.opportunitycard.update({
      where: { id },
      data: {
        companyName: sanitizeOptionalUserFacingText(data.companyName) ?? existing.companyName,
        title: sanitizeOptionalUserFacingText(data.title) ?? existing.title,
        body: sanitizeOptionalUserFacingText(data.body) ?? existing.body,
        website: sanitizeOptionalUserFacingText(data.website) ?? existing.website,
        linkedinUrl: sanitizeOptionalUserFacingText(data.linkedinUrl) ?? existing.linkedinUrl,
        instagramUrl: sanitizeOptionalUserFacingText(data.instagramUrl) ?? existing.instagramUrl,
        facebookUrl: sanitizeOptionalUserFacingText(data.facebookUrl) ?? existing.facebookUrl,
        xUrl: sanitizeOptionalUserFacingText(data.xUrl) ?? existing.xUrl,
        location: sanitizeOptionalUserFacingText(data.location) ?? existing.location,
        coreOffer: sanitizeOptionalUserFacingText(data.coreOffer) ?? existing.coreOffer,
        financialBackground: sanitizeOptionalUserFacingText(data.financialBackground) ?? existing.financialBackground,
        fitRationale: sanitizeOptionalUserFacingText(data.fitRationale) ?? existing.fitRationale,
        opportunityType: sanitizeOpportunityType(data.opportunityType ?? existing.opportunityType) as never,
        hashtags: Array.isArray(data.hashtags) ? sanitizeHashtags(data.hashtags) : existing.hashtags,
        salesGeographies: Array.isArray(data.salesGeographies) ? sanitizeStringArray(data.salesGeographies) : existing.salesGeographies,
        contactInfo: data.contactInfo && typeof data.contactInfo === "object" && !Array.isArray(data.contactInfo)
          ? data.contactInfo as Prisma.InputJsonValue
          : existing.contactInfo,
        departmentKey: data.departmentKey ?? existing.departmentKey,
        kanbanColumn: data.kanbanColumn ?? existing.kanbanColumn,
        activityState: "STALE",
        refreshedAt: new Date(),
      },
    });
    await markCompanyPipelineTopologyDirty(prisma, existing.companyId, "opportunitycard-update");
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[API:OPPORTUNITYCARDS] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
