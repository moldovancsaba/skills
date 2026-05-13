export function normalizeMarkdownBody(value: string | null | undefined): string {
  const cleaned = String(value || "")
    .replace(/```[a-z0-9_-]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/\u00a0/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  return cleaned
    .split("\n")
    .map((line) => {
      const headingMatch = line.match(/^\s*(#{1,6})\s*(.+?)\s*#*\s*$/);
      if (headingMatch) {
        return `${headingMatch[1]} ${headingMatch[2].trim()}`;
      }

      const unorderedMatch = line.match(/^\s*[•*+-]\s+(.+)$/);
      if (unorderedMatch) {
        return `- ${unorderedMatch[1].trim()}`;
      }

      const orderedMatch = line.match(/^\s*(\d+)[\).\]]\s+(.+)$/);
      if (orderedMatch) {
        return `${orderedMatch[1]}. ${orderedMatch[2].trim()}`;
      }

      return line.trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
