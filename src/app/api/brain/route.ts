import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const NBA_TEMPLATES = [
  {
    trigger: { hasProducts: true, hasCustomers: false },
    title: "Add customer data",
    description: "Add your first customers to get personalized recommendations. Customer segments help the AI understand your target market.",
    impact: 8, confidence: 90, ease: 9
  },
  {
    trigger: { hasProducts: true, hasCustomers: true, hasCompetitors: false },
    title: "Add competitor data",
    description: "Add your main competitors to enable competitive analysis and market positioning recommendations.",
    impact: 7, confidence: 85, ease: 8
  },
  {
    trigger: { hasProducts: true, hasCustomers: true, hasCompetitors: true, minItems: 3 },
    title: "Launch email marketing campaign",
    description: "Start an email sequence to nurture your customer database and increase conversions.",
    impact: 9, confidence: 75, ease: 7
  },
  {
    trigger: { hasProducts: true, hasCustomers: true, hasCompetitors: true, minItems: 5 },
    title: "Create referral program",
    description: "Launch a customer referral program to leverage your existing customer relationships for growth.",
    impact: 8, confidence: 70, ease: 6
  },
  {
    trigger: { hasProducts: true, hasCustomers: true, hasCompetitors: true, minItems: 8 },
    title: "Run A/B test on pricing",
    description: "Test different pricing tiers to optimize revenue and conversion rates.",
    impact: 9, confidence: 65, ease: 5
  },
  {
    trigger: { hasProducts: true, hasCustomers: true, hasCompetitors: true, minItems: 10 },
    title: "Publish case study",
    description: "Create a case study showcasing customer success to build credibility.",
    impact: 7, confidence: 80, ease: 8
  },
  {
    trigger: { hasProducts: true, hasCustomers: true, hasCompetitors: true, minItems: 15 },
    title: "Launch partner program",
    description: "Establish strategic partnerships to expand reach and credibility.",
    impact: 9, confidence: 60, ease: 4
  },
];

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();
    
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const [products, customers, competitors, existingNBA] = await Promise.all([
      prisma.product.findMany({ where: { companyId } }),
      prisma.customer.findMany({ where: { companyId } }),
      prisma.competitor.findMany({ where: { companyId } }),
      prisma.nBAItem.findMany({ 
        where: { companyId, status: "PENDING" },
        orderBy: { iceScore: "desc" },
        take: 10
      }),
    ]);

    const totalItems = products.length + customers.length + competitors.length;
    const hasProducts = products.length > 0;
    const hasCustomers = customers.length > 0;
    const hasCompetitors = competitors.length > 0;

    const created: any[] = [];

    for (const template of NBA_TEMPLATES) {
      const { trigger, ...rec } = template;
      
      if (trigger.hasProducts && !hasProducts) continue;
      if (trigger.hasCustomers && !hasCustomers) continue;
      if (trigger.hasCompetitors && !hasCompetitors) continue;
      if (trigger.minItems && totalItems < trigger.minItems) continue;

      const isDuplicate = existingNBA.some(n => n.title === rec.title);
      if (isDuplicate) continue;

      const iceScore = (rec.impact * (rec.confidence / 100) * rec.ease * 10);
      
      const item = await prisma.nBAItem.create({
        data: {
          companyId,
          title: rec.title,
          description: rec.description,
          impact: rec.impact,
          confidence: rec.confidence,
          ease: rec.ease,
          iceScore,
          status: "PENDING",
          createdBy: "brain",
        },
      });
      
      created.push(item);
    }

    return NextResponse.json({ 
      message: `Brain generated ${created.length} recommendations`,
      items: created 
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}