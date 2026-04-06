import { NextRequest, NextResponse } from "next/server";
import { FlashcardKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { calculateICEScore, normalizeNBAMetrics } from "@/lib/nba-scoring";
import { nextChecklistPublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { APP_VERSION, BRAIN_VERSION, NBA_PROMPT_VERSION } from "@/lib/release";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "gemma4:e4b";

const SYSTEM_PROMPT = `You are a marketing strategist.
Generate 2-4 NBA recommendations as a JSON array.
Each object must contain: title, description, impact (1-10), confidence (1-100), ease (1-10), sourceFlashcardPublicIds (number[]).
Only reference flashcards that actually support the recommendation.
Prefer recommendations backed by accepted or modified flashcards.
Avoid recommendations based mainly on gossip cards unless no stronger evidence exists.
Output ONLY JSON array.`;

function summarizeFlashcards(
  flashcards: Array<{
    publicId: number | null;
    kind: FlashcardKind;
    title: string;
    body: string;
    confidence: number;
    impact: number;
    weight: number;
    reviewStatus: string;
    userAnnotation: string | null;
    sources: Array<{
      sourceType: string;
      sourcePublicId: number | null;
      sourceName: string;
    }>;
  }>,
) {
  if (flashcards.length === 0) {
    return "none";
  }

  return flashcards
    .map((flashcard) => {
      const sources = flashcard.sources
        .map((source) => {
          const idLabel = source.sourcePublicId ? `#${source.sourcePublicId}` : "pending";
          return `${idLabel} ${source.sourceType}:${source.sourceName}`;
        })
        .join(", ");

      return [
        `#${flashcard.publicId ?? "pending"} [${flashcard.kind}] ${flashcard.title}`,
        `[review=${flashcard.reviewStatus} confidence=${flashcard.confidence} impact=${flashcard.impact} weight=${flashcard.weight}]`,
        flashcard.body,
        flashcard.userAnnotation ? `user note: ${flashcard.userAnnotation}` : null,
        sources ? `sources: ${sources}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function summarizeFlashcardActions(
  actions: Array<{
    action: string;
    annotation: string | null;
    modifiedTitle: string | null;
    modifiedBody: string | null;
    createdAt: Date;
    flashcard: {
      publicId: number | null;
      title: string;
      kind: FlashcardKind;
    };
  }>,
) {
  if (actions.length === 0) {
    return "none";
  }

  return actions
    .map((action) => {
      return [
        `${action.createdAt.toISOString()} flashcard #${action.flashcard.publicId ?? "pending"}`,
        `[${action.flashcard.kind}] ${action.action} on "${action.flashcard.title}"`,
        action.annotation ? `comment: ${action.annotation}` : null,
        action.modifiedTitle ? `new title: ${action.modifiedTitle}` : null,
        action.modifiedBody ? `new body: ${action.modifiedBody}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

async function callLocalAI(prompt: string): Promise<any[]> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });

  const data = await res.json();
  const content = data.message?.content || "";

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const [
      products,
      customers,
      competitors,
      activeFlashcards,
      flashcardActions,
      existingNBA,
      feedback,
      company,
    ] = await Promise.all([
      prisma.product.findMany({ where: { companyId } }),
      prisma.customer.findMany({ where: { companyId } }),
      prisma.competitor.findMany({ where: { companyId } }),
      prisma.flashcard.findMany({
        where: {
          companyId,
          status: "ACTIVE",
          reviewStatus: { not: "DECLINED" },
          confidence: { gt: 50 },
        },
        include: {
          sources: {
            orderBy: [{ sourcePublicId: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [
          { weight: "desc" },
          { confidence: "desc" },
          { lastActionAt: "desc" },
          { publicId: "asc" },
        ],
        take: 24,
      }),
      prisma.flashcardAction.findMany({
        where: { flashcard: { companyId } },
        include: {
          flashcard: {
            select: {
              publicId: true,
              title: true,
              kind: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.nBAItem.findMany({ where: { companyId, status: "PENDING" } }),
      prisma.feedback.findMany({
        where: { nbaItem: { companyId } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.company.findUnique({ where: { id: companyId } }),
    ]);

    const flashcardByPublicId = new Map(
      activeFlashcards
        .filter((flashcard) => flashcard.publicId !== null)
        .map((flashcard) => [flashcard.publicId as number, flashcard]),
    );

    const context = `# Company: ${company?.name} (${company?.industry || "N/A"})
## Products: ${products.map((p) => p.name).join(", ") || "none"}
## Customers: ${customers.map((c) => c.name).join(", ") || "none"}
## Competitors: ${competitors.map((c) => c.name).join(", ") || "none"}
## Flashcards:
${summarizeFlashcards(activeFlashcards)}
## Flashcard Actions:
${summarizeFlashcardActions(flashcardActions)}
## Task Feedback: ${feedback.map((f) => `${f.action}: ${f.annotation || ""}`).join("; ") || "none"}

Generate 2-4 marketing NBA recommendations as JSON array.`;

    const recommendations = await callLocalAI(context);

    const created = [];
    for (const rec of recommendations || []) {
      if (!rec.title) continue;
      if (existingNBA.some((n) => n.title === rec.title)) continue;

      const referencedPublicIds = Array.isArray(rec.sourceFlashcardPublicIds)
        ? rec.sourceFlashcardPublicIds.filter((value: unknown) => typeof value === "number")
        : [];
      const sourceFlashcardIds = referencedPublicIds
        .map((publicId: number) => flashcardByPublicId.get(publicId)?.id)
        .filter((value: string | undefined): value is string => Boolean(value));

      const fallbackFlashcardIds = sourceFlashcardIds.length > 0
        ? sourceFlashcardIds
        : activeFlashcards.slice(0, 3).map((flashcard) => flashcard.id);

      const { impact, confidence, ease } = normalizeNBAMetrics({
        impact: Number(rec.impact) || 5,
        confidence: Number(rec.confidence) || 50,
        ease: Number(rec.ease) || 5,
      });
      const iceScore = calculateICEScore({ impact, confidence, ease });

      const item = await prisma.$transaction(async (tx) => {
        const publicId = await nextChecklistPublicId(tx);
        return tx.nBAItem.create({
          data: {
            publicId,
            companyId,
            title: rec.title,
            description: rec.description || "",
            sourceFlashcardIds: fallbackFlashcardIds,
            impact,
            confidence,
            ease,
            iceScore,
            status: "PENDING",
            createdBy: "local-ai",
            appVersion: APP_VERSION,
            brainVersion: BRAIN_VERSION,
            promptVersion: NBA_PROMPT_VERSION,
            generatedAt: new Date(),
          },
        });
      }, TRANSACTION_SETTINGS);
      created.push(item);
    }

    return NextResponse.json({ items: created });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
