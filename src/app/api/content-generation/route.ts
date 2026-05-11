import { CreativeDraftType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { recordGenerationEvent, recordInteractionEventFromRequest } from "@/lib/audit-ledger";
import { recordAiWorkloadUsage } from "@/lib/budget-governor";
import { generateContentBundle, serializeContentSection, type ContentTone } from "@/lib/content-generation";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { APP_VERSION, BRAIN_VERSION } from "@/lib/release";

export const dynamic = "force-dynamic";

const VALID_TONES = new Set<ContentTone>(["clear", "bold", "executive", "friendly", "technical"]);

function normalizeTone(value: unknown): ContentTone {
  return typeof value === "string" && VALID_TONES.has(value as ContentTone) ? value as ContentTone : "clear";
}

function compactContext(items: Array<{ title?: string | null; body?: string | null; content?: string | null; description?: string | null; entityTag?: string | null }>, limit: number) {
  return items
    .map((item) => [item.title, item.entityTag, item.description, item.body, item.content].filter(Boolean).join(": "))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function draftPayloads(companyId: string, bundle: ReturnType<typeof generateContentBundle>) {
  const emailDrafts = bundle.emailSubjectLines.map((subject, index) => ({
    companyId,
    type: CreativeDraftType.EMAIL,
    title: `Email subject ${index + 1}`,
    subject,
    content: subject,
    usageMetrics: {
      platform: "Email",
      characterLimit: 72,
      tone: bundle.tone,
      generatedBy: "content-generation",
    },
    appVersion: APP_VERSION,
    brainVersion: BRAIN_VERSION,
    promptVersion: `content-generation@${APP_VERSION}`,
  }));

  const adDrafts = bundle.adCopy.map((item) => ({
    companyId,
    type: CreativeDraftType.AD_COPY,
    title: `${item.platform} ad copy`,
    subject: item.headline,
    content: serializeContentSection(`${item.platform} Ad`, item),
    usageMetrics: {
      platform: item.platform,
      characterLimit: item.characterLimit,
      tone: bundle.tone,
      generatedBy: "content-generation",
    },
    appVersion: APP_VERSION,
    brainVersion: BRAIN_VERSION,
    promptVersion: `content-generation@${APP_VERSION}`,
  }));

  const socialDrafts = bundle.socialPosts.map((item) => ({
    companyId,
    type: item.platform === "LinkedIn" ? CreativeDraftType.LINKEDIN : CreativeDraftType.AD_COPY,
    title: `${item.platform} social post`,
    subject: item.platform,
    content: item.post,
    usageMetrics: {
      platform: item.platform,
      characterLimit: item.characterLimit,
      tone: bundle.tone,
      generatedBy: "content-generation",
    },
    appVersion: APP_VERSION,
    brainVersion: BRAIN_VERSION,
    promptVersion: `content-generation@${APP_VERSION}`,
  }));

  const landingDraft = {
    companyId,
    type: CreativeDraftType.AD_COPY,
    title: "Landing page copy",
    subject: bundle.landingPage.heroHeadline,
    content: serializeContentSection("Landing Page", bundle.landingPage),
    usageMetrics: {
      platform: "Landing Page",
      tone: bundle.tone,
      generatedBy: "content-generation",
    },
    appVersion: APP_VERSION,
    brainVersion: BRAIN_VERSION,
    promptVersion: `content-generation@${APP_VERSION}`,
  };

  return [...emailDrafts, ...adDrafts, ...socialDrafts, landingDraft];
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const drafts = await prisma.creativeDraft.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }],
    take: 30,
  });

  return NextResponse.json({ drafts });
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

    const tone = normalizeTone(data.tone);
    const campaignBrief = typeof data.campaignBrief === "string" ? data.campaignBrief.trim() : "";
    const startedAt = Date.now();
    const [company, productSources, competitorSources, goals, topics, tasks] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.source.findMany({
        where: { companyId, intelligenceType: "INTERNAL" },
        orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
        take: 8,
      }),
      prisma.source.findMany({
        where: { companyId, intelligenceType: "COMPETITOR" },
        orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
        take: 6,
      }),
      prisma.goalcard.findMany({
        where: { companyId, activityState: { in: ["ACTIVE", "STALE"] } },
        orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }),
      prisma.topic.findMany({
        where: { companyId, active: true },
        orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }),
      prisma.nBAItem.findMany({
        where: { companyId, activityState: { in: ["ACTIVE", "STALE"] } },
        orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }),
    ]);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const bundle = generateContentBundle({
      companyName: company.name,
      industry: company.industry,
      description: company.description,
      targetMarket: company.targetMarket,
      tone,
      campaignBrief,
      productContext: compactContext([
        ...productSources,
        ...topics.map((topic) => ({ title: topic.label, body: topic.notes })),
      ], 8),
      competitorContext: compactContext(competitorSources, 6),
      goalContext: compactContext([
        ...goals,
        ...tasks.map((task) => ({ title: task.title, description: task.description })),
      ], 8),
    });

    const createdDrafts = await prisma.$transaction(
      draftPayloads(companyId, bundle).map((payload) => prisma.creativeDraft.create({ data: payload })),
    );

    await recordAiWorkloadUsage({
      companyId,
      feature: "content-generation",
      jobType: "CONTENT_GENERATION_RUN",
      entityType: "CREATIVE_DRAFT_BUNDLE",
      entityId: companyId,
      workloadUnits: createdDrafts.length,
      runtimeMs: Date.now() - startedAt,
      outputTokens: JSON.stringify(bundle).length,
      valueSignal: "DRAFT_CREATED",
      metadata: {
        tone,
        campaignBriefPresent: Boolean(campaignBrief),
        draftCount: createdDrafts.length,
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "content-generation",
      interactionType: "CONTENT_GENERATION_RUN",
      entityType: "CREATIVE_DRAFT_BUNDLE",
      entityId: companyId,
      payload: {
        tone,
        campaignBrief,
        draftCount: createdDrafts.length,
      },
      teachingWeight: 55,
    });

    await recordGenerationEvent({
      companyId,
      entityType: "CREATIVE_DRAFT_BUNDLE",
      entityId: companyId,
      promptName: "content-generation",
      promptVersion: `content-generation@${APP_VERSION}`,
      modelName: "local-deterministic-template",
      inputSummary: campaignBrief || "Generated from product, competitor, goal, and topic context.",
      generatedTitle: "Marketing content bundle",
      generatedBody: JSON.stringify(bundle),
      payload: {
        tone,
        draftIds: createdDrafts.map((draft) => draft.id),
      },
      teachingWeight: 55,
    });

    return NextResponse.json({
      bundle,
      drafts: createdDrafts,
    });
  } catch (error) {
    console.error("[API:ContentGeneration] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
