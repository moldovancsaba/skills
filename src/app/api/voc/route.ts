import { NextRequest, NextResponse } from "next/server";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { buildVocThemeCandidates, normalizeVocSignalInput, summarizeVoc } from "@/lib/voc-signal-fusion";

export const dynamic = "force-dynamic";

async function recomputeVoc(companyId: string) {
  const signals = await prisma.vocSignal.findMany({
    where: { companyId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const candidates = buildVocThemeCandidates(signals);

  await prisma.$transaction([
    prisma.vocTheme.deleteMany({ where: { companyId } }),
    prisma.vocActionBrief.deleteMany({ where: { companyId } }),
  ]);

  for (const candidate of candidates) {
    const theme = await prisma.vocTheme.create({
      data: {
        companyId,
        title: candidate.title,
        summary: candidate.summary,
        rootCauseHypothesis: candidate.rootCauseHypothesis,
        affectedSegments: candidate.affectedSegments,
        signalIds: candidate.signalIds,
        supportingExcerpts: candidate.supportingExcerpts,
        sentimentMix: candidate.sentimentMix,
        trendDirection: candidate.trendDirection,
        confidence: candidate.confidence,
        impactScore: candidate.impactScore,
        recurrenceScore: candidate.recurrenceScore,
        freshnessScore: candidate.freshnessScore,
        reviewState: candidate.reviewState,
      },
    });

    await prisma.vocActionBrief.create({
      data: {
        companyId,
        themeId: theme.id,
        title: candidate.actionBrief.title,
        rootCause: candidate.actionBrief.rootCause,
        affectedSegment: candidate.actionBrief.affectedSegment,
        recommendedWork: candidate.actionBrief.recommendedWork,
        nextStepType: candidate.actionBrief.nextStepType,
        priorityScore: candidate.actionBrief.priorityScore,
        evidence: candidate.actionBrief.evidence,
      },
    });
  }

  const [themes, briefs] = await Promise.all([
    prisma.vocTheme.findMany({ where: { companyId }, orderBy: [{ confidence: "desc" }] }),
    prisma.vocActionBrief.findMany({ where: { companyId }, orderBy: [{ priorityScore: "desc" }] }),
  ]);

  return { signals, themes, briefs, summary: summarizeVoc(signals, themes, briefs) };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const [signals, themes, briefs] = await Promise.all([
    prisma.vocSignal.findMany({
      where: { companyId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    prisma.vocTheme.findMany({
      where: { companyId },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      take: 40,
    }),
    prisma.vocActionBrief.findMany({
      where: { companyId },
      orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
      take: 40,
    }),
  ]);

  return NextResponse.json({
    signals,
    themes,
    briefs,
    summary: summarizeVoc(signals, themes, briefs),
  });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const signalInput = normalizeVocSignalInput(data);
    if (!signalInput.excerpt) {
      return NextResponse.json({ error: "excerpt required" }, { status: 400 });
    }

    const signal = await prisma.vocSignal.create({
      data: {
        companyId,
        ...signalInput,
      },
    });
    const recomputed = await recomputeVoc(companyId);

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "voice-of-customer",
      interactionType: "VOC_SIGNAL_RECORDED",
      entityType: "VOC_SIGNAL",
      entityId: signal.id,
      afterState: signal,
      teachingWeight: 60,
    });

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      actorEmail: auth.session.email,
      entityType: "VOC_SIGNAL",
      entityId: signal.id,
      outcomeType: "VOC_SIGNAL_FUSED",
      outcomeValue: signal.sentiment,
      annotation: signal.title,
      payload: {
        channel: signal.channel,
        urgency: signal.urgency,
        themeCount: recomputed.themes.length,
        briefCount: recomputed.briefs.length,
      },
      teachingWeight: 60,
    });

    return NextResponse.json({
      signal,
      ...recomputed,
    });
  } catch (error) {
    console.error("[API:VoC] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
