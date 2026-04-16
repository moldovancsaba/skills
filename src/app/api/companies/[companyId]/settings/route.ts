import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { companyId: string } }
) {
  const { companyId } = params;

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        allowedLanguages: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { companyId: string } }
) {
  const { companyId } = params;

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    const data = await request.json();
    
    // Validate allowedLanguages is an array of strings
    if (data.allowedLanguages && (!Array.isArray(data.allowedLanguages) || !data.allowedLanguages.every(l => typeof l === 'string'))) {
      return NextResponse.json({ error: "Invalid allowedLanguages format" }, { status: 400 });
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        allowedLanguages: data.allowedLanguages,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
