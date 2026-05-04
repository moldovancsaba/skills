import Link from "next/link";
import type { ReactNode } from "react";
import { LucideIcon, ArrowLeft } from "lucide-react";
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
  Alert
} from "@mantine/core";

import { DashboardChart } from "@/components/dashboard-chart";

type PageShellProps = {
  children: ReactNode;
  width?: "md" | "lg" | "xl" | "2xl" | "5xl" | "7xl" | "full";
  className?: string;
};

export function PageShell({
  children,
  width = "xl",
  className,
}: PageShellProps) {
  return (
    <Container 
      size={width === "full" ? "100%" : width} 
      py="xl"
      className={className}
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
  icon?: LucideIcon;
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
      {children}
    </Alert>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} gap="md">
      {children}
    </SimpleGrid>
  );
}

export function UnifiedGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} gap="lg" className={className}>
      {children}
    </SimpleGrid>
  );
}

type MetricCardProps = {
  icon: LucideIcon;
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
    <Card p="lg" radius="md" withBorder bg="var(--mantine-color-dark-8)">
      <Stack gap="md">
        <ThemeIcon variant="light" color={color} size="xl" radius="md">
          <Icon size={20} />
        </ThemeIcon>
        <Stack gap={4}>
          <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed">{label}</Text>
          <Title order={4} size="h2" fw={900}>{value}</Title>
        </Stack>
        {detail && <Text size="xs" c="dimmed">{detail}</Text>}
      </Stack>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <Card p="xl" radius="lg" withBorder style={{ borderStyle: "dashed" }} ta="center">
      <Stack align="center" gap="md">
        <ThemeIcon variant="light" color="gray" size={64} radius="xl">
          <Icon size={32} />
        </ThemeIcon>
        <Stack gap={4}>
          <Title order={3}>{title}</Title>
          <Text size="sm" c="dimmed" maxW={400} mx="auto">
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

export function LinkCard({
  href,
  icon: Icon,
  title,
  description,
  metric,
  variant = "blue",
  className,
  chartData,
}: LinkCardProps) {
  return (
    <UnstyledButton 
      component={Link} 
      href={href} 
      className={className}
      style={{ display: "block", height: "100%" }}
    >
      <Card 
        shadow="sm" 
        padding="xl" 
        radius="lg" 
        withBorder 
        bg="var(--mantine-color-dark-8)"
        style={{ height: "100%", transition: "transform 0.2s ease" }}
      >
        <Stack gap="md" h="100%">
          <Group justify="space-between" align="flex-start">
            <ThemeIcon color={variant} variant="light" size="xl" radius="md">
              <Icon size={24} />
            </ThemeIcon>
            {metric !== undefined && (
              <Text fw={900} size="xl" lts={-2} c={variant} opacity={0.8}>
                {metric}
              </Text>
            )}
          </Group>

          <Stack gap={4}>
            <Text fw={800} size="lg" lh={1.2}>
              {title}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {description}
            </Text>
          </Stack>

          {chartData && chartData.length > 0 && (
            <Box mt="auto" pt="sm">
              <DashboardChart 
                data={chartData} 
                color={`var(--mantine-color-${variant}-6)`} 
              />
            </Box>
          )}

          <Group justify="flex-end" mt="auto">
            <Text size="xs" fw={800} tt="uppercase" lts={1} color={variant}>
              Open Layer →
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
  icon,
}: {
  activeKey: string;
  title: string;
  icon: string;
}) {
  const segments = [
    { key: "data", color: "gray" },
    { key: "topics", color: "indigo" },
    { key: "knowmore", color: "knowledge" },
    { key: "goals", color: "strategy" },
    { key: "checklist", color: "execution" },
  ];

  const activeColor = segments.find(s => s.key === activeKey)?.color || "brand";

  return (
    <Stack gap="md" mb="xl">
      <SimpleGrid cols={{ base: 4, md: 5 }} gap="xs">
        {segments.map((segment) => (
          <Box 
            key={segment.key}
            h={6} 
            style={{ 
              borderRadius: 3,
              backgroundColor: segment.key === activeKey ? `var(--mantine-color-${activeColor}-6)` : "var(--mantine-color-dark-4)",
              boxShadow: segment.key === activeKey ? `0 0 10px var(--mantine-color-${activeColor}-9)` : "none"
            }}
          />
        ))}
      </SimpleGrid>
      <Group gap="sm">
        <ThemeIcon variant="light" color={activeColor} size="lg" radius="md">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
        </ThemeIcon>
        <Title order={2} size="h3" fw={900} tt="uppercase" lts={1}>{title}</Title>
      </Group>
    </Stack>
  );
}
