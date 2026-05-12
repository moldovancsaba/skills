import { NextRequest, NextResponse } from "next/server";
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
    const data = await request.json();
    const { companyId, entityId, entityType, action, annotation, modifiedTitle, modifiedDescription, declineClass } = data;
    const sanitizedAnnotation = sanitizeOptionalUserFacingText(annotation);

    if (!companyId || !entityId || !entityType) {
      return NextResponse.json({ error: "Missing required feedback fields" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    
    const feedback = entityType === "TASK"
      ? await prisma.feedback.create({
          data: {
            nbaItemId: entityId,
            action,
            annotation: sanitizedAnnotation,
            modifiedTitle,
            modifiedDescription,
            declineClass,
            deliveryComment: action === "DELIVER" ? sanitizedAnnotation ?? undefined : undefined,
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
        action === "ACCEPT"
          ? entityType === "TASK" ? "TASK_ACCEPT" : entityType === "GOAL" ? "GOAL_REVIEW_ACCEPT" : "KNOWLEDGE_ACCEPT"
          : action === "DECLINE"
            ? entityType === "TASK" ? "TASK_DECLINE" : entityType === "GOAL" ? "GOAL_REVIEW_DECLINE" : "KNOWLEDGE_DECLINE"
            : action === "MODIFY_ACCEPT"
              ? entityType === "TASK" ? "TASK_EDIT" : entityType === "GOAL" ? "GOAL_REVIEW_EDIT" : "KNOWLEDGE_EDIT"
              : action === "DELIVER"
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
