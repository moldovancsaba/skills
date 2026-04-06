import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GENERIC_NAV_LABELS = new Set([
  "about",
  "about us",
  "faq",
  "home",
  "contact",
  "login",
  "log in",
  "sign up",
  "why spl",
  "membership and services",
  "our methodology",
  "where are we",
]);

function normalizeText(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizeUrl(value) {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!url.hostname || !url.hostname.includes(".")) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function looksSuspiciousSourceName(value) {
  const trimmed = normalizeText(value)?.toLowerCase();
  if (!trimmed) {
    return true;
  }

  return (
    trimmed === "instagram" ||
    trimmed === "facebook" ||
    trimmed === "tiktok" ||
    trimmed === "tiktok - make your day" ||
    /^ww\d+$/i.test(trimmed) ||
    trimmed.length <= 3 ||
    /^[a-z0-9]+$/i.test(trimmed)
  );
}

function looksLikeGeneratedAnalysis(value) {
  const normalized = normalizeText(value)?.toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("conclusions:") ||
    normalized.includes("recommendation:") ||
    normalized.includes("create an account or log in to instagram") ||
    normalized.includes("tiktok - make your day") ||
    normalized.includes("about us why spl") ||
    normalized.includes("loading...") ||
    normalized.includes("benchmark our offer against the competitor's visible promise around") ||
    normalized.includes("if this positioning keeps landing, expect the competitor to keep investing around") ||
    normalized.includes("the competitor appears to lead with") ||
    normalized.includes("the competitor's clearest visible positioning signal is")
  );
}

function cleanUrlList(urls) {
  return [...new Set((urls ?? []).map(canonicalizeUrl).filter(Boolean))];
}

function shouldClearFeatureList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return false;
  }

  return values.every((value) => {
    const normalized = normalizeText(value)?.toLowerCase();
    return !normalized || GENERIC_NAV_LABELS.has(normalized);
  });
}

function looksGeneratedWatchedContent(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("qualityGate" in value || "pages" in value || "analysis" in value || "newsSignals" in value),
  );
}

async function repairProducts() {
  const products = await prisma.product.findMany();

  for (const product of products) {
    const urls = cleanUrlList(product.urls);
    const data = {};
    const fallbackName = urls[0] ?? product.name;

    if (JSON.stringify(urls) !== JSON.stringify(product.urls)) {
      data.urls = urls;
    }

    if (looksSuspiciousSourceName(product.name) && fallbackName !== product.name) {
      data.name = fallbackName;
    }

    if (looksLikeGeneratedAnalysis(product.description)) {
      data.description = null;
    }

    if (shouldClearFeatureList(product.features)) {
      data.features = [];
    }

    if (Object.keys(data).length > 0) {
      await prisma.product.update({
        where: { id: product.id },
        data,
      });
    }
  }
}

async function repairCompetitors() {
  const competitors = await prisma.competitor.findMany();

  for (const competitor of competitors) {
    const urls = cleanUrlList(competitor.urls);
    const data = {};
    const fallbackName = urls[0] ?? competitor.name;

    if (JSON.stringify(urls) !== JSON.stringify(competitor.urls)) {
      data.urls = urls;
    }

    if (looksSuspiciousSourceName(competitor.name) && fallbackName !== competitor.name) {
      data.name = fallbackName;
    }

    if (looksLikeGeneratedAnalysis(competitor.positioning)) {
      data.positioning = null;
    }

    if (shouldClearFeatureList(competitor.strengths)) {
      data.strengths = [];
    }

    if (shouldClearFeatureList(competitor.weaknesses)) {
      data.weaknesses = [];
    }

    if (looksGeneratedWatchedContent(competitor.watchedContent)) {
      data.watchedContent = Prisma.JsonNull;
    }

    if (Object.keys(data).length > 0) {
      await prisma.competitor.update({
        where: { id: competitor.id },
        data,
      });
    }
  }
}

try {
  await repairProducts();
  await repairCompetitors();
} finally {
  await prisma.$disconnect();
}
