import type { ReactNode } from "react";
import { Card, Stack, Group, Title, Text, Box } from "@mantine/core";

type UnifiedCardProps = {
  children: ReactNode;
  className?: string;
};

export function UnifiedCard({ children, className }: UnifiedCardProps) {
  return (
    <Card 
      shadow="sm" 
      padding="xl" 
      radius="lg" 
      withBorder 
      className={className}
      style={{
        backgroundColor: "var(--mantine-color-dark-8)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease"
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
              <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
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

export function UnifiedCardBody({ children, className }: UnifiedCardProps) {
  return <Stack gap="md" className={className}>{children}</Stack>;
}

export function UnifiedCardText({ children, className }: UnifiedCardProps) {
  return (
    <Text size="sm" style={{ lineHeight: 1.6, opacity: 0.9 }} className={className}>
      {children}
    </Text>
  );
}

export function UnifiedCardSection({ children, className }: UnifiedCardProps) {
  return (
    <Box 
      p="md" 
      style={{ 
        backgroundColor: "rgba(255,255,255,0.03)", 
        borderRadius: "var(--mantine-radius-md)",
        border: "1px solid rgba(255,255,255,0.05)" 
      }} 
      className={className}
    >
      {children}
    </Box>
  );
}

export function UnifiedCardActions({ children, className }: UnifiedCardProps) {
  return <Group gap="sm" mt="md" className={className}>{children}</Group>;
}

export function UnifiedCardFooter({ children, className }: UnifiedCardProps) {
  return (
    <Card.Section 
      withBorder 
      inheritPadding 
      py="md" 
      mt="xl" 
      style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
      className={className}
    >
      {children}
    </Card.Section>
  );
}
