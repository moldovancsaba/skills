import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const OLLAMA_URL = "http://127.0.0.1:11434";
const MODEL = "deepseek-r1:1.5b";

const SYSTEM_PROMPT = `You are a marketing strategist. Generate 2-4 NBA recommendations as JSON array with: title, description, impact (1-10), confidence (1-100), ease (1-10). Output ONLY JSON array.`;

function summarizeFlashcards(
  flashcards: Array<{
    publicId: number | null;
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
        `#${flashcard.publicId ?? "pending"} ${flashcard.title}`,
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
        `${action.action} on "${action.flashcard.title}"`,
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
    ] = await Promise.all([
      prisma.product.findMany({ where: { companyId } }),
      prisma.customer.findMany({ where: { companyId } }),
      prisma.competitor.findMany({ where: { companyId } }),
      prisma.flashcard.findMany({
        where: { companyId, status: "ACTIVE" },
        include: {
          sources: {
            orderBy: [{ sourcePublicId: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ weight: "desc" }, { publicId: "asc" }],
        take: 15,
      }),
      prisma.flashcardAction.findMany({
        where: { flashcard: { companyId } },
        include: {
          flashcard: {
            select: {
              publicId: true,
              title: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.nBAItem.findMany({ where: { companyId, status: "PENDING" } }),
      prisma.feedback.findMany({
        where: { nbaItem: { companyId } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const company = await prisma.company.findUnique({ where: { id: companyId } });

    const context = `# Company: ${company?.name} (${company?.industry || 'N/A'})
## Products: ${products.map(p => p.name).join(', ') || 'none'}
## Customers: ${customers.map(c => c.name).join(', ') || 'none'}  
## Competitors: ${competitors.map(c => c.name).join(', ') || 'none'}
## Flashcards:
${summarizeFlashcards(activeFlashcards)}
## Flashcard Actions:
${summarizeFlashcardActions(flashcardActions)}
## Feedback: ${feedback.map(f => `${f.action}: ${f.annotation || ''}`).join('; ') || 'none'}

Generate 2-4 marketing NBA recommendations as JSON array:`;

    const recommendations = await callLocalAI(context);

    const created = [];
    for (const rec of recommendations || []) {
      if (!rec.title) continue;
      if (existingNBA.some(n => n.title === rec.title)) continue;

      const iceScore = (rec.impact * (rec.confidence / 100) * rec.ease * 10);

      const item = await prisma.nBAItem.create({
        data: {
          companyId,
          title: rec.title,
          description: rec.description || "",
          impact: rec.impact || 5,
          confidence: rec.confidence || 50,
          ease: rec.ease || 5,
          iceScore,
          status: "PENDING",
          createdBy: "local-ai",
        },
      });
      created.push(item);
    }

    return NextResponse.json({ items: created });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
