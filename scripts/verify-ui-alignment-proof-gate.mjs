import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REQUIRED_SCENARIOS = [
  {
    scenarioId: "checklist-core",
    blockConfig: ["checklist"],
    description: "Checklist core block enabled without miniapp destination dependency.",
  },
  {
    scenarioId: "sales-only",
    blockConfig: ["sales"],
    description: "Sales block enabled with checklist/project/miniapp disabled.",
  },
  {
    scenarioId: "project-only",
    blockConfig: ["project"],
    description: "Project board block enabled with no checklist/sales/miniapp business logic coupling.",
  },
  {
    scenarioId: "miniapp-classscout-only",
    blockConfig: ["miniapp"],
    description: "Miniapp block enabled with classscout active and compare disabled.",
  },
  {
    scenarioId: "miniapp-compare-only",
    blockConfig: ["miniapp"],
    description: "Miniapp block enabled with compare active and classscout disabled.",
  },
  {
    scenarioId: "miniapp-dual-destination",
    blockConfig: ["miniapp"],
    description: "Miniapp block enabled with classscout and compare both active.",
  },
  {
    scenarioId: "miniapp-disabled-no-destination",
    blockConfig: [],
    description: "Miniapp block disabled with no miniapp destination active.",
  },
  {
    scenarioId: "local-classscout-intelligence-flow",
    blockConfig: ["miniapp"],
    description: "ClassScout receives fresh Local intelligence and can move from mission input to review/publish evidence.",
  },
  {
    scenarioId: "local-compare-intelligence-flow",
    blockConfig: ["miniapp"],
    description: "Compare receives fresh Local intelligence and can move from mission input to review/publish evidence.",
  },
];

function parseArgs(argv) {
  const args = {
    evidenceDir: "logs/ui-alignment-proof",
    outDir: "logs/ui-alignment-proof",
    strict: false,
    initTemplates: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--evidenceDir" && argv[index + 1]) {
      args.evidenceDir = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--outDir" && argv[index + 1]) {
      args.outDir = String(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token === "--strict") {
      args.strict = true;
      continue;
    }
    if (token === "--init-templates") {
      args.initTemplates = true;
    }
  }

  return args;
}

function readJsonFile(pathname) {
  try {
    const raw = readFileSync(pathname, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function createTemplate(input) {
  return {
    scenarioId: input.scenarioId,
    blockConfig: input.blockConfig,
    result: "pending",
    telemetryRefs: [],
    rollbackVerified: false,
    accessibilityVerified: false,
    securityVerified: false,
    performanceVerified: false,
    localConnected: false,
    intelligenceFreshnessVerified: false,
    miniappContentFlowVerified: false,
    notes: [
      input.description,
    ],
  };
}

function evaluateScenarioEvidence(scenario, record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      errors: ["Evidence record missing or invalid JSON object."],
      result: "missing",
    };
  }

  if (record.scenarioId !== scenario.scenarioId) {
    errors.push(`scenarioId mismatch: expected ${scenario.scenarioId}`);
  }
  if (!isStringArray(record.blockConfig)) {
    errors.push("blockConfig must be a string array.");
  }
  if (!["pass", "fail"].includes(record.result)) {
    errors.push("result must be \"pass\" or \"fail\".");
  }
  if (!isStringArray(record.telemetryRefs) || record.telemetryRefs.length === 0) {
    errors.push("telemetryRefs must include at least one evidence reference.");
  }
  if (record.rollbackVerified !== true) {
    errors.push("rollbackVerified must be true.");
  }
  if (record.accessibilityVerified !== true) {
    errors.push("accessibilityVerified must be true.");
  }
  if (record.securityVerified !== true) {
    errors.push("securityVerified must be true.");
  }
  if (record.performanceVerified !== true) {
    errors.push("performanceVerified must be true.");
  }
  if (scenario.scenarioId.startsWith("local-")) {
    if (record.localConnected !== true) {
      errors.push("localConnected must be true for Local intelligence scenarios.");
    }
    if (record.intelligenceFreshnessVerified !== true) {
      errors.push("intelligenceFreshnessVerified must be true for Local intelligence scenarios.");
    }
    if (record.miniappContentFlowVerified !== true) {
      errors.push("miniappContentFlowVerified must be true for Local intelligence scenarios.");
    }
  }
  if (record.result === "fail") {
    errors.push("scenario result is fail.");
  }

  return {
    scenarioId: scenario.scenarioId,
    passed: errors.length === 0,
    errors,
    result: record.result,
    telemetryRefs: record.telemetryRefs,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidenceDir = resolve(process.cwd(), args.evidenceDir);
  const outDir = resolve(process.cwd(), args.outDir);

  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  if (args.initTemplates) {
    for (const scenario of REQUIRED_SCENARIOS) {
      const target = join(evidenceDir, `${scenario.scenarioId}.json`);
      if (existsSync(target)) continue;
      writeFileSync(target, `${JSON.stringify(createTemplate(scenario), null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify({
      initialized: true,
      evidenceDir,
      scenarioCount: REQUIRED_SCENARIOS.length,
    }, null, 2));
    return;
  }

  const scenarioResults = REQUIRED_SCENARIOS.map((scenario) => {
    const evidencePath = join(evidenceDir, `${scenario.scenarioId}.json`);
    const payload = readJsonFile(evidencePath);
    return {
      ...evaluateScenarioEvidence(scenario, payload),
      evidencePath,
    };
  });

  const failed = scenarioResults.filter((item) => !item.passed);
  const summary = {
    runId: `ui-alignment-proof-gate:${Date.now()}`,
    createdAt: new Date().toISOString(),
    evidenceDir,
    requiredScenarioCount: REQUIRED_SCENARIOS.length,
    passedScenarioCount: scenarioResults.length - failed.length,
    failedScenarioCount: failed.length,
    passed: failed.length === 0,
    scenarios: scenarioResults,
  };

  const outputPath = join(outDir, `ui-alignment-proof-gate-${Date.now()}.json`);
  writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    passed: summary.passed,
    outputPath,
    failedScenarioCount: summary.failedScenarioCount,
  }, null, 2));

  if (args.strict && !summary.passed) {
    process.exit(1);
  }
}

main();
