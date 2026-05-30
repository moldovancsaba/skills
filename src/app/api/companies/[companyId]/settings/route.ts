import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { canonicalizeAllowedLanguagesForStorage } from "@/lib/language-catalog";
import { formatCapabilityPayload, normalizeUnitCapabilitiesPayload, type RawWorkerUnitCapabilities, UNIT_WEBAPP_PROFILE_DESCRIPTIONS, type UnitWebappProfile } from "@/lib/intelligence-unit-capabilities";

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
        workerConfig: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...company,
      unitCapabilities: normalizeUnitCapabilitiesPayload(company.workerConfig),
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
    if (incomingCapabilities) {
      normalizedCapabilityPayload = normalizeUnitCapabilitiesPayload(incomingCapabilities);
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
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-company",
        interactionType: "UNIT_SURFACE_UPDATE",
        entityType: "COMPANY",
        entityId: updated.id,
        beforeState: {
          unitCapabilities: normalizeUnitCapabilitiesPayload(existing?.workerConfig),
        },
        afterState: {
          unitCapabilities: normalizeUnitCapabilitiesPayload(updated.workerConfig),
        },
        payload: {
          profileDescription: UNIT_WEBAPP_PROFILE_DESCRIPTIONS[
            normalizeUnitCapabilitiesPayload(updated.workerConfig).profile
          ],
        },
        teachingWeight: 95,
      });
    }

    return NextResponse.json({
      ...updated,
      unitCapabilities: normalizeUnitCapabilitiesPayload(updated.workerConfig),
      allowedLanguages: canonicalizeAllowedLanguagesForStorage(updated.allowedLanguages ?? []),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
