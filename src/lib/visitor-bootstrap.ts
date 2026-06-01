import "server-only";

import { upsertVisitorBlueprint, upsertVisitorTaxonomy, type VisitorBlueprint, type VisitorTaxonomy } from "@/lib/visitor-blueprints";

export function buildDefaultVisitorBlueprints(): VisitorBlueprint[] {
  return [
    {
      visitorKey: "classscout-new-york",
      state: "active",
      industry: "kids_activities",
      location: { country: "United States", city: "New York", geoGranularity: "city" },
      audience: ["parents", "caregivers", "families"],
      publicPromise: "Find verified classes, camps, programs, and activities for kids in New York.",
      taxonomyVersion: "v1",
      sourcePolicyVersion: "v1",
      qualityGateVersion: "v1",
      feedbackPolicyVersion: "v1",
    },
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
  return [
    {
      visitorKey: "classscout-new-york",
      version: "v1",
      contentTypes: [
        { contentType: "class", primitive: "course", publicEligible: true, label: "Class" },
        { contentType: "camp", primitive: "camp", publicEligible: true, label: "Camp" },
        { contentType: "birthday_party", primitive: "service", publicEligible: true, label: "Birthday Party" },
        { contentType: "drop_in", primitive: "program", publicEligible: true, label: "Drop-In Program" },
        { contentType: "museum_program", primitive: "program", publicEligible: true, label: "Museum Program" },
        { contentType: "source_only", primitive: "source-only", publicEligible: false, label: "Source Only" },
      ],
      forbiddenMappings: [],
      aliases: [
        { from: "storytime", to: "drop_in" },
        { from: "after-school", to: "class" },
      ],
      requiredEvidenceByType: {
        class: [{ field: "sourceUrl", required: true }, { field: "title", required: true }, { field: "provider", required: true }],
        camp: [{ field: "sourceUrl", required: true }, { field: "title", required: true }, { field: "season", required: true }],
        birthday_party: [{ field: "sourceUrl", required: true }, { field: "title", required: true }],
      },
    },
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
