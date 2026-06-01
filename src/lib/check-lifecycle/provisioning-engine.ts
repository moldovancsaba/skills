import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DestinationMissionDefinitionConfig } from "@/lib/destination-mission-contract";
import { getDefaultRulebookPolicyForDestination } from "@/lib/destination-mission-contract";
import { createDestinationMissionDefinition } from "@/lib/destination-mission-definitions";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { markCompanyPipelineTopologyDirty, syncCompanyPipelineJobs } from "@/lib/pipeline-queue";
import {
  getDestinationMissionKinds,
  getDestinationTopology,
  getUnitLifecycleRequirements,
} from "@/lib/check-lifecycle/topology-registry";

type ProvisionStepStatus = "created" | "updated" | "repaired" | "skipped";

export type ProvisionStepResult = {
  id: string;
  status: ProvisionStepStatus;
  summary: string;
  metadata?: Record<string, unknown>;
};

export type ProvisionCompanyInput = {
  company: Prisma.CompanyCreateInput;
  destinationKeys?: string[];
  actorId: string;
  source?: string;
};

function uniqueDestinationKeys(values: string[] | undefined): DestinationKey[] {
  const keys = new Set<DestinationKey>();
  for (const value of values ?? []) {
    const destinationKey = normalizeDestinationKey(value);
    if (destinationKey) keys.add(destinationKey);
  }
  return Array.from(keys);
}

function defaultMissionDefinitionConfig(destinationKey: DestinationKey): Partial<DestinationMissionDefinitionConfig> {
  const rulebookPolicy = getDefaultRulebookPolicyForDestination(destinationKey);
  return {
    version: "lifecycle-provisioning@v1",
    listingTypeScope: [...rulebookPolicy.allowedListingTypes],
    executionPolicy: {
      mode: "autopilot",
      cadence: "scheduled",
      cronEnabled: true,
      requireHumanPublishApproval: false,
    },
    rulebookPolicy: {
      ...rulebookPolicy,
      executionMode: "autopilot",
    },
    qualityGates: {
      requireSourceEvidence: true,
      requireReviewPacket: true,
      requirePublicVerification: true,
      requireFeedbackPolicy: destinationKey === "compare",
    },
  } as Partial<DestinationMissionDefinitionConfig>;
}

function missionDefinitionName(destinationKey: DestinationKey, missionKind: string) {
  const topology = getDestinationTopology(destinationKey);
  const label = topology?.label ?? destinationKey;
  if (missionKind === "VISITOR_CONTENT_CURATION") return `${label} Visitor Autopilot`;
  return `${label} Mission Autopilot`;
}

export async function ensureProvisionedDestination(input: {
  companyId: string;
  destinationKey: DestinationKey;
  actorId: string;
  source?: string;
}) {
  const steps: ProvisionStepResult[] = [];
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  steps.push({
    id: `destination:${input.destinationKey}`,
    status: "created",
    summary: `Ensured active ${input.destinationKey} destination instance.`,
    metadata: { destinationInstanceId: destinationInstance.id },
  });

  for (const missionKind of getDestinationMissionKinds(input.destinationKey)) {
    const existing = await prisma.destinationMissionDefinition.findFirst({
      where: {
        companyId: input.companyId,
        destinationKey: input.destinationKey,
        missionKind,
        status: { in: ["active", "paused", "draft"] },
      },
      select: { id: true, name: true, status: true },
      orderBy: { updatedAt: "desc" },
    });

    if (existing) {
      if (existing.status === "active") {
        steps.push({
          id: `mission:${input.destinationKey}:${missionKind}`,
          status: "skipped",
          summary: `Active ${missionKind} mission already exists for ${input.destinationKey}.`,
          metadata: { missionDefinitionId: existing.id },
        });
        continue;
      }

      const reactivated = await prisma.destinationMissionDefinition.update({
        where: { id: existing.id },
        data: {
          status: "active",
          updatedBy: input.actorId,
          metadata: {
            source: input.source ?? "provisioning-engine",
            reactivatedAt: new Date().toISOString(),
          },
        },
      });
      steps.push({
        id: `mission:${input.destinationKey}:${missionKind}`,
        status: reactivated.id === existing.id ? "repaired" : "skipped",
        summary: `Ensured active ${missionKind} mission for ${input.destinationKey}.`,
        metadata: { missionDefinitionId: existing.id, previousStatus: existing.status },
      });
      continue;
    }

    const definition = await createDestinationMissionDefinition({
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      missionKind,
      name: missionDefinitionName(input.destinationKey, missionKind),
      config: defaultMissionDefinitionConfig(input.destinationKey),
      status: "active",
      actorId: input.actorId,
      metadata: {
        source: input.source ?? "provisioning-engine",
        provisionedAt: new Date().toISOString(),
      },
    });

    steps.push({
      id: `mission:${input.destinationKey}:${missionKind}`,
      status: "created",
      summary: `Created active scheduled ${missionKind} mission for ${input.destinationKey}.`,
      metadata: { missionDefinitionId: definition.id },
    });
  }

  return steps;
}

export async function provisionCompany(input: ProvisionCompanyInput) {
  const destinationKeys = uniqueDestinationKeys(input.destinationKeys);
  const company = await prisma.company.create({ data: input.company });
  const steps: ProvisionStepResult[] = [
    {
      id: "unit",
      status: "created",
      summary: "Created CHECK Unit company record.",
      metadata: { companyId: company.id },
    },
  ];

  for (const destinationKey of destinationKeys) {
    steps.push(...await ensureProvisionedDestination({
      companyId: company.id,
      destinationKey,
      actorId: input.actorId,
      source: input.source,
    }));
  }

  await markCompanyPipelineTopologyDirty(prisma, company.id, "provisioning-engine");
  const jobs = await syncCompanyPipelineJobs(prisma, company.id);
  const requirements = getUnitLifecycleRequirements({ destinationKeys });
  steps.push({
    id: "pipeline-topology",
    status: "repaired",
    summary: `Synced ${jobs.length} lifecycle pipeline jobs for the Unit.`,
    metadata: {
      requiredPipelineJobs: requirements.requiredPipelineJobs,
      requiredMissionKinds: requirements.requiredMissionKinds,
    },
  });

  return {
    ok: true,
    company,
    destinationKeys,
    steps,
  };
}
