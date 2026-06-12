import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const sourceRoots = ["src/app", "src/components", "src/lib"].map((entry) => path.join(repoRoot, entry));
const apiRoot = path.join(repoRoot, "src/app/api");
const outputPath = path.join(repoRoot, "logs/webapp-boundary-audit.json");

const businessImportPatterns = [
  "opportunitycards-runtime",
  "destination-mission-runner",
  "destination-mission-daemon",
  "visitor-candidate-pipeline",
  "visitor-card-classification",
  "visitor-public-projection-gate",
  "miniapp-research-planner",
  "miniapp-opportunity-lifecycle",
  "miniapp-promotion-gates",
  "miniapp-burst-controller",
  "scoring-contract",
  "upstream-card-scoring",
  "score-health",
  "opportunity-search.js",
  "scripts/lib",
];

const rawQueryPatterns = [
  /prisma\.[a-zA-Z0-9_]+\.count\s*\(/,
  /prisma\.[a-zA-Z0-9_]+\.aggregate\s*\(/,
  /prisma\.[a-zA-Z0-9_]+\.groupBy\s*\(/,
];

const uiCalculationPatterns = [
  /\.filter\s*\([^)]*\)\.length/,
  /\.reduce\s*\(/,
];

const fullBoardPayloadPatterns = [
  /include\s*:\s*{[^}]*feedback/is,
  /\.\.\.item/,
  /linkedFlashcards/,
  /actions\s*:/,
  /corrections\s*:/,
  /sources\s*:/,
];

const miniappScopedComponentFiles = new Set([
  "src/components/compare-home.tsx",
  "src/components/destination-learning-panel.tsx",
  "src/components/destination-mission-control.tsx",
  "src/components/visitor-ops-workspace.tsx",
]);

const hardcodedSurfacePatterns = [
  /<LinkCard[\s\S]{0,600}href=\{?`?\s*\/?\$\{companyId\}\/[a-z0-9-]+/i,
  /<MetricCard[\s\S]{0,500}label=/i,
  /chartData=\{/i,
];

function walkFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function lineFor(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function addFinding(findings, severity, category, filePath, line, message, evidence) {
  findings.push({
    severity,
    category,
    file: rel(filePath),
    line,
    message,
    evidence,
  });
}

function auditApiFile(filePath, content, findings) {
  for (const pattern of businessImportPatterns) {
    const index = content.indexOf(pattern);
    if (index >= 0) {
      addFinding(
        findings,
        "high",
        "WEBAPP_BUSINESS_IMPORT",
        filePath,
        lineFor(content, index),
        "API route references business/runtime logic. It should write/read projections or intents only.",
        pattern,
      );
    }
  }

  for (const pattern of rawQueryPatterns) {
    const match = pattern.exec(content);
    if (match) {
      addFinding(
        findings,
        "medium",
        "RAW_AGGREGATE_QUERY",
        filePath,
        lineFor(content, match.index),
        "API route calculates aggregate truth from raw records. Normal read paths should consume projections.",
        match[0],
      );
    }
  }

  const hasSeparatedBoardSummaryAndDetail = content.includes('payload: "board-summary"') && /if\s*\(\s*id\s*\)/.test(content);
  if (/board|opportunitycards|cards/i.test(filePath) && !hasSeparatedBoardSummaryAndDetail) {
    for (const pattern of fullBoardPayloadPatterns) {
      const match = pattern.exec(content);
      if (match) {
        addFinding(
          findings,
          "medium",
          "POSSIBLE_FULL_BOARD_PAYLOAD",
          filePath,
          lineFor(content, match.index),
          "Board/list route may return detail payloads. Boards should return lean summaries and fetch modal detail lazily.",
          match[0].slice(0, 120),
        );
      }
    }
  }
}

function auditUiFile(filePath, content, findings) {
  for (const pattern of uiCalculationPatterns) {
    const match = pattern.exec(content);
    if (match) {
      addFinding(
        findings,
        "medium",
        "UI_DERIVED_BUSINESS_COUNT",
        filePath,
        lineFor(content, match.index),
        "UI appears to derive counts/totals from loaded arrays. Counts should come from projection read models.",
        match[0].slice(0, 160),
      );
    }
  }

  const routeSegment = `${path.sep}src${path.sep}app${path.sep}[companyId]${path.sep}`;
  const isProtectedCompanyPageClient = (() => {
    const segmentIndex = filePath.indexOf(routeSegment);
    if (segmentIndex < 0) return false;
    const relativeWithinCompany = filePath.slice(segmentIndex + routeSegment.length);
    const parts = relativeWithinCompany.split(path.sep);
    if (parts.length < 2) return false;
    const pagePath = path.join(repoRoot, "src/app/[companyId]", parts[0], "page.tsx");
    if (!fs.existsSync(pagePath)) return false;
    const pageContent = fs.readFileSync(pagePath, "utf8");
    return pageContent.includes("requireUnitRouteAccess");
  })();

  const isCompanySurface = filePath.includes(`${path.sep}src${path.sep}app${path.sep}[companyId]${path.sep}`)
    || filePath.includes(`${path.sep}src${path.sep}components${path.sep}`)
    || filePath.endsWith(`${path.sep}src${path.sep}app${path.sep}home-client.tsx`);
  const isMiniappScopedComponent = miniappScopedComponentFiles.has(rel(filePath));
  const referencesCapabilities = /enabledModules|enabledBlocks|unitModules|moduleCapabilities|isModuleEnabled|capabilities/.test(content);
  if (isCompanySurface && !isMiniappScopedComponent && !isProtectedCompanyPageClient && !referencesCapabilities) {
    for (const pattern of hardcodedSurfacePatterns) {
      const match = pattern.exec(content);
      if (match) {
        addFinding(
          findings,
          "medium",
          "HARDCODED_UNGATED_UI_SURFACE",
          filePath,
          lineFor(content, match.index),
          "UI renders route cards, metric cards, or charts without visible capability/module gating.",
          match[0].slice(0, 180),
        );
        break;
      }
    }
  }
}

function buildSummary(findings) {
  const bySeverity = {};
  const byCategory = {};
  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
    byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
  }
  return {
    totalFindings: findings.length,
    bySeverity,
    byCategory,
  };
}

const files = sourceRoots.flatMap((root) => walkFiles(root));
const findings = [];

for (const filePath of files) {
  const content = fs.readFileSync(filePath, "utf8");
  if (filePath.startsWith(apiRoot)) {
    auditApiFile(filePath, content, findings);
  } else if (/\.(tsx|jsx)$/.test(filePath)) {
    auditUiFile(filePath, content, findings);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: "report-only",
  contract: "docs/WEBAPP_BOUNDARY_CONTRACT.md",
  summary: buildSummary(findings),
  findings: findings.sort((left, right) => {
    const severityRank = { high: 0, medium: 1, low: 2 };
    return (severityRank[left.severity] ?? 9) - (severityRank[right.severity] ?? 9)
      || left.file.localeCompare(right.file)
      || left.line - right.line;
  }),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`[webapp-boundary] ${report.summary.totalFindings} finding(s) written to ${rel(outputPath)}`);
for (const [category, count] of Object.entries(report.summary.byCategory)) {
  console.log(`[webapp-boundary] ${category}: ${count}`);
}
