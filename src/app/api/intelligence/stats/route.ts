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
      flashcardStatusCounts,
      nbaStatusCounts,
      conflictCount,
      workerReports,
      topCompanies,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.flashcard.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.nBAItem.groupBy({
        by: ['status'],
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

    const stats = {
      global: {
        companies: companyCount,
        flashcards: flashcardStatusCounts.reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count._all }), {} as any),
        tasks: nbaStatusCounts.reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count._all }), {} as any),
        conflicts: conflictCount,
      },
      yieldByCompany: enrichedCompanies,
      workerReports: workerReports.map(r => ({
        id: r.id,
        type: r.type,
        data: r.data,
        createdAt: r.createdAt,
      })),
    };

    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
