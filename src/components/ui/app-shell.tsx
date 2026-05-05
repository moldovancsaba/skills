'use client';

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
  Alert,
  SimpleGridProps,
  rem
} from "@mantine/core";

import { DashboardChart } from "@/components/dashboard-chart";
import { useTheme } from "@/lib/theme-provider";

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
  className?: string;
};

export function Notice({
  title,
  children,
  icon: Icon,
  variant = "default",
  className,
}: NoticeProps) {
  return (
    <Alert 
      className={className}
      variant="light" 
      color={variant === "destructive" ? "red" : "brand"} 
      title={title} 
      icon={Icon && <Icon size={16} />}
      radius="md"
      styles={{
        title: { 
          fontWeight: 900, 
          textTransform: 'uppercase', 
          letterSpacing: rem(1), 
          fontSize: rem(10) 
        }
      }}
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
  className,
  cols = { base: 1, md: 2, xl: 3 }
}: { 
  children: ReactNode; 
  className?: string;
  cols?: any;
}) {
  return (
    <SimpleGrid cols={cols} spacing="lg" className={className}>
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
  const { isDark } = useTheme();
  return (
    <Card 
      radius="lg" 
      p="xl" 
      withBorder 
      style={{ 
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
        position: 'relative',
        overflow: 'hidden',
        height: '100%'
      }}
    >
      <Box 
        style={{ 
          position: 'absolute', 
          top: -20, 
          right: -20, 
          width: 100, 
          height: 100, 
          borderRadius: '50%', 
          background: `var(--mantine-color-${color}-filled)`, 
          opacity: 0.05, 
          filter: 'blur(40px)' 
        }} 
      />
      
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <ThemeIcon 
            variant="gradient" 
            gradient={{ from: `${color}.6`, to: `${color}.9`, deg: 45 }}
            radius="md" 
            size="xl"
            style={{ boxShadow: `0 4px 15px var(--mantine-color-${color}-9)` }}
          >
            <Icon size={20} />
          </ThemeIcon>
          
          <Text size="xs" c="dimmed" fw={900} tt="uppercase" lts={1.5} opacity={0.6}>
            {label}
          </Text>
        </Group>

        <Stack gap={4}>
          <Text size="36px" fw={900} lts={-1.5} style={{ lineHeight: 1 }}>
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
  icon: LucideIcon;
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
  icon: LucideIcon | string;
  title: string;
  description?: string;
  metric?: string | number;
  variant?: string;
  className?: string;
  chartData?: any[];
};

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
  const { isDark } = useTheme();
  return (
    <UnstyledButton 
      component={Link} 
      href={href} 
      className={className}
      style={{ display: "block", height: "100%", textDecoration: 'none' }}
    >
      <Card 
        radius="lg" 
        p="xl" 
        withBorder 
        className="link-card-hardened"
        style={{ 
          height: '100%',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <Box 
          style={{ 
            position: 'absolute', 
            top: -40, 
            right: -40, 
            width: 140, 
            height: 140, 
            borderRadius: '50%', 
            background: `var(--mantine-color-${variant}-filled)`, 
            opacity: 0.04, 
            filter: 'blur(60px)',
            pointerEvents: 'none'
          }} 
        />

        <Stack gap="xl" h="100%" style={{ position: 'relative', zIndex: 1 }}>
          <Group justify="space-between" align="center">
            <ThemeIcon 
              variant="gradient" 
              gradient={{ from: `${variant}.6`, to: `${variant}.9`, deg: 45 }}
              radius="md" 
              size="xl"
              style={{ boxShadow: `0 4px 20px var(--mantine-color-${variant}-9)` }}
            >
              {typeof Icon === 'string' ? (
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{Icon}</span>
              ) : (
                <Icon size={20} />
              )}
            </ThemeIcon>
            {metric !== undefined && (
              <Text fw={900} size="24px" lts={-1} color={variant} opacity={0.8}>
                {metric}
              </Text>
            )}
          </Group>

          <Stack gap={6}>
            <Text fw={900} size="xl" lh={1.1} lts={-0.5}>
              {title}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2} fw={600} opacity={0.7}>
              {description}
            </Text>
          </Stack>

          {chartData && chartData.length > 0 && (
            <Box mt="auto" pt="lg" style={{ filter: isDark ? 'grayscale(0.5) contrast(1.2)' : 'grayscale(0.2) contrast(1.1)' }}>
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
      <style jsx global>{`
        .link-card-hardened:hover {
          background-color: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'} !important;
          transform: translateY(-6px);
          border-color: ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'} !important;
          box-shadow: 0 20px 40px ${isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)'};
        }
      `}</style>
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
  const { isDark } = useTheme();
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
              backgroundColor: segment.key === activeKey ? `var(--mantine-color-${activeColor}-6)` : (isDark ? "var(--mantine-color-dark-4)" : "var(--mantine-color-gray-2)"),
              boxShadow: segment.key === activeKey ? `0 0 10px var(--mantine-color-${activeColor}-9)` : "none",
              transition: 'all 0.3s ease'
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
