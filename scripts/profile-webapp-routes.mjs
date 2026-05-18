#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.CHECKLIST_PROFILE_BASE_URL || "https://checklist.sovereignsquad.com";
const DEFAULT_COOKIE_NAME = process.env.CHECKLIST_PROFILE_COOKIE_NAME || "checklist_session";

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    companyId: process.env.CHECKLIST_PROFILE_COMPANY_ID || "",
    rawCookie: process.env.CHECKLIST_PROFILE_COOKIE || "",
    sessionToken: process.env.CHECKLIST_PROFILE_SESSION_TOKEN || "",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") options.help = true;
    if (value === "--base-url") options.baseUrl = argv[index + 1] || options.baseUrl;
    if (value === "--company-id") options.companyId = argv[index + 1] || options.companyId;
    if (value === "--cookie") options.rawCookie = argv[index + 1] || options.rawCookie;
    if (value === "--session-token") options.sessionToken = argv[index + 1] || options.sessionToken;
  }

  return options;
}

function toCookieHeader({ rawCookie, sessionToken }) {
  if (rawCookie) return rawCookie;
  if (sessionToken) return `${DEFAULT_COOKIE_NAME}=${sessionToken}`;
  return "";
}

function printHelp() {
  console.log(`Usage:
  npm run profile:webapp -- --base-url https://checklist.sovereignsquad.com --session-token <token>

Options:
  --base-url       Base webapp URL to profile
  --company-id     Optional company id for company-scoped routes
  --cookie         Full Cookie header value
  --session-token  Raw checklist_session token

Environment fallbacks:
  CHECKLIST_PROFILE_BASE_URL
  CHECKLIST_PROFILE_COMPANY_ID
  CHECKLIST_PROFILE_COOKIE
  CHECKLIST_PROFILE_SESSION_TOKEN
  CHECKLIST_PROFILE_COOKIE_NAME`);
}

function parseServerTiming(header) {
  if (!header) return [];
  return header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [namePart, durationPart] = entry.split(";");
      const duration = durationPart?.startsWith("dur=") ? Number(durationPart.slice(4)) : null;
      return {
        name: namePart || "step",
        durationMs: Number.isFinite(duration) ? duration : null,
      };
    });
}

async function requestJson(url, cookieHeader) {
  const response = await fetch(url, {
    headers: {
      "x-checklist-profile": "1",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    url,
    body,
    serverTiming: parseServerTiming(response.headers.get("server-timing")),
  };
}

function printResult(result) {
  const totalMs = result.body?.profile?.totalMs
    ?? result.serverTiming.find((entry) => entry.name === "total")?.durationMs
    ?? null;
  console.log(`\n${result.status} ${result.url}`);
  console.log(`total: ${totalMs == null ? "?" : `${totalMs}ms`}`);
  const steps = Array.isArray(result.body?.profile?.steps) ? result.body.profile.steps : result.serverTiming;
  if (steps.length) {
    for (const step of steps) {
      console.log(`  - ${step.name}: ${step.durationMs == null ? "?" : `${step.durationMs}ms`}`);
    }
  } else {
    console.log("  - no profile steps returned");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const cookieHeader = toCookieHeader(options);
  if (!cookieHeader) {
    console.error("Missing auth cookie. Provide --cookie, --session-token, CHECKLIST_PROFILE_COOKIE, or CHECKLIST_PROFILE_SESSION_TOKEN.");
    process.exit(1);
  }

  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const sessionResult = await requestJson(`${baseUrl}/api/auth/session?scope=identity&profile=1`, cookieHeader);
  printResult(sessionResult);
  if (!sessionResult.ok) process.exit(1);

  const companiesResult = await requestJson(`${baseUrl}/api/companies?profile=1`, cookieHeader);
  printResult(companiesResult);
  if (!companiesResult.ok) process.exit(1);

  const companies = Array.isArray(companiesResult.body?.companies)
    ? companiesResult.body.companies
    : Array.isArray(companiesResult.body)
      ? companiesResult.body
      : [];
  const companyId = options.companyId || companies[0]?.id;
  if (!companyId) {
    console.error("No company id available for company-scoped route profiling.");
    process.exit(1);
  }

  for (const path of [
    `/api/companies/${companyId}/nav?profile=1`,
    `/api/companies/${companyId}/dashboard?profile=1`,
    `/api/companies/${companyId}/planning-summary?profile=1`,
  ]) {
    const result = await requestJson(`${baseUrl}${path}`, cookieHeader);
    printResult(result);
    if (!result.ok) process.exit(1);
  }
}

main().catch((error) => {
  console.error("[profile-webapp-routes] failed:", error);
  process.exit(1);
});
