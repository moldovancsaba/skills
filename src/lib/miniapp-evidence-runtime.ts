import "server-only";

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { assertMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";
import {
  listMiniappResearchTasks,
  MINIAPP_RESEARCH_TASK_SOURCE_TYPE,
  type MiniappResearchTask,
  type MiniappResearchTaskStatus,
} from "@/lib/miniapp-research-planner";

export const MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE = "miniapp_evidence_artifact";

export type MiniappEvidenceArtifact = {
  id: string;
  miniappKey: string;
  destinationKey: string;
  contractKey: string;
  taskId: string;
  taskFingerprint: string;
  sourceUrl: string;
  finalUrl: string;
  title: string;
  snippet: string;
  textSnippet: string;
  provider: string;
  evidenceType: string;
  authorityScore: number;
  relevanceScore: number;
  httpStatus: number;
  status: "FOUND" | "FETCH_FAILED" | "REJECTED";
  fetchedAt: string;
};

type SearchResult = {
  provider: string;
  title: string;
  snippet: string;
  url: string;
};

type RuntimeInput = {
  companyId: string;
  visitorKey: string;
  destinationKeyHint?: unknown;
  taskId?: string;
  maxTasks?: number;
};

const USER_AGENT = "checklistLocalAI/1.0 (+https://checklist.checklistsquad.com; sovereign miniapp evidence runtime)";
const HTML_LIMIT_BYTES = 400_000;
const TEXT_LIMIT_CHARS = 6_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function decodeHtml(value: string) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value: string) {
  return decodeHtml(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function normalizeUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostOf(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function blockedByTask(url: string, task: MiniappResearchTask) {
  const host = hostOf(url);
  return Boolean(host) && task.blockedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractDuckDuckGoLink(rawHref: string) {
  const decoded = decodeHtml(rawHref);
  if (decoded.startsWith("//")) return `https:${decoded}`;
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
  try {
    const url = new URL(decoded, "https://html.duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return "";
  }
}

function parseDuckDuckGoResults(query: string, html: string) {
  if (!html || /bots use DuckDuckGo too|anomaly-modal|challenge-form/i.test(html)) return [] as SearchResult[];
  const matches = Array.from(
    html.matchAll(
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi,
    ),
  );
  return matches.slice(0, 8).map((match) => ({
    provider: "duckduckgo",
    title: stripTags(match[2] ?? "") || query,
    snippet: stripTags(match[3] ?? ""),
    url: normalizeUrl(extractDuckDuckGoLink(match[1] ?? "")),
  })).filter((item) => item.url);
}

function parseBingRssResults(query: string, xml: string) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 8).map((item) => ({
    provider: "bing-html",
    title: stripTags(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "") || query,
    snippet: stripTags(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || ""),
    url: normalizeUrl(decodeHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "")),
  })).filter((result) => result.url);
}

async function fetchText(url: string, timeoutMs: number) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,text/plain,application/rss+xml;q=0.9,*/*;q=0.1",
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = (await response.text()).slice(0, HTML_LIMIT_BYTES);
  return {
    ok: response.ok,
    status: response.status,
    finalUrl: response.url || url,
    contentType: response.headers.get("content-type") || "",
    text,
  };
}

async function searchTask(task: MiniappResearchTask) {
  const encoded = encodeURIComponent(task.query);
  const providers = [
    {
      name: "duckduckgo",
      url: `https://html.duckduckgo.com/html/?q=${encoded}`,
      parse: (text: string) => parseDuckDuckGoResults(task.query, text),
    },
    {
      name: "bing-html",
      url: `https://www.bing.com/search?format=rss&q=${encoded}`,
      parse: (text: string) => parseBingRssResults(task.query, text),
    },
  ];

  for (const provider of providers) {
    try {
      const response = await fetchText(provider.url, task.timeoutMs);
      if (!response.ok) continue;
      const parsed = provider.parse(response.text).map((result) => ({ ...result, provider: provider.name }));
      const allowed = parsed.filter((result) => !blockedByTask(result.url, task));
      if (allowed.length) return allowed;
    } catch {
      // Try the next free provider.
    }
  }
  return [] as SearchResult[];
}

function scoreEvidence(task: MiniappResearchTask, result: SearchResult, pageText: string) {
  const haystack = `${result.title} ${result.snippet} ${pageText}`.toLowerCase();
  const queryTerms = task.query.toLowerCase().split(/\s+/).filter((term) => term.length > 3);
  const matchedTerms = queryTerms.filter((term) => haystack.includes(term)).length;
  const relevanceScore = Math.round(Math.min(100, 30 + matchedTerms * 10 + (pageText.length > 800 ? 20 : 0)));
  const host = hostOf(result.url);
  const authorityScore = Math.round(Math.min(100, 45 + (host ? 15 : 0) + (task.expectedEvidenceType === "official_site" ? 20 : 10)));
  return { relevanceScore, authorityScore };
}

function buildTextSnippet(htmlOrText: string) {
  return stripTags(htmlOrText).slice(0, TEXT_LIMIT_CHARS);
}

async function updateTaskStatus(input: {
  task: MiniappResearchTask;
  status: MiniappResearchTaskStatus;
  attemptCount: number;
  reason?: string;
}) {
  const row = await prisma.destinationSourceDocument.findFirst({
    where: {
      id: input.task.id,
      sourceType: MINIAPP_RESEARCH_TASK_SOURCE_TYPE,
    },
    select: { id: true, metadata: true },
  });
  if (!row) return;
  const metadata = asRecord(row.metadata) ?? {};
  const previous = asRecord(metadata.miniappResearchTask) ?? {};
  await prisma.destinationSourceDocument.update({
    where: { id: row.id },
    data: {
      metadata: {
        ...metadata,
        miniappResearchTask: {
          ...previous,
          status: input.status,
          attemptCount: input.attemptCount,
          lastRuntimeReason: input.reason,
          updatedAt: new Date().toISOString(),
        },
      } as never,
      fetchedAt: new Date(),
    },
  });
}

async function persistEvidence(input: {
  companyId: string;
  destinationInstanceId: string;
  task: MiniappResearchTask;
  result: SearchResult;
  page: Awaited<ReturnType<typeof fetchText>>;
}) {
  const nowIso = new Date().toISOString();
  const textSnippet = buildTextSnippet(input.page.text);
  const scores = scoreEvidence(input.task, input.result, textSnippet);
  const artifact: MiniappEvidenceArtifact = {
    id: hashValue(`${input.task.fingerprint}:${input.result.url}`),
    miniappKey: input.task.miniappKey,
    destinationKey: input.task.destinationKey,
    contractKey: input.task.contractKey,
    taskId: input.task.id,
    taskFingerprint: input.task.fingerprint,
    sourceUrl: input.result.url,
    finalUrl: input.page.finalUrl,
    title: input.result.title,
    snippet: input.result.snippet,
    textSnippet,
    provider: input.result.provider,
    evidenceType: input.task.expectedEvidenceType,
    authorityScore: scores.authorityScore,
    relevanceScore: scores.relevanceScore,
    httpStatus: input.page.status,
    status: input.page.ok ? "FOUND" : "FETCH_FAILED",
    fetchedAt: nowIso,
  };
  const sourceUrl = normalizeUrl(input.page.finalUrl || input.result.url);
  const existing = await prisma.destinationSourceDocument.findFirst({
    where: {
      companyId: input.companyId,
      destinationInstanceId: input.destinationInstanceId,
      sourceType: MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE,
      sourceUrl,
    },
    select: { id: true },
  });
  const data = {
    sourceUrl,
    sourceType: MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE,
    officialnessScore: artifact.authorityScore,
    httpStatus: artifact.httpStatus,
    contentHash: hashValue(`${sourceUrl}\n${artifact.textSnippet}`),
    rawText: artifact.textSnippet,
    metadata: {
      miniappEvidenceArtifact: artifact,
      sourceCardInventoryIsSuccess: false,
      successMetric: "verified_public_visible_cards",
    } as never,
    fetchedAt: new Date(),
  };
  const saved = existing
    ? await prisma.destinationSourceDocument.update({ where: { id: existing.id }, data })
    : await prisma.destinationSourceDocument.create({
        data: {
          companyId: input.companyId,
          destinationInstanceId: input.destinationInstanceId,
          ...data,
        },
      });
  return { ...artifact, id: saved.id };
}

export async function runMiniappEvidenceRuntimeOnce(input: RuntimeInput) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(input.visitorKey, input.destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const contract = assertMiniappIntelligenceContract({ destinationKeyHint: destinationKey });
  const instance = await ensureDestinationInstance(input.companyId, destinationKey);
  const allTasks = await listMiniappResearchTasks(input.companyId, input.visitorKey, destinationKey);
  const runnable = allTasks
    .filter((task) => !input.taskId || task.id === input.taskId || task.fingerprint === input.taskId)
    .filter((task) => ["QUEUED", "FAILED", "NO_RESULTS"].includes(task.status))
    .sort((left, right) => right.priority - left.priority || left.updatedAt.localeCompare(right.updatedAt))
    .slice(0, Math.max(1, Math.min(10, Number(input.maxTasks) || 1)));

  const taskResults = [];
  for (const task of runnable) {
    const attemptCount = task.attemptCount + 1;
    await updateTaskStatus({ task, status: "RUNNING", attemptCount });
    try {
      const searchResults = (await searchTask(task)).slice(0, contract.researchPolicy.maxResultsPerTask);
      const artifacts: MiniappEvidenceArtifact[] = [];
      for (const result of searchResults) {
        try {
          const page = await fetchText(result.url, task.timeoutMs);
          const artifact = await persistEvidence({
            companyId: input.companyId,
            destinationInstanceId: instance.id,
            task,
            result,
            page,
          });
          if (artifact.status === "FOUND" && artifact.relevanceScore >= 50) artifacts.push(artifact);
        } catch {
          // Keep the task running through other results; per-result failures are expected on the open web.
        }
      }
      const nextStatus: MiniappResearchTaskStatus = artifacts.length
        ? "FOUND_EVIDENCE"
        : attemptCount >= contract.researchPolicy.maxDomainRetries
          ? "EXHAUSTED"
          : "NO_RESULTS";
      await updateTaskStatus({
        task,
        status: nextStatus,
        attemptCount,
        reason: artifacts.length ? "evidence_found" : "no_usable_results",
      });
      taskResults.push({ taskId: task.id, status: nextStatus, artifactCount: artifacts.length, artifacts });
    } catch (error) {
      const nextStatus: MiniappResearchTaskStatus = attemptCount >= contract.researchPolicy.maxDomainRetries ? "EXHAUSTED" : "FAILED";
      await updateTaskStatus({ task, status: nextStatus, attemptCount, reason: asString(error) || "runtime_failed" });
      taskResults.push({ taskId: task.id, status: nextStatus, artifactCount: 0, artifacts: [] });
    }
  }

  return {
    ok: true,
    visitorKey: input.visitorKey.toLowerCase(),
    destinationKey,
    contractKey: contract.key,
    sourceCardInventoryIsSuccess: false,
    runnableCount: runnable.length,
    taskResults,
  };
}
