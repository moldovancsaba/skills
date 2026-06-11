#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(`GDS runtime provider contract failed: ${message}`);
  process.exit(1);
}

const providers = read("src/components/providers.tsx");
const layout = read("src/app/layout.tsx");
const i18n = read("src/lib/ui-i18n.tsx");
const config = read("src/lib/ui-language-config.ts");
const bootstrap = read("src/lib/gds-locale-bootstrap.generated.ts");

if (!providers.includes("useI18n")) {
  fail("Providers must read the active UI language before rendering GdsProvider.");
}

if (!providers.includes("locale={language}")) {
  fail("GdsProvider locale must be wired to the active UI language.");
}

if (providers.includes('locale="en"')) {
  fail("GdsProvider must not hardcode locale=\"en\".");
}

if (!layout.includes("GDS_LOCALE_DIRECTION_MAP")) {
  fail("Root layout bootstrap must consume the GDS-verified locale direction map.");
}

if (layout.includes('language === "ar"') || layout.includes('language === "he"')) {
  fail("Root layout bootstrap must not hardcode RTL language ids.");
}

if (!i18n.includes("@doneisbetter/gds/client")) {
  fail("Client UI language context must derive locale metadata from the GDS client export.");
}

if (!i18n.includes("getUiLanguageDirection")) {
  fail("Client UI language context must centralize language direction resolution.");
}

if (!config.includes("UI_LANGUAGE_STORAGE_KEY") || !config.includes("UI_LANGUAGE_VALUES")) {
  fail("Server-safe UI language config must expose storage key and supported values.");
}

const valuesMatch = config.match(/UI_LANGUAGE_VALUES = \[([^\]]+)\]/);
if (!valuesMatch) {
  fail("Server-safe UI language config must declare UI_LANGUAGE_VALUES as a literal list.");
}

const supportedLanguages = [...valuesMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const bootstrapDirections = Object.fromEntries(
  [...bootstrap.matchAll(/\b(en|hu|es|ar|he): "(ltr|rtl)"/g)].map((match) => [match[1], match[2]]),
);

const { getGdsLocaleMetadata, isGdsRtlLocale } = await import("@doneisbetter/gds/server");

for (const language of supportedLanguages) {
  const metadata = getGdsLocaleMetadata(language);
  const expectedDirection = metadata.direction === "rtl" || isGdsRtlLocale(language) ? "rtl" : "ltr";
  const actualDirection = bootstrapDirections[language];
  if (actualDirection !== expectedDirection) {
    fail(`GDS locale bootstrap map is stale for ${language}: expected ${expectedDirection}, got ${actualDirection}.`);
  }
}

if (!bootstrap.includes("Verified by scripts/test-gds-runtime-provider.mjs")) {
  fail("GDS locale bootstrap map must document its verification guard.");
}

console.log("GDS runtime provider contract OK.");
