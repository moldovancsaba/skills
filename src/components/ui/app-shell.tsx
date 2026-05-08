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
import { getModuleCssVars, getSemanticHoverStyle, getSemanticSurfaceStyle, type ModuleTone } from "@/lib/semantic-theme";

function resolveModuleTone(color?: string): ModuleTone {
  switch (color) {
    case "ingress":
    case "blue":
    case "brand":
      return "ingress";
    case "synthesis":
    case "indigo":
      return "synthesis";
    case "knowmore":
    case "teal":
    case "green":
    case "knowledge":
      return "knowmore";
    case "strategy":
    case "violet":
    case "purple":
      return "strategy";
    case "checklist":
    case "cyan":
    case "execution":
      return "checklist";
    case "tactical":
      return "tactical";
    case "review":
    case "orange":
    case "amber":
      return "review";
    default:
      return "neutral";
  }
}

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
      style={{ position: "relative" }}
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
              c="dimmed"
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <ArrowLeft size={12} />
              {backLabel}
            </Anchor>
          )}
          <Title order={1}>
            {title}
          </Title>
            <Text c="dimmed">
              {description}
            </Text>
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
      color={variant === "destructive" ? "red" : "brand"} 
      title={title} 
      icon={Icon && <Icon size={16} />}
    >
      <Text size="sm">{children}</Text>
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

export interface RouteCardGridProps extends SimpleGridProps {
  children: ReactNode;
}

export function RouteCardGrid({
  children,
  cols = { base: 1, sm: 2, lg: 6 },
  ...props
}: RouteCardGridProps) {
  return (
    <SimpleGrid cols={cols} spacing="lg" {...props}>
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
  const tone = resolveModuleTone(color);
  return (
    <Card style={getSemanticSurfaceStyle(tone)}>
      
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <ThemeIcon color={color}>
            <Icon size={20} />
          </ThemeIcon>
          
          <Text c="#9AA4B2" fw={500}>
            {label}
          </Text>
        </Group>

        <Stack gap={4}>
          <Text size="h2" fw={700}>
            {value}
          </Text>
          {detail && (
            <Text c={`var(--mantine-color-${color}-4)`}>
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
    <Card style={{ borderStyle: "dashed", backgroundColor: 'transparent' }} ta="center">
      <Stack align="center" gap="md">
        <ThemeIcon color="gray" size={64}>
          <Icon size={32} />
        </ThemeIcon>
        <Stack gap={4}>
          <Title order={3}>{title}</Title>
          <Text size="sm" c="dimmed" maw={400} mx="auto">
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
  const tone = (
    variant === "ingress" || variant === "blue"
      ? "ingress"
      : variant === "synthesis" || variant === "indigo"
        ? "synthesis"
        : variant === "knowmore" || variant === "teal" || variant === "knowledge"
          ? "knowmore"
          : variant === "strategy" || variant === "violet"
            ? "strategy"
            : variant === "checklist" || variant === "orange" || variant === "execution"
              ? "checklist"
              : variant === "tactical" || variant === "cyan"
                ? "tactical"
                : variant === "review"
                  ? "review"
                  : "neutral"
  ) as ModuleTone;

  const baseStyle = getSemanticSurfaceStyle(tone, { interactive: true });
  const hoverStyle = getSemanticHoverStyle(tone);

  return (
    <UnstyledButton 
      component={Link} 
      href={href} 
      style={{ display: "block", height: "100%", textDecoration: 'none' }}
    >
      <Card
        style={{
          ...baseStyle,
          ...getModuleCssVars(tone),
          overflow: "hidden",
        }}
        onMouseEnter={(event) => {
          Object.assign((event.currentTarget as HTMLDivElement).style, hoverStyle);
        }}
        onMouseLeave={(event) => {
          Object.assign((event.currentTarget as HTMLDivElement).style, {
            ...baseStyle,
            ...getModuleCssVars(tone),
            overflow: "hidden",
          });
        }}
      >

        <Stack gap="xl" h="100%" style={{ position: 'relative', zIndex: 1 }}>
          <Group justify="space-between" align="center">
            <ThemeIcon color={variant}>
              <Icon size={20} />
            </ThemeIcon>
            {metric !== undefined && (
              <Text c={`var(--mantine-color-${variant}-4)`} fw={600}>
                {metric}
              </Text>
            )}
          </Group>

          <Stack gap={6}>
            <Text fw={650} size="lg">
              {title}
            </Text>
            <Text c="#9AA4B2" lineClamp={2}>
              {description}
            </Text>
          </Stack>

          {chartData && chartData.length > 0 && (
            <Box mt="auto" pt="lg">
              <DashboardChart 
                data={chartData} 
                color={`var(--mantine-color-${variant}-6)`} 
              />
            </Box>
          )}

          <Group justify="flex-end" mt="auto" pt="md">
            <Text size="xs" c={`var(--mantine-color-${variant}-4)`} fw={600}>
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
        {Icon && (
          <ThemeIcon variant="light" color={activeColor} size="lg">
            <Icon size={20} />
          </ThemeIcon>
        )}
        <Title order={2}>{title}</Title>
      </Group>
    </Stack>
  );
}
