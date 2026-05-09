'use client';

import type { ReactNode, CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { Card, Stack, Group, Box, Badge, rem } from "@mantine/core";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { getSemanticHoverStyle, getSemanticInsetStyle, getSemanticSurfaceStyle, type ModuleTone } from "@/lib/semantic-theme";
import type { CardFreshnessState } from "@/lib/card-freshness";
import { applySurfaceInteractionHandlers } from "@/lib/ui-interactions";
import { BodyText, CardTitle } from "@/components/ui/typography";

type UnifiedCardProps = {
  children: ReactNode;
  layoutStyle?: CSSProperties;
  mt?: string | number;
  tone?: ModuleTone;
  interactive?: boolean;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

type UnifiedCardContentProps = {
  children: ReactNode;
  mt?: string | number;
};

type UnifiedCardSectionProps = UnifiedCardContentProps & {
  tone?: ModuleTone;
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
  layoutStyle,
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
      style={layoutStyle ? { ...baseStyle, ...layoutStyle } : baseStyle}
      onMouseEnter={
        isInteractive
          ? (event) => {
              applySurfaceInteractionHandlers(event, hoverStyle ?? {});
            }
          : undefined
      }
      onMouseLeave={
        isInteractive
          ? (event) => {
              applySurfaceInteractionHandlers(event, baseStyle);
              if (layoutStyle) {
                applySurfaceInteractionHandlers(event, layoutStyle);
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
  return (
    <Stack gap="md" mb="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1 }}>
          {supporting && <Group gap="xs" wrap="wrap">{supporting}</Group>}
          <Stack gap={4}>
            {typeof title === "string" ? (
              <CardTitle lineClamp={clampTitle ? 1 : undefined}>{stripTechnicalMetadata(title)}</CardTitle>
            ) : (
              <Box style={clampTitle ? singleLineClampStyle : undefined}>{title}</Box>
            )}
            {description && <BodyText>{description}</BodyText>}
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

export function UnifiedCardBody({ children, mt }: UnifiedCardContentProps) {
  return <Stack gap="md" mt={mt}>{children}</Stack>;
}

export function UnifiedCardText({
  children,
  mt,
  previewLength = 100,
  disablePreview = false,
}: UnifiedCardTextProps) {
  const content =
    typeof children === "string" && !disablePreview
      ? getPreviewText(children, previewLength)
      : children;

  return (
    <BodyText mt={mt}>{content}</BodyText>
  );
}

export function UnifiedCardSection({ children, mt, tone = "neutral" }: UnifiedCardSectionProps) {
  return (
    <Box
      p="md"
      style={{
        borderRadius: rem(12),
        ...getSemanticInsetStyle(tone),
      }}
      mt={mt}
    >
      {children}
    </Box>
  );
}

export function UnifiedCardActions({ children, mt }: UnifiedCardContentProps) {
  return <Group gap="sm" mt={mt || "md"}>{children}</Group>;
}

export function UnifiedCardFooter({ children, mt }: UnifiedCardContentProps) {
  return (
    <Card.Section
      inheritPadding
      py="md"
      mt={mt || "xl"}
      style={{
        borderTop: "1px solid var(--surface-section-border)",
      }}
    >
      {children}
    </Card.Section>
  );
}
