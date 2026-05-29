import type { NextRequest } from "next/server";

import { readAppSession } from "@/lib/auth";
import { getLocalAuditPrisma } from "@/lib/local-audit-db";

type ActorContext = {
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
};

type BaseLedgerEvent = {
  companyId: string;
  teachingWeight?: number;
};

type InteractionEventInput = BaseLedgerEvent & {
  surface: string;
  interactionType: string;
  entityType?: string;
  entityId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  payload?: unknown;
  workerConsumed?: boolean;
  consumedAt?: Date | null;
  cycleRunId?: string | null;
} & ActorContext;

type DecisionEventInput = BaseLedgerEvent & {
  decisionMaker: string;
  decisionType: string;
  entityType?: string;
  entityId?: string;
  sourceEntityIds?: string[];
  beforeState?: unknown;
  afterState?: unknown;
  payload?: unknown;
  rationale?: string;
  alternatives?: unknown;
  cycleRunId?: string | null;
};

type GenerationEventInput = BaseLedgerEvent & {
  entityType: string;
  entityId?: string;
  sourceEntityIds?: string[];
  promptName?: string;
  promptVersion?: string;
  promptHash?: string;
  modelName?: string;
  modelVersion?: string;
  temperature?: number | null;
  inputSummary?: string;
  generatedTitle?: string;
  generatedBody?: string;
  variantIndex?: number | null;
  selected?: boolean;
  payload?: unknown;
  cycleRunId?: string | null;
};

type OutcomeEventInput = BaseLedgerEvent & {
  actorType: string;
  actorId?: string | null;
  actorEmail?: string | null;
  entityType: string;
  entityId: string;
  outcomeType: string;
  outcomeValue?: string;
  annotation?: string;
  beforeState?: unknown;
  afterState?: unknown;
  linkedDecisionId?: string | null;
  linkedInteractionId?: string | null;
  payload?: unknown;
  cycleRunId?: string | null;
};

function normalizeTeachingWeight(weight?: number) {
  const numeric = Number.isFinite(weight) ? Number(weight) : 30;
  return Math.max(30, Math.min(100, Math.round(numeric)));
}

async function getActorContext(request?: Request | NextRequest | null): Promise<ActorContext> {
  if (!request) {
    return {};
  }

  try {
    const session = await readAppSession(request as NextRequest);
    if (!session) {
      return {};
    }

    return {
      userEmail: session.email,
      sessionId: session.sub,
    };
  } catch {
    return {};
  }
}

export async function recordInteractionEvent(input: InteractionEventInput) {
  try {
    const prisma = getLocalAuditPrisma();
    if (!prisma) {
      return;
    }

    await prisma.interactionEvent.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? undefined,
        userEmail: input.userEmail ?? undefined,
        sessionId: input.sessionId ?? undefined,
        surface: input.surface,
        interactionType: input.interactionType,
        entityType: input.entityType ?? undefined,
        entityId: input.entityId ?? undefined,
        beforeState: input.beforeState ?? undefined,
        afterState: input.afterState ?? undefined,
        payload: input.payload ?? undefined,
        teachingWeight: normalizeTeachingWeight(input.teachingWeight),
        workerConsumed: input.workerConsumed ?? false,
        consumedAt: input.consumedAt ?? undefined,
        cycleRunId: input.cycleRunId ?? undefined,
      },
    });
  } catch (error) {
    console.error("[AUDIT] Failed to record interaction event:", error);
  }
}

export async function recordInteractionEventFromRequest(
  request: Request | NextRequest,
  input: Omit<InteractionEventInput, "userEmail" | "sessionId">,
) {
  const actor = await getActorContext(request);
  return recordInteractionEvent({
    ...input,
    ...actor,
  });
}

export async function recordDecisionEvent(input: DecisionEventInput) {
  try {
    const prisma = getLocalAuditPrisma();
    if (!prisma) {
      return;
    }

    await prisma.decisionEvent.create({
      data: {
        companyId: input.companyId,
        decisionMaker: input.decisionMaker,
        decisionType: input.decisionType,
        entityType: input.entityType ?? undefined,
        entityId: input.entityId ?? undefined,
        sourceEntityIds: input.sourceEntityIds ?? [],
        beforeState: input.beforeState ?? undefined,
        afterState: input.afterState ?? undefined,
        payload: input.payload ?? undefined,
        rationale: input.rationale ?? undefined,
        alternatives: input.alternatives ?? undefined,
        teachingWeight: normalizeTeachingWeight(input.teachingWeight),
        cycleRunId: input.cycleRunId ?? undefined,
      },
    });
  } catch (error) {
    console.error("[AUDIT] Failed to record decision event:", error);
  }
}

export async function recordGenerationEvent(input: GenerationEventInput) {
  try {
    const prisma = getLocalAuditPrisma();
    if (!prisma) {
      return;
    }

    await prisma.generationEvent.create({
      data: {
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        sourceEntityIds: input.sourceEntityIds ?? [],
        promptName: input.promptName ?? undefined,
        promptVersion: input.promptVersion ?? undefined,
        promptHash: input.promptHash ?? undefined,
        modelName: input.modelName ?? undefined,
        modelVersion: input.modelVersion ?? undefined,
        temperature: input.temperature ?? undefined,
        inputSummary: input.inputSummary ?? undefined,
        generatedTitle: input.generatedTitle ?? undefined,
        generatedBody: input.generatedBody ?? undefined,
        variantIndex: input.variantIndex ?? undefined,
        selected: input.selected ?? false,
        payload: input.payload ?? undefined,
        teachingWeight: normalizeTeachingWeight(input.teachingWeight),
        cycleRunId: input.cycleRunId ?? undefined,
      },
    });
  } catch (error) {
    console.error("[AUDIT] Failed to record generation event:", error);
  }
}

export async function recordOutcomeEvent(input: OutcomeEventInput) {
  try {
    const prisma = getLocalAuditPrisma();
    if (!prisma) {
      return;
    }

    await prisma.outcomeEvent.create({
      data: {
        companyId: input.companyId,
        actorType: input.actorType,
        actorId: input.actorId ?? undefined,
        actorEmail: input.actorEmail ?? undefined,
        entityType: input.entityType,
        entityId: input.entityId,
        outcomeType: input.outcomeType,
        outcomeValue: input.outcomeValue ?? undefined,
        annotation: input.annotation ?? undefined,
        beforeState: input.beforeState ?? undefined,
        afterState: input.afterState ?? undefined,
        linkedDecisionId: input.linkedDecisionId ?? undefined,
        linkedInteractionId: input.linkedInteractionId ?? undefined,
        payload: input.payload ?? undefined,
        teachingWeight: normalizeTeachingWeight(input.teachingWeight),
        cycleRunId: input.cycleRunId ?? undefined,
      },
    });
  } catch (error) {
    console.error("[AUDIT] Failed to record outcome event:", error);
  }
}
