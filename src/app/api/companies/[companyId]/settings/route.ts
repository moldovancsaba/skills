import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { canonicalizeAllowedLanguagesForStorage } from "@/lib/language-catalog";
import {
  UNIT_CAPABILITIES_SCHEMA_VERSION,
  type UnitCapabilityValidation,
  formatCapabilityPayload,
  normalizeUnitCapabilitiesPayloadForWrite,
  type UnitWebappProfile,
  resolveUnitCapabilities,
  type RawWorkerUnitCapabilities,
  UNIT_WEBAPP_PROFILE_DESCRIPTIONS,
} from "@/lib/intelligence-unit-capabilities";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;

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

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    const data = await request.json();
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

    if (hasLanguageUpdate && (!data.allowedLanguages.every((l: unknown) => typeof l === "string"))) {
      return NextResponse.json({ error: "Invalid allowedLanguages format" }, { status: 400 });
    }

    const normalizedAllowedLanguages = data.allowedLanguages
      ? canonicalizeAllowedLanguagesForStorage(data.allowedLanguages as string[])
      : undefined;
    const incomingCapabilities = (data.unitCapabilities ?? null) as RawWorkerUnitCapabilities | null;
    let normalizedCapabilityPayload: { profile: UnitWebappProfile; modules: Record<string, boolean> } | null = null;
    let unitCapabilityValidation: UnitCapabilityValidation | null = null;
    if (incomingCapabilities) {
      const validatedCapabilities = normalizeUnitCapabilitiesPayloadForWrite(incomingCapabilities);
      if (!validatedCapabilities.validation.isValid) {
        return NextResponse.json(
          {
            error: "Invalid unitCapabilities",
            validation: validatedCapabilities.validation,
          },
          { status: 400 },
        );
      }

      normalizedCapabilityPayload = validatedCapabilities.payload;
      unitCapabilityValidation = validatedCapabilities.validation;
    }

    const normalizedWorkerConfig = typeof existing?.workerConfig === "object" && existing?.workerConfig !== null
      ? existing.workerConfig
      : {};
    const nextWorkerConfig = normalizedCapabilityPayload
      ? ({
          ...(typeof normalizedWorkerConfig === "object" ? normalizedWorkerConfig as Record<string, unknown> : {}),
          unitCapabilities: formatCapabilityPayload(normalizedCapabilityPayload),
          updatedBy: "settings-ui",
        } as Record<string, unknown>)
      : normalizedWorkerConfig;

      const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        allowedLanguages: normalizedAllowedLanguages,
        workerConfig: nextWorkerConfig as Prisma.JsonValue,
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

    if (hasCapabilityUpdate) {
      const previousCapabilities = resolveUnitCapabilities({
        workerConfig: existing?.workerConfig,
        hasClassScoutDestination: Boolean(classScoutInstance),
        hasCompareDestination: Boolean(compareInstance),
      });
      const nextCapabilities = resolveUnitCapabilities({
        workerConfig: updated.workerConfig,
        hasClassScoutDestination: Boolean(classScoutInstance),
        hasCompareDestination: Boolean(compareInstance),
      });
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-company",
        interactionType: "UNIT_SURFACE_UPDATE",
        entityType: "COMPANY",
        entityId: updated.id,
        beforeState: {
          unitCapabilities: previousCapabilities,
        },
        afterState: {
          unitCapabilities: nextCapabilities,
        },
        payload: {
          profileDescription: UNIT_WEBAPP_PROFILE_DESCRIPTIONS[nextCapabilities.profile],
          profileValidation:
            (unitCapabilityValidation?.warnings ?? []).length > 0
              ? unitCapabilityValidation?.warnings
              : undefined,
          profileValidationErrors: unitCapabilityValidation?.errors ?? [],
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
      capabilitiesValidation: unitCapabilityValidation,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
