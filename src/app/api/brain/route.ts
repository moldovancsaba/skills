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

interface TemplateStats {
  accepted: number;
  declined: number;
  avgIceAdjustment: number;
}

function calculateLearningAdjustments(
  nbaItems: any[],
  templates: typeof NBA_TEMPLATES
): Record<string, { confidenceBoost: number; impactBoost: number; shouldSkip: boolean }> {
  const adjustments: Record<string, { confidenceBoost: number; impactBoost: number; shouldSkip: boolean }> = {};

  templates.forEach(template => {
    const title = template.title;
    const matchingItems = nbaItems.filter((item: any) => item.title === title);
    
    if (matchingItems.length === 0) {
      adjustments[title] = { confidenceBoost: 0, impactBoost: 0, shouldSkip: false };
      return;
    }

    const accepted = matchingItems.filter((item: any) => item.status === "ACCEPTED").length;
    const declined = matchingItems.filter((item: any) => item.status === "DECLINED").length;
    const total = accepted + declined;

    if (total === 0) {
      adjustments[title] = { confidenceBoost: 0, impactBoost: 0, shouldSkip: false };
      return;
    }

    const acceptanceRate = accepted / total;

    // If consistently declined (0% acceptance with 2+ instances), skip it
    const shouldSkip = acceptanceRate === 0 && total >= 2;

    // Adjust confidence based on acceptance rate
    // High acceptance -> boost confidence, low acceptance -> reduce it
    const confidenceBoost = Math.round((acceptanceRate - 0.5) * 20); // Range: -10 to +10

    // Adjust impact based on acceptance rate
    const impactBoost = Math.round((acceptanceRate - 0.5) * 2); // Range: -1 to +1

    adjustments[title] = { confidenceBoost, impactBoost, shouldSkip };
  });

  return adjustments;
}

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();
    
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const [products, customers, competitors, existingNBA, allNBAHistory] = await Promise.all([
      prisma.product.findMany({ where: { companyId } }),
      prisma.customer.findMany({ where: { companyId } }),
      prisma.competitor.findMany({ where: { companyId } }),
      prisma.nBAItem.findMany({ 
        where: { companyId, status: "PENDING" },
        orderBy: { iceScore: "desc" },
        take: 10
      }),
      prisma.nBAItem.findMany({ 
        where: { companyId, status: { in: ["ACCEPTED", "DECLINED"] } },
      }),
    ]);

    const totalItems = products.length + customers.length + competitors.length;
    const hasProducts = products.length > 0;
    const hasCustomers = customers.length > 0;
    const hasCompetitors = competitors.length > 0;

    // Calculate learning adjustments based on historical feedback
    const adjustments = calculateLearningAdjustments(allNBAHistory, NBA_TEMPLATES);

    const created: any[] = [];

    for (const template of NBA_TEMPLATES) {
      const { trigger, ...rec } = template;
      
      if (trigger.hasProducts && !hasProducts) continue;
      if (trigger.hasCustomers && !hasCustomers) continue;
      if (trigger.hasCompetitors && !hasCompetitors) continue;
      if (trigger.minItems && totalItems < trigger.minItems) continue;

      // Skip templates that are consistently declined
      const adjustment = adjustments[rec.title];
      if (adjustment?.shouldSkip) continue;

      const isDuplicate = existingNBA.some(n => n.title === rec.title);
      if (isDuplicate) continue;

      // Apply learning adjustments to ICE parameters
      const adjustedConfidence = Math.max(10, Math.min(100, rec.confidence + (adjustment?.confidenceBoost || 0)));
      const adjustedImpact = Math.max(1, Math.min(10, rec.impact + (adjustment?.impactBoost || 0)));
      
      const iceScore = (adjustedImpact * (adjustedConfidence / 100) * rec.ease * 10);
      
      const item = await prisma.nBAItem.create({
        data: {
          companyId,
          title: rec.title,
          description: rec.description,
          impact: adjustedImpact,
          confidence: adjustedConfidence,
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
      items: created,
      learningApplied: allNBAHistory.length > 0,
      adjustments: Object.entries(adjustments)
        .filter(([, v]) => v.confidenceBoost !== 0 || v.impactBoost !== 0)
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}