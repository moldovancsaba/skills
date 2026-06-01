import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = {
    block: null,
    miniapp: null,
    companyId: "",
    outDir: "logs",
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--block" && argv[index + 1]) {
      args.block = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--miniapp" && argv[index + 1]) {
      args.miniapp = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--companyId" && argv[index + 1]) {
      args.companyId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--outDir" && argv[index + 1]) {
      args.outDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--strict") {
      args.strict = true;
    }
  }

  return args;
}

function checkResult(name, status, message, artifacts = []) {
  return { name, status, message, artifacts };
}

function runNodeScript(scriptPath, scriptArgs = []) {
  const absolute = join(ROOT, scriptPath);
  if (!existsSync(absolute)) {
    return {
      ok: false,
      output: `Missing script: ${scriptPath}`,
    };
  }
  const result = spawnSync("node", [absolute, ...scriptArgs], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const output = [result.stdout || "", result.stderr || ""].join("\n").trim();
  return {
    ok: result.status === 0,
    output,
  };
}

function hasMandatoryGdsRulebookText() {
  const files = [
    "docs/RULEBOOK.md",
    "docs/IMPLEMENTATION_RULEBOOK.md",
  ];

  for (const file of files) {
    const absolute = join(ROOT, file);
    if (!existsSync(absolute)) {
      return { ok: false, reason: `Missing required rulebook file: ${file}` };
    }
    const text = readFileSync(absolute, "utf8");
    if (!text.includes("sovereignsquad/general-design-system")) {
      return { ok: false, reason: `Rulebook file does not enforce GDS source: ${file}` };
    }
  }
  return { ok: true, reason: "Rulebook files enforce GDS source." };
}

function verifyRequiredFiles(requiredFiles) {
  const missing = requiredFiles.filter((file) => !existsSync(join(ROOT, file)));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function verifyPackageScripts(requiredScripts) {
  const packageJsonPath = join(ROOT, "package.json");
  if (!existsSync(packageJsonPath)) {
    return { ok: false, missing: requiredScripts, reason: "package.json not found" };
  }
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const scripts = packageJson?.scripts ?? {};
  const missing = requiredScripts.filter((name) => typeof scripts[name] !== "string");
  return {
    ok: missing.length === 0,
    missing,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const checks = [];

  const baseFiles = [
    "src/lib/check-foundation/registry-data.json",
    "src/lib/check-foundation/card-registry-data.json",
    "src/lib/check-foundation/miniapp-registry-data.json",
    "src/lib/check-foundation/unit-packages-data.json",
    "src/lib/check-foundation/capabilities-v3.ts",
    "src/lib/check-foundation/miniapp-route-guard.ts",
    "src/app/api/units/[unitId]/miniapps/[miniappId]/missions/route.ts",
    "src/app/api/units/[unitId]/miniapps/[miniappId]/candidates/route.ts",
    "src/app/api/units/[unitId]/miniapps/[miniappId]/packets/[packetId]/approve/route.ts",
    "src/app/api/units/[unitId]/miniapps/[miniappId]/packets/[packetId]/publish/route.ts",
    "src/app/api/units/[unitId]/miniapps/[miniappId]/content/[contentId]/refresh/route.ts",
    "src/app/api/classscout/landing-summary/route.ts",
    "src/app/api/compare/landing-summary/route.ts",
  ];

  if (args.block === "project") {
    baseFiles.push("src/app/[companyId]/unit-board/page.tsx");
  }
  if (args.block === "miniapp") {
    baseFiles.push("src/lib/check-foundation/miniapp-registry.ts");
  }

  const requiredFiles = verifyRequiredFiles(baseFiles);
  checks.push(requiredFiles.ok
    ? checkResult("foundation_files_present", "passed", "Required foundation files exist.")
    : checkResult("foundation_files_present", "failed", `Missing files: ${requiredFiles.missing.join(", ")}`));

  const packageScripts = verifyPackageScripts([
    "audit:terminology",
    "test:check-foundation-registry",
    "test:check-foundation-cards",
    "test:check-foundation-miniapps",
    "test:check-foundation-packages",
    "verify:classscout-golden-path",
    "verify:compare-golden-path",
    "verify:check-foundation",
  ]);
  checks.push(packageScripts.ok
    ? checkResult("foundation_package_scripts", "passed", "Required foundation scripts exist in package.json.")
    : checkResult("foundation_package_scripts", "failed", `Missing scripts: ${packageScripts.missing.join(", ")}`));

  const gdsRulebook = hasMandatoryGdsRulebookText();
  checks.push(gdsRulebook.ok
    ? checkResult("gds_rulebook_enforced", "passed", gdsRulebook.reason)
    : checkResult("gds_rulebook_enforced", "failed", gdsRulebook.reason));

  const terminology = runNodeScript("scripts/audit-terminology.mjs");
  checks.push(terminology.ok
    ? checkResult("terminology_audit", "passed", "Terminology audit passed.")
    : checkResult("terminology_audit", "failed", terminology.output || "Terminology audit failed."));

  const registryContract = runNodeScript("scripts/test-check-foundation-registry.mjs");
  checks.push(registryContract.ok
    ? checkResult("block_module_registry_contract", "passed", "Block/Module registry contract passed.")
    : checkResult("block_module_registry_contract", "failed", registryContract.output || "Registry contract failed."));

  const cardRegistryContract = runNodeScript("scripts/test-check-foundation-card-registry.mjs");
  checks.push(cardRegistryContract.ok
    ? checkResult("card_registry_contract", "passed", "Card registry contract passed.")
    : checkResult("card_registry_contract", "failed", cardRegistryContract.output || "Card registry contract failed."));

  const miniappRegistryContract = runNodeScript("scripts/test-check-foundation-miniapp-registry.mjs");
  checks.push(miniappRegistryContract.ok
    ? checkResult("miniapp_registry_contract", "passed", "Miniapp registry contract passed.")
    : checkResult("miniapp_registry_contract", "failed", miniappRegistryContract.output || "Miniapp registry contract failed."));

  const packageContract = runNodeScript("scripts/test-check-foundation-packages.mjs");
  checks.push(packageContract.ok
    ? checkResult("unit_package_contract", "passed", "Unit package contract passed.")
    : checkResult("unit_package_contract", "failed", packageContract.output || "Unit package contract failed."));

  if (args.companyId && args.miniapp === "classscout") {
    const result = runNodeScript("scripts/verify-classscout-golden-path.mjs", ["--companyId", args.companyId]);
    checks.push(result.ok
      ? checkResult("miniapp_classscout_golden_path", "passed", "ClassScout golden path passed.")
      : checkResult("miniapp_classscout_golden_path", "failed", result.output || "ClassScout golden path failed."));
  } else if (args.companyId && args.miniapp === "compare") {
    const result = runNodeScript("scripts/verify-compare-golden-path.mjs", ["--companyId", args.companyId]);
    checks.push(result.ok
      ? checkResult("miniapp_compare_golden_path", "passed", "Compare golden path passed.")
      : checkResult("miniapp_compare_golden_path", "failed", result.output || "Compare golden path failed."));
  } else {
    checks.push(checkResult(
      "miniapp_live_golden_path",
      "skipped",
      "Skipped live miniapp golden-path check. Use --miniapp <classscout|compare> and --companyId <id> to run.",
    ));
  }

  const failed = checks.filter((item) => item.status === "failed");
  const passed = checks.filter((item) => item.status === "passed");
  const skipped = checks.filter((item) => item.status === "skipped");
  const report = {
    runId: `check-foundation:${Date.now()}`,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    input: args,
    summary: {
      total: checks.length,
      passed: passed.length,
      failed: failed.length,
      skipped: skipped.length,
    },
    checks,
  };

  mkdirSync(args.outDir, { recursive: true });
  const reportPath = join(args.outDir, `check-foundation-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    reportPath,
    summary: report.summary,
  }, null, 2));

  if (failed.length > 0 || (args.strict && skipped.length > 0)) {
    process.exit(1);
  }
}

main();
