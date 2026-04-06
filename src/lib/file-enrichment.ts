import { extname } from "node:path";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deepseek-r1:1.5b";
const OLLAMA_TIMEOUT_MS = 7000;
const MAX_EXTRACTED_TEXT = 12000;
const MAX_PREVIEW_LINES = 20;

type UploadedFileSeed = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  hashtags: string[];
  content: Buffer;
};

type FileAnalysis = {
  summary?: string;
  explanations?: string[];
  conclusions?: string[];
  evaluations?: string[];
  judgments?: string[];
  recommendations?: string[];
  comparisons?: string[];
  industryNews?: string[];
  researchPlans?: string[];
  forecasts?: string[];
  prices?: string[];
  marketChatter?: string[];
};

type FileExtraction = {
  extractedText: string | null;
  watchedContent: {
    extractedAt: string;
    mimeType: string;
    extension: string;
    hashtags: string[];
    sizeBytes: number;
    extractionMethod: string;
    preview: string[];
    qualityGate: {
      passed: boolean;
      reason: string;
    };
    analysis: FileAnalysis | null;
  } | null;
};

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueShortStrings(values: Array<string | null | undefined>, maxItems = 6) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = collapseWhitespace(value ?? "");
    if (!normalized || normalized.length > 220 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function stripTags(value: string) {
  return collapseWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function printableTextFromBuffer(buffer: Buffer) {
  const latin = buffer.toString("latin1");
  const matches = latin.match(/[A-Za-z0-9][A-Za-z0-9\s,.:;()_\-/%$#@&]{4,}/g) ?? [];
  return collapseWhitespace(matches.join(" "));
}

function parseJsonToText(value: string) {
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

function parseDelimitedToText(value: string, delimiter: string) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_PREVIEW_LINES);

  if (lines.length === 0) {
    return "";
  }

  const header = lines[0].split(delimiter).map((cell) => cell.trim()).filter(Boolean);
  const rows = lines.slice(1, 6).map((line) => line.split(delimiter).map((cell) => cell.trim()).join(" | "));

  return [
    header.length > 0 ? `Columns: ${header.join(", ")}` : null,
    rows.length > 0 ? `Rows: ${rows.join(" || ")}` : null,
  ].filter(Boolean).join("\n");
}

function extractText(seed: UploadedFileSeed) {
  const extension = extname(seed.name).toLowerCase();
  const utf8 = seed.content.toString("utf8");
  const mime = seed.mimeType.toLowerCase();

  if (
    mime.startsWith("text/") ||
    [".txt", ".md", ".markdown", ".log", ".rtf"].includes(extension)
  ) {
    return {
      method: "plain-text",
      text: utf8,
    };
  }

  if (mime.includes("json") || extension === ".json") {
    return {
      method: "json",
      text: parseJsonToText(utf8),
    };
  }

  if (mime.includes("csv") || extension === ".csv") {
    return {
      method: "csv",
      text: parseDelimitedToText(utf8, ","),
    };
  }

  if (mime.includes("tsv") || extension === ".tsv") {
    return {
      method: "tsv",
      text: parseDelimitedToText(utf8, "\t"),
    };
  }

  if (
    mime.includes("html") ||
    mime.includes("xml") ||
    [".html", ".htm", ".xml"].includes(extension)
  ) {
    return {
      method: "html",
      text: stripTags(utf8),
    };
  }

  return {
    method: "binary-strings",
    text: printableTextFromBuffer(seed.content),
  };
}

function previewLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => collapseWhitespace(line))
    .filter(Boolean)
    .slice(0, 8);
}

async function summarizeFile(seed: UploadedFileSeed, extractedText: string) {
  const trimmed = collapseWhitespace(extractedText).slice(0, MAX_EXTRACTED_TEXT);
  if (!trimmed || trimmed.length < 120) {
    return null;
  }

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON with keys summary, explanations, conclusions, evaluations, judgments, recommendations, comparisons, industryNews, researchPlans, forecasts, prices, marketChatter. summary must be a single string. All other keys must be arrays of short strings. Use only evidence from the uploaded file. Do not fabricate news or prices. If a category is unsupported by the evidence, return an empty array.",
          },
          {
            role: "user",
            content: `Build decision-grade flashcard inputs from this uploaded file.\n\nFilename: ${seed.name}\nMime type: ${seed.mimeType}\nHashtags: ${seed.hashtags.join(", ") || "none"}\n\nExtracted file evidence:\n${trimmed}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    return JSON.parse(jsonMatch[0]) as FileAnalysis;
  } catch {
    return null;
  }
}

function fallbackAnalysis(extractedText: string): FileAnalysis {
  const sentences = extractedText
    .split(/(?<=[.!?])\s+/)
    .map((line) => collapseWhitespace(line))
    .filter((line) => line.length > 40);

  const bullets = uniqueShortStrings(sentences, 6);
  return {
    summary: bullets[0],
    explanations: bullets.slice(0, 2),
    conclusions: bullets.slice(0, 2),
    evaluations: bullets.slice(2, 4),
    judgments: [],
    recommendations: [],
    comparisons: [],
    industryNews: [],
    researchPlans: [],
    forecasts: [],
    prices: [],
    marketChatter: [],
  };
}

export async function enrichUploadedFile(seed: UploadedFileSeed): Promise<FileExtraction> {
  const extension = extname(seed.name).toLowerCase();
  const extracted = extractText(seed);
  const cleanedText = collapseWhitespace(extracted.text).slice(0, MAX_EXTRACTED_TEXT);

  if (!cleanedText || cleanedText.length < 80) {
    return {
      extractedText: null,
      watchedContent: {
        extractedAt: new Date().toISOString(),
        mimeType: seed.mimeType,
        extension,
        hashtags: seed.hashtags,
        sizeBytes: seed.sizeBytes,
        extractionMethod: extracted.method,
        preview: previewLines(extracted.text),
        qualityGate: {
          passed: false,
          reason: "insufficient-readable-file-text",
        },
        analysis: null,
      },
    };
  }

  const aiAnalysis = await summarizeFile(seed, cleanedText);
  const analysis = aiAnalysis ?? fallbackAnalysis(cleanedText);
  const usefulSignals = [
    analysis.summary,
    ...(analysis.explanations ?? []),
    ...(analysis.conclusions ?? []),
    ...(analysis.evaluations ?? []),
    ...(analysis.judgments ?? []),
    ...(analysis.recommendations ?? []),
    ...(analysis.comparisons ?? []),
    ...(analysis.researchPlans ?? []),
    ...(analysis.prices ?? []),
  ].filter(Boolean);

  return {
    extractedText: cleanedText,
    watchedContent: {
      extractedAt: new Date().toISOString(),
      mimeType: seed.mimeType,
      extension,
      hashtags: seed.hashtags,
      sizeBytes: seed.sizeBytes,
      extractionMethod: extracted.method,
      preview: previewLines(extracted.text),
      qualityGate: {
        passed: usefulSignals.length > 0,
        reason: usefulSignals.length > 0 ? "sufficient-file-evidence" : "weak-file-evidence",
      },
      analysis,
    },
  };
}
