import { DESTINATION_KEYS, type DestinationKey } from "@/lib/destination-workflow-contract";

export function normalizeDestinationKey(value: unknown): DestinationKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  for (const destinationKey of DESTINATION_KEYS) {
    if (normalized === destinationKey) return destinationKey;
  }
  return null;
}

export function resolveFirstSupportedDestinationKey(values: string[]): DestinationKey | null {
  for (const value of values) {
    const destinationKey = normalizeDestinationKey(value);
    if (destinationKey) return destinationKey;
  }
  return null;
}

export function resolveDestinationLabel(destinationKey: DestinationKey): string {
  if (destinationKey === "classscout") return "ClassScout";
  if (destinationKey === "compare") return "Compare";
  if (destinationKey === "trainers") return "Trainers";
  return destinationKey;
}

export function supportsDestinationLiveListingOps(destinationKey: DestinationKey): boolean {
  return destinationKey === "classscout";
}
