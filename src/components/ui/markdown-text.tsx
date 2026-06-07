'use client';
import { Text } from "@/components/ui/typography";

import type { ReactNode } from "react";
import { Fragment } from "react";
import { Box, List } from "@/components/gds/primitives";
import { getSemanticPillStyle } from "@/lib/semantic-theme";

type MarkdownTextProps = {
  markdown: string;
  previewLength?: number;
  previewOnly?: boolean;
};

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] };

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function previewMarkdown(markdown: string, previewLength: number) {
  const plain = stripMarkdown(markdown);
  if (plain.length <= previewLength) return plain;
  return `${plain.slice(0, previewLength).trimEnd()}...`;
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown
    .replace(/\r\n/g, "\n")
    .split("\n");

  const blocks: Block[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: "unordered-list" | "ordered-list" | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ").trim() });
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    blocks.push({ type: listType, items: [...listItems] });
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "unordered-list") {
        flushList();
      }
      listType = "unordered-list";
      listItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ordered-list") {
        flushList();
      }
      listType = "ordered-list";
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    if (listType) {
      flushList();
    }
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Text key={index} span fw={700}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <Text key={index} span fs="italic">{part.slice(1, -1)}</Text>;
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return <Text key={index} span fs="italic">{part.slice(1, -1)}</Text>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text
          key={index}
          span
          ff="monospace"
          px={4}
          py={1}
          style={getSemanticPillStyle("neutral", { radius: "4px" })}
        >
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MarkdownText({
  markdown,
  previewLength = 100,
  previewOnly = false,
}: MarkdownTextProps) {
  if (previewOnly) {
    return (
      <Text size="sm" c="var(--text-secondary)" lh={1.6}>
        {previewMarkdown(markdown, previewLength)}
      </Text>
    );
  }

  const blocks = parseBlocks(markdown);

  return (
    <Box>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const size =
            block.level <= 2 ? "md" : block.level === 3 ? "sm" : "xs";
          const weight = block.level <= 3 ? 700 : 600;
          return (
            <Text
              key={index}
              size={size}
              fw={weight}
              c="var(--text-primary)"
              mt={index === 0 ? 0 : "md"}
              mb="xs"
            >
              {renderInline(block.text)}
            </Text>
          );
        }

        if (block.type === "unordered-list" || block.type === "ordered-list") {
          return (
            <List
              key={index}
              type={block.type === "ordered-list" ? "ordered" : "unordered"}
              spacing="xs"
              size="sm"
              c="var(--text-secondary)"
              mb="sm"
            >
              {block.items.map((item, itemIndex) => (
                <List.Item key={itemIndex}>
                  <Text size="sm" c="var(--text-secondary)" lh={1.6} span>
                    {renderInline(item)}
                  </Text>
                </List.Item>
              ))}
            </List>
          );
        }

        return (
          <Text key={index} size="sm" c="var(--text-secondary)" lh={1.6} mb="sm">
            {renderInline(block.text)}
          </Text>
        );
      })}
    </Box>
  );
}
