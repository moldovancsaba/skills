'use client';

import type { ReactNode, CSSProperties } from "react";
import { Card, Stack, Group, Title, Text, Box, rem } from "@mantine/core";
import { stripTechnicalMetadata } from "@/lib/ui-utils";

type UnifiedCardProps = {
  children: ReactNode;
  style?: CSSProperties;
  mt?: string | number;
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

export function UnifiedCard({ children, style, mt }: UnifiedCardProps) {
  return (
    <Card 
       
      mt={mt}
      style={style}
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
};

export function UnifiedCardHeader({
  supporting,
  title,
  description,
  actions,
}: UnifiedCardHeaderProps) {
  return (
    <Stack gap="md" mb="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm" style={{ flex: 1 }}>
          {supporting && <Group gap="xs" wrap="wrap">{supporting}</Group>}
          <Stack gap={4}>
            {typeof title === "string" ? (
              <Title order={3} style={singleLineClampStyle}>
                {stripTechnicalMetadata(title)}
              </Title>
            ) : (
              <Title order={3} style={singleLineClampStyle}>
                {title}
              </Title>
            )}
            {description && (
              <Text c="dimmed">
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
    <Text style={style} mt={mt}>
      {content}
    </Text>
  );
}

export function UnifiedCardSection({ children, style, mt }: UnifiedCardProps) {
  return (
    <Box 
      p="md" 
      style={style}
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
      style={style}
    >
      {children}
    </Card.Section>
  );
}
