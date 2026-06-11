import type { GdsMaturityCapability } from "@doneisbetter/gds/server";

export type GdsAdoptionStatus = "not-started" | "planned" | "in-progress" | "adopted" | "exception";

export type GdsAdoptionEvidence = {
  readonly path: string;
  readonly kind: "manifest" | "adapter" | "script" | "docs" | "surface";
  readonly note: string;
};

export type GdsCapabilityAdoption = {
  readonly capabilityId: GdsMaturityCapability["id"];
  readonly upstreamIssueNumber: number;
  readonly title: string;
  readonly status: GdsAdoptionStatus;
  readonly packageStatus: GdsMaturityCapability["status"];
  readonly primaryContracts: readonly string[];
  readonly evidence: readonly GdsAdoptionEvidence[];
  readonly gaps: readonly string[];
  readonly nextIssueTemplate: {
    readonly owner: string;
    readonly scope: string;
    readonly acceptanceCriteria: readonly string[];
    readonly dependencies: readonly string[];
    readonly gdsPrimitiveMapping: readonly string[];
  };
};

export type GdsMaturityAdoptionReport = {
  readonly generatedAt: string;
  readonly packageVersion: string;
  readonly manifestVersion: number;
  readonly scanCounts: {
    readonly capabilities: number;
    readonly adopted: number;
    readonly inProgress: number;
    readonly planned: number;
    readonly notStarted: number;
    readonly exceptions: number;
  };
  readonly capabilities: readonly GdsCapabilityAdoption[];
};

type GdsAdoptionManifest = {
  readonly schemaVersion: number;
  readonly owner: string;
  readonly packageVersion: string;
};

const CAPABILITY_EVIDENCE: Record<GdsMaturityCapability["id"], readonly GdsAdoptionEvidence[]> = {
  "admin-delivery": [
    { path: "src/components/gds/reporting.tsx", kind: "adapter", note: "Reporting adapter covers the first analytics/admin-style report contract." },
    { path: "src/app/[companyId]/analytics/analytics-client.tsx", kind: "surface", note: "Company analytics is the first proof surface for GDS reporting/data presentation." },
  ],
  "runtime-feedback": [
    { path: "src/lib/gds-operation-feedback.tsx", kind: "adapter", note: "Runtime operations use GDS confirm, toast, command, and telemetry contracts." },
    { path: "scripts/test-gds-runtime-feedback.mjs", kind: "script", note: "Native dialogs are blocked on the first migrated operator surfaces." },
  ],
  "foundation-surfaces": [
    { path: "src/components/ui/app-shell.tsx", kind: "adapter", note: "App-shell compatibility exports delegate page, metric, notice, and state contracts to GDS." },
    { path: "scripts/test-gds-app-shell-adapters.mjs", kind: "script", note: "Adapter guard verifies package-native app-shell delegates remain in place." },
  ],
  "global-readiness": [
    { path: "src/lib/ui-i18n.tsx", kind: "surface", note: "Client language direction resolves through GDS locale metadata." },
    { path: "src/lib/gds-locale-bootstrap.generated.ts", kind: "surface", note: "Root layout uses a server-safe direction bootstrap verified against GDS metadata." },
    { path: "scripts/test-gds-runtime-provider.mjs", kind: "script", note: "Runtime provider test verifies locale helper use and bootstrap drift." },
  ],
  "adoption-governance": [
    { path: "gds-adoption.json", kind: "manifest", note: "Manifest records approved adapters, exceptions, package version, and required gates." },
    { path: "scripts/verify-gds-adoption.mjs", kind: "script", note: "Manifest verifier enforces owner, package, adapter, exception, and script evidence." },
    { path: "scripts/verify-gds-compliance.mjs", kind: "script", note: "Composite gate runs the required GDS compliance checks." },
  ],
  "theme-operations": [
    { path: "src/components/providers.tsx", kind: "adapter", note: "Root provider composes GDS provider/theme contracts and runtime providers." },
    { path: "src/lib/semantic-theme.ts", kind: "surface", note: "Semantic tokens centralize product color and chart color mapping." },
    { path: "scripts/test-gds-style-contract.mjs", kind: "script", note: "Style contract blocks raw Mantine color token drift outside theme boundaries." },
  ],
  "product-system": [
    { path: "docs/GDS_MATURITY_ADOPTION_REPORT.md", kind: "docs", note: "Inspectable capability backlog generated from the GDS maturity registry contract." },
    { path: "scripts/test-gds-maturity-adoption.mjs", kind: "script", note: "Registry shape, local evidence, status classifier, and docs report are verified." },
  ],
};

