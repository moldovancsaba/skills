'use client';

import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowLeft as ArrowLeft } from "@tabler/icons-react";
import { 
  Container, 
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
import { BodyText, CardTitle, LabelText, MetaText, PageTitle, SectionTitle } from "@/components/ui/typography";
import {
  getModuleCssVars,
  getSemanticHoverStyle,
  getSemanticSurfaceStyle,
  resolveMantineColor,
  resolveModuleTone,
  type ModuleTone,
  type SemanticColor,
  toneToMantineColor,
} from "@/lib/semantic-theme";
import { resolveStateTone } from "@/lib/ui-state";
import { applySurfaceInteractionHandlers } from "@/lib/ui-interactions";

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
          <PageTitle>{title}</PageTitle>
          {description ? <BodyText>{description}</BodyText> : null}
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
      color={variant === "destructive" ? resolveStateTone("danger") : resolveStateTone("info")}
      title={title} 
      icon={Icon && <Icon size={16} />}
    >
      <BodyText c="var(--text-primary)">{children}</BodyText>
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
  cols = { base: 1, sm: 2, lg: 7 },
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
  color?: SemanticColor;
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  color = "ingress",
}: MetricCardProps) {
  const tone = resolveModuleTone(color);
  const mantineColor = resolveMantineColor(color);
  return (
    <Card style={getSemanticSurfaceStyle(tone)}>
      
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <ThemeIcon color={mantineColor}>
            <Icon size={20} />
          </ThemeIcon>
          
          <MetaText c="var(--text-secondary)">{label}</MetaText>
        </Group>

        <Stack gap={4}>
          <SectionTitle>{value}</SectionTitle>
          {detail ? <BodyText c={`var(--mantine-color-${mantineColor}-4)`}>{detail}</BodyText> : null}
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
  tone?: SemanticColor;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  tone = "neutral",
}: EmptyStateProps) {
  const resolvedTone = resolveModuleTone(tone);
  return (
    <Card
      style={{
        ...getSemanticSurfaceStyle(resolvedTone, { elevated: false }),
        borderStyle: "dashed",
        backgroundColor: "transparent",
      }}
      ta="center"
    >
      <Stack align="center" gap="md">
        <ThemeIcon color={resolveMantineColor(tone)} size={64}>
          <Icon size={32} />
        </ThemeIcon>
        <Stack gap={4}>
          <CardTitle>{title}</CardTitle>
          {description ? <BodyText ta="center" maw={400} mx="auto">{description}</BodyText> : null}
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
  variant?: SemanticColor;
  chartData?: any[];
};

export function LinkCard({
  href,
  icon: Icon,
  title,
  description,
  metric,
  variant = "ingress",
  chartData,
}: LinkCardProps) {
  const tone = resolveModuleTone(variant);
  const mantineColor = resolveMantineColor(variant);
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
          applySurfaceInteractionHandlers(event, hoverStyle);
        }}
        onMouseLeave={(event) => {
          applySurfaceInteractionHandlers(event, {
            ...baseStyle,
            ...getModuleCssVars(tone),
            overflow: "hidden",
          });
        }}
      >

        <Stack gap="xl" h="100%" style={{ position: 'relative', zIndex: 1 }}>
          <Group justify="space-between" align="center">
            <ThemeIcon color={mantineColor}>
              <Icon size={20} />
            </ThemeIcon>
            {metric !== undefined && (
              <LabelText c={`var(--mantine-color-${mantineColor}-4)`}>{metric}</LabelText>
            )}
          </Group>

          <Stack gap={6}>
            <CardTitle>{title}</CardTitle>
            {description ? <BodyText lineClamp={2}>{description}</BodyText> : null}
          </Stack>

          {chartData && chartData.length > 0 && (
            <Box mt="auto" pt="lg">
              <DashboardChart 
                data={chartData} 
                color={`var(--mantine-color-${mantineColor}-6)`} 
              />
            </Box>
          )}

          <Group justify="flex-end" mt="auto" pt="md">
            <MetaText c={`var(--mantine-color-${mantineColor}-4)`}>Access Layer →</MetaText>
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
    { key: "data", tone: "ingress" },
    { key: "topics", tone: "synthesis" },
    { key: "knowmore", tone: "knowmore" },
    { key: "goals", tone: "strategy" },
    { key: "nba", tone: "checklist" },
    { key: "tactical", tone: "tactical" },
    { key: "review", tone: "review" },
  ];
  const activeTone = segments.find((segment) => segment.key === activeKey)?.tone ?? "ingress";
  const activeColor = toneToMantineColor(activeTone as ModuleTone);

  return (
    <Stack gap="md" mb="xl">
      <SimpleGrid cols={{ base: 7 }} spacing="xs">
        {segments.map((segment) => (
          <Box 
            key={segment.key}
            h={6} 
            style={{ 
              borderRadius: 3,
              backgroundColor: segment.key === activeKey ? `var(--mantine-color-${toneToMantineColor(segment.tone as ModuleTone)}-filled)` : 'var(--mantine-color-gray-2)',
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
        <SectionTitle>{title}</SectionTitle>
      </Group>
    </Stack>
  );
}
