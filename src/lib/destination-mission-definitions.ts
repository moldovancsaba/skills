import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  normalizeMissionDefinitionConfig,
  type DestinationMissionDefinitionConfig,
} from "@/lib/destination-mission-contract";
import { ensureDestinationInstance } from "@/lib/destination-workflows";

function asJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue {
  return ((value && Object.keys(value).length > 0 ? value : {}) as Prisma.InputJsonValue);
}

function normalizeMissionDefinitionStatus(value: unknown) {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "active":
    case "paused":
    case "archived":
      return String(value).trim().toLowerCase();
    default:
      return "draft";
  }
}

export async function listDestinationMissionDefinitions(input: {
  companyId: string;
  destinationKey: "classscout";
  missionKind?: string;
}) {
  return prisma.destinationMissionDefinition.findMany({
    where: {
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      ...(input.missionKind ? { missionKind: input.missionKind } : {}),
    },
    orderBy: [
      { status: "asc" },
      { updatedAt: "desc" },
    ],
    include: {
      revisions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
}

export async function getDestinationMissionDefinition(input: {
  companyId: string;
  definitionId: string;
}) {
  return prisma.destinationMissionDefinition.findFirst({
    where: {
      id: input.definitionId,
      companyId: input.companyId,
    },
    include: {
      revisions: {
        orderBy: { version: "desc" },
      },
    },
  });
}

export async function resolveActiveDestinationMissionDefinition(input: {
  companyId: string;
  destinationKey: "classscout";
  missionKind: string;
}) {
  return prisma.destinationMissionDefinition.findFirst({
    where: {
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      missionKind: input.missionKind,
      status: "active",
    },
    orderBy: { updatedAt: "desc" },
    include: {
      revisions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
}

export async function listSchedulableDestinationMissionDefinitions(input: {
  companyId: string;
  destinationKey: "classscout";
  missionKind?: string;
}) {
  const definitions = await prisma.destinationMissionDefinition.findMany({
    where: {
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      status: "active",
      ...(input.missionKind ? { missionKind: input.missionKind } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      revisions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  return definitions.filter((definition) => {
    const config = normalizeMissionDefinitionConfig(
      definition.configJson as Partial<DestinationMissionDefinitionConfig>,
    );
    return (
      config.executionPolicy.cadence === "scheduled" &&
      config.executionPolicy.cronEnabled &&
      (config.executionPolicy.mode === "guarded" || config.executionPolicy.mode === "autopilot")
    );
  });
}

export async function createDestinationMissionDefinition(input: {
  companyId: string;
  destinationKey: "classscout";
  missionKind: string;
  name: string;
  config?: Partial<DestinationMissionDefinitionConfig> | null;
  status?: "draft" | "active" | "paused" | "archived";
  actorId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const normalizedConfig = normalizeMissionDefinitionConfig(input.config);
  const status = normalizeMissionDefinitionStatus(input.status) as "draft" | "active" | "paused" | "archived";

  return prisma.$transaction(async (tx) => {
    if (status === "active") {
      await tx.destinationMissionDefinition.updateMany({
        where: {
          companyId: input.companyId,
          destinationInstanceId: destinationInstance.id,
          destinationKey: input.destinationKey,
          missionKind: input.missionKind,
          status: "active",
        },
        data: {
          status: "paused",
          updatedBy: input.actorId,
          metadata: asJson({
            ...(input.metadata ?? {}),
            autoPausedByActivation: true,
          }),
        },
      });
    }

    const definition = await tx.destinationMissionDefinition.create({
      data: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        destinationKey: input.destinationKey,
        missionKind: input.missionKind,
        name: input.name.trim(),
        status,
        configJson: normalizedConfig as unknown as Prisma.InputJsonValue,
        metadata: asJson(input.metadata),
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    });

    const revision = await tx.destinationMissionDefinitionRevision.create({
      data: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        missionDefinitionId: definition.id,
        version: 1,
        configJson: normalizedConfig as unknown as Prisma.InputJsonValue,
        metadata: asJson({
          ...(input.metadata ?? {}),
          source: "createDestinationMissionDefinition",
        }),
        createdBy: input.actorId,
      },
    });

    return tx.destinationMissionDefinition.update({
      where: { id: definition.id },
      data: {
        activeRevisionId: revision.id,
      },
      include: {
        revisions: {
          orderBy: { version: "desc" },
        },
      },
    });
  });
}

export async function updateDestinationMissionDefinition(input: {
  companyId: string;
  definitionId: string;
  name?: string;
  config?: Partial<DestinationMissionDefinitionConfig> | null;
  status?: "draft" | "active" | "paused" | "archived";
  actorId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const definition = await prisma.destinationMissionDefinition.findFirst({
    where: {
      id: input.definitionId,
      companyId: input.companyId,
    },
    include: {
      revisions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  if (!definition) return null;

  const currentConfig = normalizeMissionDefinitionConfig(
    definition.configJson as Partial<DestinationMissionDefinitionConfig>,
  );
  const normalizedConfig = normalizeMissionDefinitionConfig({
    ...currentConfig,
    ...(input.config ?? {}),
  });
  const currentVersion = definition.revisions[0]?.version ?? 0;
  const nextStatus =
    input.status !== undefined
      ? (normalizeMissionDefinitionStatus(input.status) as "draft" | "active" | "paused" | "archived")
      : definition.status;

  return prisma.$transaction(async (tx) => {
    if (nextStatus === "active") {
      await tx.destinationMissionDefinition.updateMany({
        where: {
          companyId: definition.companyId,
          destinationInstanceId: definition.destinationInstanceId,
          destinationKey: definition.destinationKey,
          missionKind: definition.missionKind,
          status: "active",
          id: { not: definition.id },
        },
        data: {
          status: "paused",
          updatedBy: input.actorId,
        },
      });
    }

    const revision = await tx.destinationMissionDefinitionRevision.create({
      data: {
        companyId: definition.companyId,
        destinationInstanceId: definition.destinationInstanceId,
        missionDefinitionId: definition.id,
        version: currentVersion + 1,
        configJson: normalizedConfig as unknown as Prisma.InputJsonValue,
        metadata: asJson({
          ...(input.metadata ?? {}),
          source: "updateDestinationMissionDefinition",
        }),
        createdBy: input.actorId,
      },
    });

    return tx.destinationMissionDefinition.update({
      where: { id: definition.id },
      data: {
        name: input.name?.trim() ? input.name.trim() : definition.name,
        status: nextStatus,
        activeRevisionId: revision.id,
        configJson: normalizedConfig as unknown as Prisma.InputJsonValue,
        metadata: asJson({
          ...((definition.metadata as Record<string, unknown> | null) ?? {}),
          ...((input.metadata as Record<string, unknown> | null) ?? {}),
          configUpdatedAt: new Date().toISOString(),
        }),
        updatedBy: input.actorId,
      },
      include: {
        revisions: {
          orderBy: { version: "desc" },
        },
      },
    });
  });
}

export async function activateDestinationMissionDefinition(input: {
  companyId: string;
  definitionId: string;
  actorId: string;
}) {
  return updateDestinationMissionDefinition({
    companyId: input.companyId,
    definitionId: input.definitionId,
    actorId: input.actorId,
    status: "active",
    metadata: {
      activatedAt: new Date().toISOString(),
      source: "activateDestinationMissionDefinition",
    },
  });
}

export async function pauseDestinationMissionDefinition(input: {
  companyId: string;
  definitionId: string;
  actorId: string;
}) {
  return updateDestinationMissionDefinition({
    companyId: input.companyId,
    definitionId: input.definitionId,
    actorId: input.actorId,
    status: "paused",
    metadata: {
      pausedAt: new Date().toISOString(),
      source: "pauseDestinationMissionDefinition",
    },
  });
}

export async function archiveDestinationMissionDefinition(input: {
  companyId: string;
  definitionId: string;
  actorId: string;
}) {
  return updateDestinationMissionDefinition({
    companyId: input.companyId,
    definitionId: input.definitionId,
    actorId: input.actorId,
    status: "archived",
    metadata: {
      archivedAt: new Date().toISOString(),
      source: "archiveDestinationMissionDefinition",
    },
  });
}

export async function duplicateDestinationMissionDefinition(input: {
  companyId: string;
  definitionId: string;
  actorId: string;
}) {
  const definition = await getDestinationMissionDefinition({
    companyId: input.companyId,
    definitionId: input.definitionId,
  });
  if (!definition) return null;

  const normalizedConfig = normalizeMissionDefinitionConfig(
    definition.configJson as Partial<DestinationMissionDefinitionConfig>,
  );
  return createDestinationMissionDefinition({
    companyId: input.companyId,
    destinationKey: definition.destinationKey as "classscout",
    missionKind: definition.missionKind,
    name: `${definition.name} Copy`,
    config: normalizedConfig,
    status: "draft",
    actorId: input.actorId,
    metadata: {
      duplicatedFromDefinitionId: definition.id,
    },
  });
}
