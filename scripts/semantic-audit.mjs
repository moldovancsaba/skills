import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SEARCH_ROOTS = ["src/app", "src/components", "src/lib"];

const forbiddenPatterns = [
  { label: "legacy brand color", regex: /color="brand"|c="brand"|var\(--mantine-color-brand/i },
  { label: "generic product color", regex: /color="(blue|green|orange|violet|cyan|teal|indigo)"/i },
  { label: "legacy semantic alias in color prop", regex: /(color|variant|activeColor)\s*=\s*"(brand|blue|green|orange|violet|cyan|teal|indigo|amber|purple|knowledge|execution)"/i },
  { label: "legacy light-dark helper", regex: /light-dark\(/i },
  { label: "brand loader", regex: /Loader[^>]+color="brand"/i },
  { label: "undefined subtle surface token", regex: /var\(--surface-subtle\)/i },
  { label: "raw Mantine color token", regex: /var\(--mantine-color-[a-z-]+(?:-\d+)?\)/i },
  { label: "raw white text override", regex: /c="white"|color:\s*['"]white['"]/i },
  { label: "raw danger color", regex: /color="red"|c="red"|color:\s*['"]red['"]/i },
  { label: "hard-coded dark glass surface", regex: /rgba\(0,\s*0,\s*0,\s*0\.(2|8)\)|rgba\(20,\s*20,\s*20,\s*0\.95\)/i },
  { label: "hard-coded translucent light panel", regex: /rgba\(255,\s*255,\s*255,\s*0\.(03|05|06)\)/i },
  { label: "decorative route-card filler copy", regex: />\s*Access Layer\s*</i },
  { label: "ornamental uppercase text", regex: /\btt=\s*"uppercase"/i },
  { label: "ornamental letter-spacing text", regex: /\blts=\s*\{?\s*-?\d/i },
  { label: "local transition declaration", regex: /transition:\s*['"]/i },
  { label: "mantine transition component", regex: /<Transition\b|\bTransition,\s*$/im },
  { label: "unified card visual override", regex: /<UnifiedCard\b[^\n>]*\sstyle=\{/i },
  { label: "unified card subcomponent visual override", regex: /<(UnifiedCardBody|UnifiedCardSection|UnifiedCardActions|UnifiedCardFooter)\b[^\n>]*\sstyle=\{/i },
];

const allowedFiles = new Set([
  "src/components/providers.tsx",
]);

const rawSurfaceAllowlist = new Set([
  "src/components/ui/app-shell.tsx",
  "src/components/ui/unified-card.tsx",
  "src/components/ui/unified-card-modal.tsx",
]);

const typographyOverrideAllowlist = new Set([
  "src/components/providers.tsx",
  "src/components/ui/typography.tsx",
]);

const rawDomAllowlist = new Set([
  "src/app/layout.tsx",
]);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const findings = [];

for (const root of SEARCH_ROOTS) {
  const fullRoot = join(ROOT, root);
  let files = [];
  try {
    files = walk(fullRoot);
  } catch {
    continue;
  }

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (allowedFiles.has(rel)) continue;
    const content = readFileSync(file, "utf8");

    for (const pattern of forbiddenPatterns) {
      const match = content.match(pattern.regex);
      if (match) {
        findings.push({
          file: rel,
          label: pattern.label,
          match: match[0],
        });
      }
    }

    if (
      (rel.startsWith("src/app/") || rel.startsWith("src/components/")) &&
      !rawSurfaceAllowlist.has(rel)
    ) {
      const rawSurfaceMatch = content.match(/<(Card|Paper)\b/);
      if (rawSurfaceMatch) {
        findings.push({
          file: rel,
          label: "raw feature-level card surface",
          match: rawSurfaceMatch[0],
        });
      }
    }

    if (!typographyOverrideAllowlist.has(rel)) {
      const typographyOverrideMatch = content.match(/fontSize:|letterSpacing:|size="h[1-6]"|size="10px"/);
      if (typographyOverrideMatch) {
        findings.push({
          file: rel,
          label: "raw typography override",
          match: typographyOverrideMatch[0],
        });
      }
    }

    if (
      (rel.startsWith("src/app/") || rel.startsWith("src/components/")) &&
      !rawDomAllowlist.has(rel)
    ) {
      const rawDomMatch = content.match(/<(div|span|p|h1|h2|h3|h4|h5|h6|section|article|aside|header|footer|main|nav)\b/);
      if (rawDomMatch) {
        findings.push({
          file: rel,
          label: "raw feature-level DOM node",
          match: rawDomMatch[0],
        });
      }
    }

    if (rel !== "src/app/layout.tsx") {
      const classNameMatch = content.match(/\bclassName=/);
      if (classNameMatch) {
        findings.push({
          file: rel,
          label: "feature-level className hook",
          match: classNameMatch[0],
        });
      }
    }

    if (!typographyOverrideAllowlist.has(rel)) {
      const rawMantineTypographyImportMatch = content.match(/import\s*\{[^}]*\b(Text|Title)\b[^}]*\}\s*from\s*["']@mantine\/core["']/m);
      if (rawMantineTypographyImportMatch) {
        findings.push({
          file: rel,
          label: "raw Mantine typography import",
          match: rawMantineTypographyImportMatch[0].slice(0, 120),
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Semantic audit failed. Legacy patterns remain:\n");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.label} -> ${finding.match}`);
  }
  process.exit(1);
}

console.log("Semantic audit passed: no forbidden legacy product-surface patterns found.");
