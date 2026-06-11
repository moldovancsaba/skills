import "server-only";

import {
  getDefaultVisitorBlueprint,
  getDefaultVisitorTaxonomy,
  upsertVisitorBlueprint,
  upsertVisitorTaxonomy,
  type VisitorBlueprint,
  type VisitorTaxonomy,
} from "@/lib/visitor-blueprints";

export function buildDefaultVisitorBlueprints(): VisitorBlueprint[] {
  const classScout = getDefaultVisitorBlueprint("classscout-new-york");
  if (!classScout) throw new Error("ClassScout default visitor blueprint is missing");
  return [
    classScout,
    {
      visitorKey: "compare",
      state: "active",
      industry: "sport_shooting_hunting",
      location: { country: "Hungary", geoGranularity: "country" },
      audience: ["hunters", "sport shooters", "clubs", "training seekers"],
      publicPromise: "Find verified ranges, courses, competitions, clubs, and hunting-related events in Hungary.",
      taxonomyVersion: "v1",
      sourcePolicyVersion: "v1",
      qualityGateVersion: "v1",
      feedbackPolicyVersion: "v1",
    },
  ];
}

export function buildDefaultVisitorTaxonomies(): VisitorTaxonomy[] {
  const classScout = getDefaultVisitorTaxonomy("classscout-new-york");
  if (!classScout) throw new Error("ClassScout default visitor taxonomy is missing");
  return [
    classScout,
    {
      visitorKey: "compare",
      version: "v1",
      contentTypes: [
        { contentType: "range", primitive: "venue", publicEligible: true, label: "Range" },
        { contentType: "shooting_school", primitive: "program", publicEligible: true, label: "Shooting School" },
        { contentType: "hunter_education", primitive: "course", publicEligible: true, label: "Hunter Education" },
        { contentType: "club", primitive: "community", publicEligible: true, label: "Club" },
        { contentType: "competition", primitive: "competition", publicEligible: true, label: "Competition" },
        { contentType: "expo", primitive: "exhibition", publicEligible: true, label: "Expo" },
        { contentType: "federation_resource", primitive: "resource", publicEligible: false, label: "Federation Resource" },
        { contentType: "source_only", primitive: "source-only", publicEligible: false, label: "Source Only" },
      ],
      forbiddenMappings: [
        { sourceTerm: "birthday party", reason: "Not valid for sport shooting/hunting visitor app" },
        { sourceTerm: "kids shooting", reason: "Requires explicit legal and safety approval" },
      ],
      aliases: [
        { from: "match", to: "competition" },
        { from: "cup", to: "competition" },
      ],
      requiredEvidenceByType: {
        competition: [
          { field: "sourceUrl", required: true },
          { field: "title", required: true },
          { field: "date", required: true },
          { field: "location", required: true },
        ],
        hunter_education: [
          { field: "sourceUrl", required: true },
          { field: "title", required: true },
          { field: "provider", required: true },
        ],
        expo: [
          { field: "sourceUrl", required: true },
          { field: "title", required: true },
          { field: "date", required: true },
          { field: "venue", required: true },
        ],
      },
    },
  ];
}

export async function bootstrapVisitorDefaults(companyId: string) {
  const blueprints = buildDefaultVisitorBlueprints();
  const taxonomies = buildDefaultVisitorTaxonomies();
  const savedBlueprints = [];
  const savedTaxonomies = [];
  for (const blueprint of blueprints) {
    savedBlueprints.push(await upsertVisitorBlueprint(companyId, blueprint));
  }
  for (const taxonomy of taxonomies) {
    savedTaxonomies.push(await upsertVisitorTaxonomy(companyId, taxonomy));
  }
  return {
    blueprintCount: savedBlueprints.length,
    taxonomyCount: savedTaxonomies.length,
    blueprints: savedBlueprints.map((item) => item.visitorKey),
    taxonomies: savedTaxonomies.map((item) => item.visitorKey),
  };
}
