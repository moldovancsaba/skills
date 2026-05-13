import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { canonicalizeAllowedLanguagesForStorage } from "@/lib/language-catalog";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;

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

    return NextResponse.json({
      ...company,
      allowedLanguages: canonicalizeAllowedLanguagesForStorage(company.allowedLanguages ?? []),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    const data = await request.json();
    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        allowedLanguages: true,
      },
    });
    
    // Validate allowedLanguages is an array of strings
    if (data.allowedLanguages && (!Array.isArray(data.allowedLanguages) || !data.allowedLanguages.every((l: unknown) => typeof l === 'string'))) {
      return NextResponse.json({ error: "Invalid allowedLanguages format" }, { status: 400 });
    }

    const normalizedAllowedLanguages = data.allowedLanguages
      ? canonicalizeAllowedLanguagesForStorage(data.allowedLanguages)
      : undefined;

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        allowedLanguages: normalizedAllowedLanguages,
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "settings-company",
      interactionType: "ALLOWED_LANGUAGES_UPDATE",
      entityType: "COMPANY",
      entityId: updated.id,
      beforeState: {
        allowedLanguages: existing?.allowedLanguages ?? [],
      },
      afterState: {
        allowedLanguages: updated.allowedLanguages,
      },
      payload: {
        previousCount: existing?.allowedLanguages?.length ?? 0,
        nextCount: updated.allowedLanguages.length,
      },
      teachingWeight: 95,
    });

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      entityType: "COMPANY",
      entityId: updated.id,
      outcomeType: "LANGUAGE_POLICY_CHANGED",
      outcomeValue: updated.allowedLanguages.join(", "),
      beforeState: {
        allowedLanguages: existing?.allowedLanguages ?? [],
      },
      afterState: {
        allowedLanguages: updated.allowedLanguages,
      },
      teachingWeight: 95,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
