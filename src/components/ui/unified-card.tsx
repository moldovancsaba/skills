'use client';

import type { ReactNode, CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { Card, Stack, Group, Title, Text, Box, Badge, rem } from "@mantine/core";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { getSemanticHoverStyle, getSemanticInsetStyle, getSemanticSurfaceStyle, type ModuleTone } from "@/lib/semantic-theme";
import type { CardFreshnessState } from "@/lib/card-freshness";

type UnifiedCardProps = {
  children: ReactNode;
  style?: CSSProperties;
  mt?: string | number;
  tone?: ModuleTone;
  interactive?: boolean;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

type UnifiedCardTextProps = UnifiedCardProps & {
  previewLength?: number;
  disablePreview?: boolean;
};

const singleLineClampStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 1,
  overflow: "hidden",
};

function getPreviewText(value: string, previewLength: number) {
  const normalized = stripTechnicalMetadata(value)
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= previewLength) {
    return normalized;
  }

  return `${normalized.slice(0, previewLength).trimEnd()}...`;
}

export function UnifiedCard({
  children,
  style,
  mt,
  tone = "neutral",
  interactive = false,
  onClick,
}: UnifiedCardProps) {
  const isInteractive = interactive || Boolean(onClick);
  const baseStyle = getSemanticSurfaceStyle(tone, { interactive: isInteractive, elevated: true });
  const hoverStyle = isInteractive ? getSemanticHoverStyle(tone) : null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClick(event as unknown as MouseEvent<HTMLDivElement>);
  };

  return (
    <Card
      mt={mt}
      style={style ? { ...baseStyle, ...style } : baseStyle}
      onMouseEnter={
        isInteractive
          ? (event) => {
              Object.assign((event.currentTarget as HTMLDivElement).style, hoverStyle ?? {});
            }
          : undefined
      }
      onMouseLeave={
        isInteractive
          ? (event) => {
              Object.assign((event.currentTarget as HTMLDivElement).style, baseStyle);
              if (style) {
                Object.assign((event.currentTarget as HTMLDivElement).style, style);
              }
            }
          : undefined
      }
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </Card>
  );
}

type UnifiedCardHeaderProps = {
  supporting?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  clampTitle?: boolean;
};

export function UnifiedCardHeader({
  supporting,
  title,
  description,
  actions,
  clampTitle = true,
}: UnifiedCardHeaderProps) {
  const titleStyle = clampTitle ? { ...singleLineClampStyle, fontWeight: 650 } : { fontWeight: 650 };

  return (
    <Stack gap="md" mb="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1 }}>
          {supporting && <Group gap="xs" wrap="wrap">{supporting}</Group>}
          <Stack gap={4}>
            {typeof title === "string" ? (
              <Title order={3} style={titleStyle}>
                {stripTechnicalMetadata(title)}
              </Title>
            ) : (
              <Title order={3} style={titleStyle}>
                {title}
              </Title>
            )}
            {description && (
              <Text c="var(--text-secondary)">
                {description}
              </Text>
            )}
          </Stack>
        </Stack>
        {actions && <Box>{actions}</Box>}
      </Group>
    </Stack>
  );
}

type UnifiedCardFreshnessBadgeProps = {
  freshness: CardFreshnessState | null;
};

export function UnifiedCardFreshnessBadge({ freshness }: UnifiedCardFreshnessBadgeProps) {
  if (!freshness) {
    return null;
  }

  const color = freshness === "NEW" ? "knowmore" : "tactical";

  return (
    <Badge color={color} variant="light" size="xs">
      {freshness}
    </Badge>
  );
}

export function UnifiedCardBody({ children, style, mt }: UnifiedCardProps) {
  return <Stack gap="md" style={style} mt={mt}>{children}</Stack>;
}

export function UnifiedCardText({
  children,
  style,
  mt,
  previewLength = 100,
  disablePreview = false,
}: UnifiedCardTextProps) {
  const content =
    typeof children === "string" && !disablePreview
      ? getPreviewText(children, previewLength)
      : children;

  return (
    <Text style={style} mt={mt} c="var(--text-secondary)" lh={1.6}>
      {content}
    </Text>
  );
}

export function UnifiedCardSection({ children, style, mt, tone = "neutral" }: UnifiedCardProps) {
  return (
    <Box
      p="md"
      style={{
        borderRadius: rem(12),
        ...getSemanticInsetStyle(tone),
        ...style,
      }}
      mt={mt}
    >
      {children}
    </Box>
  );
}

export function UnifiedCardActions({ children, style, mt }: UnifiedCardProps) {
  return <Group gap="sm" mt={mt || "md"} style={style}>{children}</Group>;
}

export function UnifiedCardFooter({ children, style, mt }: UnifiedCardProps) {
  return (
    <Card.Section
      inheritPadding
      py="md"
      mt={mt || "xl"}
      style={{
        borderTop: "1px solid var(--surface-section-border)",
        ...style,
      }}
    >
      {children}
    </Card.Section>
  );
}
