'use client';

import type { ReactNode, CSSProperties } from "react";
import { Card, Stack, Group, Title, Text, Box, rem } from "@mantine/core";

type UnifiedCardProps = {
  children: ReactNode;
  style?: CSSProperties;
  mt?: string | number;
};

export function UnifiedCard({ children, style, mt }: UnifiedCardProps) {
  return (
    <Card 
      shadow="sm" 
      padding="xl" 
      radius="lg" 
      withBorder 
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
            <Title order={3} size="h3" style={{ lineHeight: 1.2 }}>
              {title}
            </Title>
            {description && (
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }} fw={500}>
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

export function UnifiedCardText({ children, style, mt }: UnifiedCardProps) {
  return (
    <Text size="sm" style={{ lineHeight: 1.6, ...style }} mt={mt} fw={500}>
      {children}
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
      withBorder 
      inheritPadding 
      py="md" 
      mt={mt || "xl"} 
      style={style}
    >
      {children}
    </Card.Section>
  );
}
