'use client';

import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { 
  Container, 
  Title, 
  Text, 
  Group, 
  Stack, 
  SimpleGrid, 
  Card, 
  Badge, 
  UnstyledButton, 
  ActionIcon,
  Tooltip,
  ThemeIcon,
  Anchor,
  Box,
  Alert,
  SimpleGridProps,
  rem
} from "@mantine/core";

import { DashboardChart } from "@/components/dashboard-chart";

type PageShellProps = {
  children: ReactNode;
  width?: "md" | "lg" | "xl" | "2xl" | "5xl" | "7xl" | "full";
};

export function PageShell({
  children,
  width = "xl",
}: PageShellProps) {
  return (
    <Container 
      size={width === "full" ? "100%" : width} 
      py="xl"
    >
      <Stack gap="xl">
        {children}
      </Stack>
    </Container>
  );
}

type PageHeaderProps = {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
};

export function PageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  actions,
}: PageHeaderProps) {
  return (
    <Stack gap="md" mb="xl">
      <Group justify="space-between" align="flex-end">
        <Stack gap="xs">
          {backHref && (
            <Anchor 
              component={Link} 
              href={backHref}
              size="xs"
              fw={800}
              tt="uppercase"
              lts={1}
              c="dimmed"
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <ArrowLeft size={12} />
              {backLabel}
            </Anchor>
          )}
          <Title order={1} size="h1" fw={900} lts={-1}>
            {title}
          </Title>
          {description && (
            <Text size="md" c="dimmed" fw={500} style={{ fontStyle: "italic" }}>
              {description}
            </Text>
          )}
        </Stack>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
    </Stack>
  );
}

type NoticeProps = {
  title?: string;
  children: ReactNode;
  icon?: any;
  variant?: "default" | "destructive";
};

export function Notice({
  title,
  children,
  icon: Icon,
  variant = "default",
}: NoticeProps) {
  return (
    <Alert 
      variant="light" 
      color={variant === "destructive" ? "red" : "brand"} 
      title={title} 
      icon={Icon && <Icon size={16} />}
      radius="md"
    >
      <Text size="sm" fw={500}>{children}</Text>
    </Alert>
  );
}

export interface MetricGridProps extends SimpleGridProps {
  children: ReactNode;
}

export function MetricGrid({ 
  children,
  cols = { base: 1, sm: 2, md: 3 },
  ...props
}: MetricGridProps) {
  return (
    <SimpleGrid cols={cols} spacing="md" {...props}>
      {children}
    </SimpleGrid>
  );
}

export function UnifiedGrid({ 
  children, 
  cols = { base: 1, md: 2, xl: 3 }
}: { 
  children: ReactNode; 
  cols?: any;
}) {
  return (
    <SimpleGrid cols={cols} spacing="lg">
      {children}
    </SimpleGrid>
  );
}

type MetricCardProps = {
  icon: any;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  color?: string;
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  color = "brand",
}: MetricCardProps) {
  return (
    <Card 
      radius="lg" 
      p="xl" 
      withBorder 
      shadow="xs"
    >
      
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <ThemeIcon 
            variant="light" 
            color={color}
            radius="md" 
            size="xl"
          >
            <Icon size={20} />
          </ThemeIcon>
          
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" lts={0.5}>
            {label}
          </Text>
        </Group>

        <Stack gap={4}>
          <Text size="h2" fw={700}>
            {value}
          </Text>
          {detail && (
            <Text size="xs" c={color} fw={800} mt={4} opacity={0.8} tt="uppercase" lts={1}>
              {detail}
            </Text>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

type EmptyStateProps = {
  icon: any;
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <Card p="xl" radius="lg" withBorder style={{ borderStyle: "dashed", backgroundColor: 'transparent' }} ta="center">
      <Stack align="center" gap="md">
        <ThemeIcon variant="light" color="gray" size={64} radius="xl">
          <Icon size={32} />
        </ThemeIcon>
        <Stack gap={4}>
          <Title order={3} fw={900}>{title}</Title>
          <Text size="sm" c="dimmed" maw={400} mx="auto" fw={500}>
            {description}
          </Text>
        </Stack>
        <Group gap="sm">
          {primaryAction}
          {secondaryAction}
        </Group>
      </Stack>
    </Card>
  );
}

type LinkCardProps = {
  href: string;
  icon: any;
  title: string;
  description?: string;
  metric?: string | number;
  variant?: string;
  chartData?: any[];
};

export function LinkCard({
  href,
  icon: Icon,
  title,
  description,
  metric,
  variant = "blue",
  chartData,
}: LinkCardProps) {
  return (
    <UnstyledButton 
      component={Link} 
      href={href} 
      style={{ display: "block", height: "100%", textDecoration: 'none' }}
    >
      <Card 
        radius="lg" 
        p="xl" 
        withBorder 
        shadow="sm"
      >

        <Stack gap="xl" h="100%" style={{ position: 'relative', zIndex: 1 }}>
          <Group justify="space-between" align="center">
            <ThemeIcon 
              variant="light" 
              color={variant}
              radius="md" 
              size="xl"
            >
              <Icon size={20} />
            </ThemeIcon>
            {metric !== undefined && (
              <Text fw={900} size="24px" lts={-1} color={variant} opacity={0.8}>
                {metric}
              </Text>
            )}
          </Group>

          <Stack gap={6}>
            <Text fw={700} size="lg">
              {title}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2} fw={600} opacity={0.7}>
              {description}
            </Text>
          </Stack>

          {chartData && chartData.length > 0 && (
            <Box mt="auto" pt="lg" style={{ filter: 'light-dark(grayscale(0.2) contrast(1.1), grayscale(0.5) contrast(1.2))' }}>
              <DashboardChart 
                data={chartData} 
                color={`var(--mantine-color-${variant}-6)`} 
              />
            </Box>
          )}

          <Group justify="flex-end" mt="auto" pt="md">
            <Text size="10px" fw={900} tt="uppercase" lts={2} color={variant} opacity={0.7}>
              Access Layer →
            </Text>
          </Group>
        </Stack>
      </Card>
    </UnstyledButton>
  );
}

export function PipelineAccentHeader({
  activeKey,
  title,
  icon: Icon,
}: {
  activeKey: string;
  title: string;
  icon: any;
}) {
  const segments = [
    { key: "data", color: "blue" },
    { key: "topics", color: "indigo" },
    { key: "knowmore", color: "teal" },
    { key: "goals", color: "violet" },
    { key: "nba", color: "blue" },
    { key: "tactical", color: "cyan" },
    { key: "review", color: "orange" },
  ];

  const activeColor = segments.find(s => s.key === activeKey)?.color || "brand";

  return (
    <Stack gap="md" mb="xl">
      <SimpleGrid cols={{ base: 7 }} spacing="xs">
        {segments.map((segment) => (
          <Box 
            key={segment.key}
            h={6} 
            style={{ 
              borderRadius: 3,
              backgroundColor: segment.key === activeKey ? `var(--mantine-color-${activeColor}-filled)` : 'var(--mantine-color-gray-2)',
            }}
          />
        ))}
      </SimpleGrid>
      <Group gap="sm">
        <ThemeIcon variant="light" color={activeColor} size="lg" radius="md">
          <Icon size={20} />
        </ThemeIcon>
        <Title order={2} size="h3" fw={700} tt="uppercase">{title}</Title>
      </Group>
    </Stack>
  );
}
