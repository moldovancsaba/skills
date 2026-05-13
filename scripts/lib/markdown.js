function stripFences(value) {
  return String(value || "")
    .replace(/```[a-z0-9_-]*\n?/gi, "")
    .replace(/```/g, "");
}

function stripHtml(value) {
  return value.replace(/<[^>]+>/g, "");
}

function normalizeHeadingLine(line) {
  const match = line.match(/^\s*(#{1,6})\s*(.+?)\s*#*\s*$/);
  if (!match) return line.trimEnd();
  return `${match[1]} ${match[2].trim()}`;
}

function normalizeListLine(line) {
  const unordered = line.match(/^\s*[•*+-]\s+(.+)$/);
  if (unordered) {
    return `- ${unordered[1].trim()}`;
  }

  const ordered = line.match(/^\s*(\d+)[\).\]]\s+(.+)$/);
  if (ordered) {
    return `${ordered[1]}. ${ordered[2].trim()}`;
  }

  return line.trimEnd();
}

function normalizeMarkdownBody(value) {
  const cleaned = stripHtml(stripFences(value))
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/\u00a0/g, " ")
    .trim();

  if (!cleaned) return "";

  const normalized = cleaned
    .split("\n")
    .map((line) => normalizeListLine(normalizeHeadingLine(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return normalized;
}

const MARKDOWN_CARD_BODY_INSTRUCTION = [
  "The body/description field MUST be valid Markdown plain text.",
  "Use Markdown structure only when it improves readability.",
  "Prefer short paragraphs by default.",
  "Use `##` or `###` subtitles for real sections.",
  "Use `-` bullet lists or `1.` numbered lists for real lists.",
  "Do not use HTML.",
  "Do not wrap the body in code fences.",
  "Do not emit a top-level '# title' inside the body.",
].join(" ");

module.exports = {
  normalizeMarkdownBody,
  MARKDOWN_CARD_BODY_INSTRUCTION,
};
