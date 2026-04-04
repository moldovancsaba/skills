import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import ollama from "ollama";

const SYSTEM_PROMPT = `You are a world-class marketing strategist AI. Your job is to analyze company data and generate actionable Next Best Actions (NBA).

Generate 2-4 marketing recommendations based on the data provided. Output as JSON array with fields:
- title: short recommendation title
- description: 1-2 sentence explanation
- impact: 1-10 score (revenue/growth potential)
- confidence: 1-100% (how sure you are it will work)
- ease: 1-10 score (how easy to implement)

Output ONLY valid JSON array, no markdown, no explanation.`;

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

    let context = `# Company: ${company?.name} (${company?.industry || 'N/A'})\n`;
    context += `# Target Market: ${company?.targetMarket || 'Not specified'}\n\n`;
    
    context += `## Products (${products.length}):\n`;
    products.forEach(p => context += `- ${p.name}: ${p.description || 'No description'}\n`);
    
    context += `\n## Customers (${customers.length}):\n`;
    customers.forEach(c => context += `- ${c.name}\n`);
    
    context += `\n## Competitors (${competitors.length}):\n`;
    competitors.forEach(c => context += `- ${c.name}\n`);
    
    if (feedback.length > 0) {
      context += `\n## Past Feedback (for learning):\n`;
      feedback.forEach(f => {
        context += `- ${f.action}: ${f.annotation || 'No comment'}\n`;
      });
    } else {
      context += `\n## Past Feedback: None yet - first run\n`;
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: context + "\n\nGenerate marketing recommendations:" },
    ];

    const response = await ollama.chat({
      model: "deepseek-r1:1.5b",
      messages,
      format: "json",
    });

    let recommendations = [];
    try {
      recommendations = JSON.parse(response.message.content);
    } catch {
      const match = response.message.content.match(/\[[\s\S]*\]/);
      if (match) {
        recommendations = JSON.parse(match[0]);
      } else {
        return NextResponse.json({ 
          error: "Failed to parse AI response",
          raw: response.message.content 
        }, { status: 500 });
      }
    }

    if (!Array.isArray(recommendations)) {
      recommendations = [recommendations];
    }

    const created = [];
    for (const rec of recommendations) {
      if (!rec.title) continue;
      
      const isDuplicate = existingNBA.some(n => n.title === rec.title);
      if (isDuplicate) continue;

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

    return NextResponse.json({ 
      message: `Local AI generated ${created.length} recommendations`,
      items: created,
      model: "deepseek-r1:1.5b",
    });
  } catch (error) {
    console.error("Local AI error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}