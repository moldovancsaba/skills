import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { canonicalizeAllowedLanguagesForStorage } from "@/lib/language-catalog";
import { deleteUnitData } from "@/lib/unit-crud";
import {
  UNIT_CAPABILITIES_SCHEMA_VERSION,
  formatCapabilityPayload,
  getWebappProfileLabel,
  normalizeUnitCapabilitiesPayloadForWrite,
  previewUnitProfileMigration,
  UNIT_PROFILE_COMPATIBILITY,
  resolveUnitCapabilities,
} from "@/lib/intelligence-unit-capabilities";

export const dynamic = 'force-dynamic';

function normalizeUnitName(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

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
    const [company, compareInstance] = await Promise.all([
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
      hasCompareDestination: Boolean(compareInstance),
    });

    return NextResponse.json({
      ...company,
      unitCapabilities: capabilities.normalized,
      unitCapabilitiesV2: {
        schemaVersion: capabilities.schemaVersion,
        payload: capabilities.normalized,
      },
      capabilitiesVersion: capabilities.schemaVersion,
      capabilitiesSource: capabilities.source,
      capabilitiesEnvelopeVersion: capabilities.sourceEnvelopeVersion,
      webapp: {
        profile: capabilities.profile,
        modules: capabilities.modules,
        profileLabel: getWebappProfileLabel(capabilities.profile),
      },
      profileCompatibility: UNIT_PROFILE_COMPATIBILITY,
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
        name: true,
        allowedLanguages: true,
        workerConfig: true,
      },
    });
    const [compareInstance] = await Promise.all([
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
    const hasCapabilityV2Update = Boolean(data.unitCapabilitiesV2);
    const profileMigrationRequest =
      data.profileMigration && typeof data.profileMigration === "object" && !Array.isArray(data.profileMigration)
        ? data.profileMigration as Record<string, unknown>
        : null;
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
    const capabilityV2Validation = hasCapabilityV2Update
      ? normalizeUnitCapabilitiesPayloadForWrite(data.unitCapabilitiesV2)
      : null;
    if (capabilityV2Validation && !capabilityV2Validation.validation.isValid) {
      return NextResponse.json(
        {
          error: "Invalid unitCapabilitiesV2 payload",
          capabilitiesValidation: capabilityV2Validation.validation,
        },
        { status: 422 },
      );
    }
    const currentCapabilities = resolveUnitCapabilities({
      workerConfig: existing?.workerConfig,
      hasCompareDestination: Boolean(compareInstance),
    });
    const profileMigration = profileMigrationRequest
      ? previewUnitProfileMigration({
          fromProfile: profileMigrationRequest.fromProfile ?? currentCapabilities.profile,
          toProfile: profileMigrationRequest.toProfile,
          modules: profileMigrationRequest.modules ?? currentCapabilities.modules,
          dryRun: profileMigrationRequest.dryRun !== false,
        })
      : null;
    if (profileMigration?.dryRun) {
      return NextResponse.json({
        id: existing?.id ?? companyId,
        unitCapabilities: currentCapabilities.normalized,
        unitCapabilitiesV2: {
          schemaVersion: currentCapabilities.schemaVersion,
          payload: currentCapabilities.normalized,
        },
        capabilitiesVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
        capabilitiesSource: currentCapabilities.source,
        capabilitiesEnvelopeVersion: currentCapabilities.sourceEnvelopeVersion,
        webapp: {
          profile: currentCapabilities.profile,
          modules: currentCapabilities.modules,
          profileLabel: getWebappProfileLabel(currentCapabilities.profile),
        },
        profileCompatibility: UNIT_PROFILE_COMPATIBILITY,
        profileMigration,
        capabilitiesValidation: null,
        allowedLanguages: canonicalizeAllowedLanguagesForStorage(existing?.allowedLanguages ?? []),
      });
    }

    if (hasLanguageUpdate && (!data.allowedLanguages.every((l: unknown) => typeof l === "string"))) {
      return NextResponse.json({ error: "Invalid allowedLanguages format" }, { status: 400 });
    }

    const hasNameUpdate = Object.prototype.hasOwnProperty.call(data, "name");
    const normalizedName = hasNameUpdate ? normalizeUnitName(data.name) : undefined;
    if (hasNameUpdate && !normalizedName) {
      return NextResponse.json({ error: "Unit name is required" }, { status: 400 });
    }

    const normalizedAllowedLanguages = data.allowedLanguages
      ? canonicalizeAllowedLanguagesForStorage(data.allowedLanguages as string[])
      : undefined;
    const existingWorkerConfig =
      existing?.workerConfig && typeof existing.workerConfig === "object" && !Array.isArray(existing.workerConfig)
        ? existing.workerConfig as Record<string, unknown>
        : {};
    const nextWorkerConfig = capabilityV2Validation
      ? {
          ...existingWorkerConfig,
          unitCapabilities: formatCapabilityPayload({
            profile: profileMigration?.payload.profile ?? capabilityV2Validation.payload.profile,
            modules: profileMigration?.payload.modules ?? capabilityV2Validation.payload.modules,
          }),
          updatedBy: "settings-unit-capabilities-v2",
        }
      : profileMigration
        ? {
            ...existingWorkerConfig,
            unitCapabilities: formatCapabilityPayload({
              profile: profileMigration.payload.profile,
              modules: profileMigration.payload.modules,
            }),
            updatedBy: "settings-profile-migration",
          }
      : undefined;

      const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(normalizedName ? { name: normalizedName } : {}),
        allowedLanguages: normalizedAllowedLanguages,
        ...(nextWorkerConfig ? { workerConfig: nextWorkerConfig } : {}),
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

    if (normalizedName && normalizedName !== existing?.name) {
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-company",
        interactionType: "UNIT_RENAME",
        entityType: "COMPANY",
        entityId: updated.id,
        beforeState: {
          name: existing?.name ?? null,
        },
        afterState: {
          name: updated.name,
        },
        teachingWeight: 70,
      });

      await recordOutcomeEvent({
        companyId,
        actorType: "HUMAN",
        entityType: "COMPANY",
        entityId: updated.id,
        outcomeType: "UNIT_RENAMED",
        outcomeValue: updated.name,
        beforeState: {
          name: existing?.name ?? null,
        },
        afterState: {
          name: updated.name,
        },
        teachingWeight: 70,
      });
    }

    const nextCapabilities = resolveUnitCapabilities({
      workerConfig: updated.workerConfig,
      hasCompareDestination: Boolean(compareInstance),
    });

    return NextResponse.json({
      ...updated,
      unitCapabilities: nextCapabilities.normalized,
      unitCapabilitiesV2: {
        schemaVersion: nextCapabilities.schemaVersion,
        payload: nextCapabilities.normalized,
      },
      capabilitiesVersion: UNIT_CAPABILITIES_SCHEMA_VERSION,
      capabilitiesSource: nextCapabilities.source,
      capabilitiesEnvelopeVersion: nextCapabilities.sourceEnvelopeVersion,
      webapp: {
        profile: nextCapabilities.profile,
        modules: nextCapabilities.modules,
        profileLabel: getWebappProfileLabel(nextCapabilities.profile),
      },
      profileCompatibility: UNIT_PROFILE_COMPATIBILITY,
      profileMigration,
      allowedLanguages: canonicalizeAllowedLanguagesForStorage(updated.allowedLanguages ?? []),
      capabilitiesValidation: capabilityV2Validation?.validation ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
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
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const bodyRaw = await request.json().catch(() => ({}));
    const body = bodyRaw && typeof bodyRaw === "object" && !Array.isArray(bodyRaw)
      ? bodyRaw as Record<string, unknown>
      : {};
    const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
    if (confirmation !== company.name) {
      return NextResponse.json(
        { error: "Unit name confirmation is required before deletion." },
        { status: 400 },
      );
    }

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "settings-company",
      interactionType: "UNIT_DELETE",
      entityType: "COMPANY",
      entityId: company.id,
      beforeState: {
        name: company.name,
      },
      payload: {
        confirmedName: confirmation,
      },
      teachingWeight: 100,
    });

    const deleted = await deleteUnitData(prisma, companyId);

    return NextResponse.json({
      ok: true,
      deleted: true,
      companyId,
      deletedModels: deleted.deletedModels,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
