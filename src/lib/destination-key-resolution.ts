import { prisma } from "@/lib/db";
import { DESTINATION_KEYS, type DestinationKey } from "@/lib/destination-workflow-contract";
import { normalizeDestinationKey } from "@/lib/destination-scope";

const FALLBACK_DESTINATION_KEY: DestinationKey = "compare";

export function isDestinationKey(value: unknown): value is DestinationKey {
  return normalizeDestinationKey(value) !== null;
}

export async function resolveDestinationKeyForCompany(companyId: string, candidate?: unknown): Promise<DestinationKey> {
  const normalizedCandidate = normalizeDestinationKey(candidate);
  if (normalizedCandidate) return normalizedCandidate;

  const activeInstance = await prisma.destinationInstance.findFirst({
    where: {
      companyId,
      isActive: true,
      destinationKey: {
        in: [...DESTINATION_KEYS],
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      destinationKey: true,
    },
  });

  if (activeInstance) {
    const activeDestinationKey = normalizeDestinationKey(activeInstance.destinationKey);
    if (activeDestinationKey) return activeDestinationKey;
  }

  return FALLBACK_DESTINATION_KEY;
}
