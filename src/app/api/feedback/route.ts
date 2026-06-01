import { NextRequest, NextResponse } from "next/server";
import { ActionType, DeclineClass } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { verifyMembership } from "@/lib/permissions";
import { sanitizeOptionalUserFacingText } from "@/lib/ui-utils";

/**
 * Strategic feedback API.
 *
 * Persists human feedback for goal, task, and knowledge entities in the
 * shared strategic feedback stream without letting worker updates overwrite it.
 */

function normalizeAction(value: unknown): ActionType | null {
  if (value === ActionType.ACCEPT) return ActionType.ACCEPT;
  if (value === ActionType.DECLINE) return ActionType.DECLINE;
  if (value === ActionType.MODIFY_ACCEPT) return ActionType.MODIFY_ACCEPT;
  if (value === ActionType.DELIVER) return ActionType.DELIVER;
  if (value === ActionType.COMMENT) return ActionType.COMMENT;
  return null;
}

function normalizeDeclineClass(value: unknown): DeclineClass | undefined {
  if (typeof value !== "string") return undefined;
  return Object.values(DeclineClass).includes(value as DeclineClass) ? value as DeclineClass : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const feedbacks = await prisma.strategicFeedback.findMany({
      where: { 
        companyId,
        processedByAI: false 
      },
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json(feedbacks);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = payload as {
      companyId?: string;
      entityId?: string;
      entityType?: string;
      action?: string;
      annotation?: unknown;
      modifiedTitle?: unknown;
      modifiedDescription?: unknown;
      declineClass?: unknown;
    };
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    const entityId = typeof data.entityId === "string" ? data.entityId : "";
    const entityType = typeof data.entityType === "string" ? data.entityType : "";
    const action = normalizeAction(data.action);
    const modifiedTitle = typeof data.modifiedTitle === "string" ? data.modifiedTitle : undefined;
    const modifiedDescription = typeof data.modifiedDescription === "string" ? data.modifiedDescription : undefined;
    const declineClass = normalizeDeclineClass(data.declineClass);
    const sanitizedAnnotation = sanitizeOptionalUserFacingText(
      typeof data.annotation === "string" ? data.annotation : undefined,
    );

    if (!companyId || !entityId || !entityType || !action) {
      return NextResponse.json({ error: "Missing required feedback fields" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    
    const feedback = entityType === "TASK"
      ? await prisma.feedback.create({
          data: {
            checklistTaskId: entityId,
            action,
            annotation: sanitizedAnnotation,
            modifiedTitle,
            modifiedDescription,
            declineClass,
            deliveryComment: action === ActionType.DELIVER ? sanitizedAnnotation ?? undefined : undefined,
            actorId: auth.session.email ?? undefined,
          },
        })
      : await prisma.strategicFeedback.create({
          data: {
            companyId,
            entityId,
            entityType,
            action,
            annotation: sanitizedAnnotation,
            modifiedTitle,
            modifiedDescription,
            declineClass,
            processedByAI: false,
          },
        });

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: entityType === "TASK" ? "checklist" : entityType === "GOAL" ? "goals" : "knowmore",
      interactionType:
        action === ActionType.ACCEPT
          ? entityType === "TASK" ? "TASK_ACCEPT" : entityType === "GOAL" ? "GOAL_REVIEW_ACCEPT" : "KNOWLEDGE_ACCEPT"
          : action === ActionType.DECLINE
            ? entityType === "TASK" ? "TASK_DECLINE" : entityType === "GOAL" ? "GOAL_REVIEW_DECLINE" : "KNOWLEDGE_DECLINE"
            : action === ActionType.MODIFY_ACCEPT
              ? entityType === "TASK" ? "TASK_EDIT" : entityType === "GOAL" ? "GOAL_REVIEW_EDIT" : "KNOWLEDGE_EDIT"
              : action === ActionType.DELIVER
                ? "TASK_DELIVER"
                : "FEEDBACK_COMMENT",
      entityType,
      entityId,
      payload: {
        annotation: sanitizedAnnotation,
        modifiedTitle,
        modifiedDescription,
        declineClass,
        action,
      },
      teachingWeight: action === "MODIFY_ACCEPT" || action === "DELIVER" ? 100 : action === "ACCEPT" ? 90 : action === "DECLINE" ? 95 : 60,
    });

    await recordOutcomeEvent({
      companyId,
      actorType: "USER",
      entityType,
      entityId,
      outcomeType: action,
      outcomeValue: declineClass ?? action,
      annotation: sanitizedAnnotation ?? undefined,
      payload: {
        modifiedTitle,
        modifiedDescription,
      },
      teachingWeight: action === "MODIFY_ACCEPT" || action === "DELIVER" ? 100 : action === "ACCEPT" ? 90 : action === "DECLINE" ? 95 : 60,
    });
    
    return NextResponse.json(feedback);
  } catch (error) {
    console.error("[API:Feedback] Submission failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
