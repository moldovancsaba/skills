import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const OLLAMA_URL = "http://127.0.0.1:11434";
const MODEL = "deepseek-r1:1.5b";

const SYSTEM_PROMPT = `You are a marketing strategist. Generate 2-4 NBA recommendations as JSON array with: title, description, impact (1-10), confidence (1-100), ease (1-10). Output ONLY JSON array.`;

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

    const [products, customers, competitors, existingNBA, feedback] = await Promise.all([
      prisma.product.findMany({ where: { companyId } }),
      prisma.customer.findMany({ where: { companyId } }),
      prisma.competitor.findMany({ where: { companyId } }),
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