const CAPABILITY_STATUS: Record<GdsMaturityCapability["id"], GdsAdoptionStatus> = {
  "admin-delivery": "in-progress",
  "runtime-feedback": "adopted",
  "foundation-surfaces": "in-progress",
  "global-readiness": "in-progress",
  "adoption-governance": "adopted",
  "theme-operations": "in-progress",
  "product-system": "adopted",
};

const CAPABILITY_GAPS: Record<GdsMaturityCapability["id"], readonly string[]> = {
  "admin-delivery": ["Migrate remaining admin/resource manager surfaces to package-native admin contracts.", "Add form/table state coverage beyond the analytics reporting proof surface."],
  "runtime-feedback": ["Upstream reason-required destructive confirmations are still needed for full parity."],
  "foundation-surfaces": ["Replace temporary primitives, typography, card, chart, and drag/drop barrels as GDS package exports land.", "Add layout template coverage for route-level shells after package-native block primitives are adopted."],
  "global-readiness": ["Expand route-copy coverage and text expansion checks beyond provider/locale metadata verification.", "Add RTL mobile visual smoke coverage for migrated shell surfaces."],
  "adoption-governance": ["Enable strict mode only after remaining approved adapters have package-native replacements."],
  "theme-operations": ["Move remaining theme overrides and semantic product chart mappings into upstream GDS theme contracts.", "Add high-contrast and reduced-motion release evidence once upstream contracts expose stable checks."],
  "product-system": ["Optional GitHub issue sync remains manual until owner, scope, dependencies, and primitive mapping are present."],
};

const DEPENDENCIES_BY_CAPABILITY: Record<GdsMaturityCapability["id"], readonly string[]> = {
  "admin-delivery": ["issue 451", "issue 453", "issue 455"],
  "runtime-feedback": ["issue 451", "issue 452", "issue 454"],
  "foundation-surfaces": ["issue 451", "issue 453"],
  "global-readiness": ["issue 451", "issue 452"],
  "adoption-governance": ["issue 451", "issue 457"],
  "theme-operations": ["issue 451", "issue 452"],
  "product-system": ["issue 451", "issue 457"],
};

export function classifyGdsCapabilityAdoption(capability: GdsMaturityCapability): GdsAdoptionStatus {
  return CAPABILITY_STATUS[capability.id] ?? "not-started";
}

export function buildGdsMaturityAdoptionReport(
  capabilities: readonly GdsMaturityCapability[],
  manifest: GdsAdoptionManifest,
  generatedAt: string,
): GdsMaturityAdoptionReport {
  const adoptedCapabilities = capabilities.map((capability) => {
    const status = classifyGdsCapabilityAdoption(capability);
    const gaps = CAPABILITY_GAPS[capability.id] ?? [`Map ${capability.title} to check-owned adoption evidence.`];

    return {
      capabilityId: capability.id,
      upstreamIssueNumber: capability.issueNumber,
      title: capability.title,
      status,
      packageStatus: capability.status,
      primaryContracts: capability.primaryContracts,
      evidence: CAPABILITY_EVIDENCE[capability.id] ?? [],
      gaps,
      nextIssueTemplate: {
        owner: manifest.owner,
        scope: `Adopt ${capability.title} through GDS package contracts without adding local UI infrastructure.`,
        acceptanceCriteria: [
          "Use @doneisbetter/gds package contracts or approved adapters only.",
          "Preserve existing route/API behavior unless the issue explicitly changes it.",
          "Add a deterministic verification script and documentation evidence.",
          "Update gds-adoption.json when adapters, exceptions, or required gates change.",
        ],
        dependencies: DEPENDENCIES_BY_CAPABILITY[capability.id] ?? ["issue 451"],
        gdsPrimitiveMapping: capability.primaryContracts,
      },
    } satisfies GdsCapabilityAdoption;
  });

  const count = (status: GdsAdoptionStatus) => adoptedCapabilities.filter((item) => item.status === status).length;

  return {
    generatedAt,
    packageVersion: manifest.packageVersion,
    manifestVersion: manifest.schemaVersion,
    scanCounts: {
      capabilities: adoptedCapabilities.length,
      adopted: count("adopted"),
      inProgress: count("in-progress"),
      planned: count("planned"),
      notStarted: count("not-started"),
      exceptions: count("exception"),
    },
    capabilities: adoptedCapabilities,
  };
}
