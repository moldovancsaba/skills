import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySuperAdmin } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;

    const [
      companyCount,
      flashcardProcessingStats,
      flashcardActivityStats,
      nbaProcessingStats,
      nbaActivityStats,
      conflictCount,
      workerReports,
      topCompanies,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.flashcard.groupBy({
        by: ['processingStatus'],
        _count: { _all: true },
      }),
      prisma.flashcard.groupBy({
        by: ['activityState'],
        _count: { _all: true },
      }),
      prisma.nBAItem.groupBy({
        by: ['processingStatus'],
        _count: { _all: true },
      }),
      prisma.nBAItem.groupBy({
        by: ['activityState'],
        _count: { _all: true },
      }),
      prisma.flashcardCorrection.count({
        where: { note: { contains: "IQ CONFLICT" } },
      }),
      prisma.workerReport.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.flashcard.groupBy({
        by: ['companyId'],
        _count: { _all: true },
        orderBy: { _count: { companyId: 'desc' } },
        take: 10,
      }),
    ]);

    // Enrich top companies with names
    const enrichedCompanies = await Promise.all(
      topCompanies.map(async (item) => {
        const company = await prisma.company.findUnique({
          where: { id: item.companyId },
          select: { name: true },
        });
        return {
          id: item.companyId,
          name: company?.name || 'Unknown',
          count: item._count._all,
        };
      })
    );

    const synthesisProgress = await prisma.globalSetting.findUnique({
      where: { key: "core_synthesis_progress" },
    });

    const stats = {
      global: {
        companies: companyCount,
        flashcards: {
          processing: flashcardProcessingStats.reduce((acc, curr) => ({ ...acc, [curr.processingStatus]: curr._count._all }), {} as any),
          activity: flashcardActivityStats.reduce((acc, curr) => ({ ...acc, [curr.activityState]: curr._count._all }), {} as any),
        },
        tasks: {
          processing: nbaProcessingStats.reduce((acc, curr) => ({ ...acc, [curr.processingStatus]: curr._count._all }), {} as any),
          activity: nbaActivityStats.reduce((acc, curr) => ({ ...acc, [curr.activityState]: curr._count._all }), {} as any),
        },
        conflicts: conflictCount,
      },
      yieldByCompany: enrichedCompanies,
      workerReports: workerReports.map(r => ({
        id: r.id,
        type: r.type,
        data: r.data as any,
        createdAt: r.createdAt,
      })),
      synthesis: (synthesisProgress?.value as any) || null,
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
