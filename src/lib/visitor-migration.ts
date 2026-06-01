import "server-only";

import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import {
  activateVisitorBlueprint,
  getVisitorBlueprint,
  getVisitorTaxonomy,
  resolveDestinationKeyForVisitor,
} from "@/lib/visitor-blueprints";
import { buildDefaultVisitorBlueprints, buildDefaultVisitorTaxonomies } from "@/lib/visitor-bootstrap";
import { createVisitorSourceDatacard } from "@/lib/visitor-source-graph";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function inferKnownContentTypes(candidate: {
  proposedType: string | null;
  metadata: unknown;
}) {
  const metadata = asRecord(candidate.metadata) ?? {};
  const classification = asRecord(metadata.classification) ?? {};
  const contentType = asString(classification.contentType || candidate.proposedType).toLowerCase();
  return contentType ? [contentType] : [];
}

export async function migrateVisitorFromExistingDestination(
  companyId: string,
  visitorKey: string,
  input: { activate?: boolean } = {},
) {
  const destinationKey = resolveDestinationKeyForVisitor(visitorKey);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await ensureDestinationInstance(companyId, destinationKey);
  const defaultBlueprint = buildDefaultVisitorBlueprints().find((item) => item.visitorKey === visitorKey);
  const defaultTaxonomy = buildDefaultVisitorTaxonomies().find((item) => item.visitorKey === visitorKey);

  if (!defaultBlueprint || !defaultTaxonomy) {
    throw new Error(`No default Visitor bootstrap config found for ${visitorKey}`);
  }

  const existingBlueprint = await getVisitorBlueprint(companyId, visitorKey);
  if (!existingBlueprint) {
    const { upsertVisitorBlueprint } = await import("@/lib/visitor-blueprints");
    await upsertVisitorBlueprint(companyId, defaultBlueprint);
  }
  const existingTaxonomy = await getVisitorTaxonomy(companyId, visitorKey);
  if (!existingTaxonomy) {
    const { upsertVisitorTaxonomy } = await import("@/lib/visitor-blueprints");
    await upsertVisitorTaxonomy(companyId, defaultTaxonomy);
  }

  const candidates = await prisma.destinationCandidate.findMany({
    where: {
      companyId,
      destinationInstanceId: instance.id,
    },
    select: {
      canonicalSourceUrl: true,
      proposedType: true,
      metadata: true,
    },
    take: 1000,
    orderBy: { updatedAt: "desc" },
  });

  let createdDatacards = 0;
  let skippedDatacards = 0;
  for (const candidate of candidates) {
    const url = asString(candidate.canonicalSourceUrl);
    if (!url) {
      skippedDatacards += 1;
      continue;
    }
    try {
      await createVisitorSourceDatacard(companyId, visitorKey, {
        datacardType: "source_datacard",
        url,
        canonicalUrl: url,
        sourceKind: destinationKey === "classscout" ? "official_site" : "federation",
        trustTier: "usable",
        industryRelevance: 0.75,
        locationRelevance: 0.75,
        knownContentTypes: inferKnownContentTypes(candidate),
        extractionHints: ["migrated_from_existing_destination_candidate"],
      });
      createdDatacards += 1;
    } catch {
      skippedDatacards += 1;
    }
  }

  let activated = false;
  if (input.activate !== false) {
    await activateVisitorBlueprint(companyId, visitorKey);
    activated = true;
  }

  return {
    companyId,
    visitorKey,
    destinationKey,
    sourceCandidatesScanned: candidates.length,
    datacardsImported: createdDatacards,
    datacardsSkipped: skippedDatacards,
    blueprintActivated: activated,
  };
}

