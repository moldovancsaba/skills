'use client';

import type { ReactNode, CSSProperties } from "react";
import { Card, Stack, Group, Title, Text, Box, rem } from "@mantine/core";

type UnifiedCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  mt?: string | number;
};

export function UnifiedCard({ children, className, style, mt }: UnifiedCardProps) {
  return (
    <Card 
      shadow="sm" 
      padding="xl" 
      radius="lg" 
      withBorder 
      className={className}
      mt={mt}
      style={{
        backgroundColor: 'light-dark(rgba(0, 0, 0, 0.01), rgba(255, 255, 255, 0.02))',
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        ...style
      }}
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

export function UnifiedCardBody({ children, className, style, mt }: UnifiedCardProps) {
  return <Stack gap="md" className={className} style={style} mt={mt}>{children}</Stack>;
}

export function UnifiedCardText({ children, className, style, mt }: UnifiedCardProps) {
  return (
    <Text size="sm" style={{ lineHeight: 1.6, ...style }} className={className} mt={mt} fw={500}>
      {children}
    </Text>
  );
}

export function UnifiedCardSection({ children, className, style, mt }: UnifiedCardProps) {
  return (
    <Box 
      p="md" 
      style={{ 
        backgroundColor: 'light-dark(rgba(0,0,0,0.02), rgba(255,255,255,0.03))',
        borderRadius: "var(--mantine-radius-md)",
        border: '1px solid light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05))',
        ...style 
      }} 
      className={className}
      mt={mt}
    >
      {children}
    </Box>
  );
}

export function UnifiedCardActions({ children, className, style, mt }: UnifiedCardProps) {
  return <Group gap="sm" mt={mt || "md"} className={className} style={style}>{children}</Group>;
}

export function UnifiedCardFooter({ children, className, style, mt }: UnifiedCardProps) {
  return (
    <Card.Section 
      withBorder 
      inheritPadding 
      py="md" 
      mt={mt || "xl"} 
      style={{ 
        backgroundColor: 'light-dark(rgba(0,0,0,0.03), rgba(0,0,0,0.2))',
        ...style 
      }}
      className={className}
    >
      {children}
    </Card.Section>
  );
}
