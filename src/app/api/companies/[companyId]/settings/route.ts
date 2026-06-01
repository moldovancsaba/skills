import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { canonicalizeAllowedLanguagesForStorage } from "@/lib/language-catalog";
import {
  UNIT_CAPABILITIES_SCHEMA_VERSION,
  resolveUnitCapabilities,
} from "@/lib/intelligence-unit-capabilities";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const [company, classScoutInstance, compareInstance] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          name: true,
          allowedLanguages: true,
          workerConfig: true,
        },
      }),
      prisma.destinationInstance.findFirst({
        where: {
          companyId,
          destinationKey: "classscout",
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.destinationInstance.findFirst({
        where: {
          companyId,
          destinationKey: "compare",
          isActive: true,
        },
        select: { id: true },
      }),
    ]);

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    const capabilities = resolveUnitCapabilities({
      workerConfig: company.workerConfig,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });

    return NextResponse.json({
      ...company,
      unitCapabilities: capabilities.normalized,
      capabilitiesVersion: capabilities.schemaVersion,
      capabilitiesSource: capabilities.source,
      capabilitiesEnvelopeVersion: capabilities.sourceEnvelopeVersion,
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
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    const dataRaw = await request.json().catch(() => ({}));
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = dataRaw as Record<string, any>;
    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        allowedLanguages: true,
        workerConfig: true,
      },
    });
    const [classScoutInstance, compareInstance] = await Promise.all([
      prisma.destinationInstance.findFirst({
        where: {
          companyId,
          destinationKey: "classscout",
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.destinationInstance.findFirst({
        where: {
          companyId,
          destinationKey: "compare",
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
    
    // Validate allowedLanguages is an array of strings
    const hasLanguageUpdate = Array.isArray(data.allowedLanguages);
    const hasCapabilityUpdate = Boolean(data.unitCapabilities);
    if (hasCapabilityUpdate) {
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-company",
        interactionType: "UNIT_CAPABILITIES_LEGACY_WRITE_BLOCKED",
        entityType: "COMPANY",
        entityId: companyId,
        payload: {
          reason: "capability-transaction-required",
          requiredEndpoint: `/api/companies/${companyId}/capabilities/transaction`,
        },
        teachingWeight: 85,
      });
      return NextResponse.json(
        {
          error: "Unit capabilities must be updated through the capability transaction API.",
          reasonCode: "capability_transaction_required",
          requiredEndpoint: `/api/companies/${companyId}/capabilities/transaction`,
        },
        { status: 409 },
      );
    }

    if (hasLanguageUpdate && (!data.allowedLanguages.every((l: unknown) => typeof l === "string"))) {
      return NextResponse.json({ error: "Invalid allowedLanguages format" }, { status: 400 });
    }

    const normalizedAllowedLanguages = data.allowedLanguages
      ? canonicalizeAllowedLanguagesForStorage(data.allowedLanguages as string[])
      : undefined;

      const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        allowedLanguages: normalizedAllowedLanguages,
      },
    });

    if (hasLanguageUpdate) {
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
    }

    const nextCapabilities = resolveUnitCapabilities({
      workerConfig: updated.workerConfig,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });

    return NextResponse.json({
      ...updated,
      unitCapabilities: nextCapabilities.normalized,
      capabilitiesVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      allowedLanguages: canonicalizeAllowedLanguagesForStorage(updated.allowedLanguages ?? []),
      capabilitiesValidation: null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
