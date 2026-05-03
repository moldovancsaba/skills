/**
 * UNIFIED PAGE ARCHITECTURE
 * v0.11.3-PRODUCTION
 * 
 * Defines standardized layout primitives for the checklist.
 * - PageShell: Handles horizontal scaling (width="full" for screen-wide dashboards).
 * - UnifiedGrid: Responsive 1/2/3-column grid for standard intelligence listings.
 * - PipelineAccentHeader: Themed headers for system layers (Data, Topics, Knowmore, checklist).
 */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { 
  Container, 
  Title, 
  Text, 
  Group, 
  Stack, 
  SimpleGrid, 
  Card as MantineCard, 
  Badge as MantineBadge, 
  UnstyledButton, 
  rem, 
  ActionIcon,
  Tooltip,
  ThemeIcon
} from "@mantine/core";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardText, 
  UnifiedCardActions 
} from "@/components/ui/unified-card";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";
import { DashboardChart } from "@/components/dashboard-chart";

type PageShellProps = {
  children: ReactNode;
  width?: "md" | "lg" | "xl" | "2xl" | "5xl" | "7xl" | "full";
  className?: string;
};

const widthClasses: Record<NonNullable<PageShellProps["width"]>, string> = {
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
  full: "max-w-full px-4 md:px-12",
};

export function PageShell({
  children,
  width = "xl",
  className,
}: PageShellProps) {
  return (
    <Container size={width === "full" ? "100%" : width.replace("xl", "xl")} className={cn("py-6 md:py-10", className)}>
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
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-8">
      <div className="space-y-1.5">
        {backHref ? (
          <Link 
            href={backHref} 
            className="group inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors mb-2"
          >
            <span className="material-symbols-outlined text-[14px] transition-transform group-hover:-translate-x-1">arrow_back</span>
            {backLabel}
          </Link>
        ) : null}
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground leading-[1.1]">
          {title}
        </h1>
        {description ? (
          <p className="text-sm md:text-base text-muted-foreground/70 max-w-2xl font-medium leading-relaxed italic">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
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
    <Alert variant={variant} className={className}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <div>
        {title ? <AlertTitle>{title}</AlertTitle> : null}
        <AlertDescription>{children}</AlertDescription>
      </div>
    </Alert>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-3">{children}</div>;
}

export function UnifiedGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3", className)}>
      {children}
    </div>
  );
}

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  iconClassName?: string;
};

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  iconClassName,
}: MetricCardProps) {
  return (
    <Card className="bg-card/95">
      <CardHeader className="space-y-3 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
          <Icon className={cn("h-5 w-5 text-accent", iconClassName)} />
        </div>
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-1 text-2xl md:text-[1.75rem]">{value}</CardTitle>
        </div>
      </CardHeader>
      {detail ? <CardContent className="p-5 pt-0 text-xs text-muted-foreground">{detail}</CardContent> : null}
    </Card>
  );
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
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
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center p-8 text-center">
        <Icon className="mb-4 h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{description}</p>
        {(primaryAction || secondaryAction) ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {primaryAction}
            {secondaryAction}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type LinkCardProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  metric?: string | number;
  variant?: "blue" | "amber" | "green" | "violet" | "teal";
  className?: string;
  chartData?: { date: string; value: number }[];
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
  const chartColors = {
    blue: "#228be6",
    amber: "#fab005",
    green: "#40c057",
    violet: "#7950f2",
    teal: "#0ca678",
  };

  return (
    <UnstyledButton 
      component={Link} 
      href={href} 
      className={cn("group block h-full", className)}
    >
      <MantineCard 
        shadow="sm" 
        padding="xl" 
        radius="md" 
        withBorder 
        bg="var(--mantine-color-dark-6)"
        className="h-full transition-transform duration-200 hover:-translate-y-1"
      >
        <Stack gap="md" h="100%">
          <Group justify="space-between" align="flex-start">
            <ThemeIcon color={variant} variant="light" size="xl" radius="md">
              <Icon size={24} />
            </ThemeIcon>
            {metric !== undefined && (
              <Text fw={900} size="xl" lts={-2} c={chartColors[variant]} className="opacity-80">
                {metric}
              </Text>
            )}
          </Group>

          <Stack gap={4}>
            <Text fw={700} size="lg" c="white" lh={1.2}>
              {title}
            </Text>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {description}
            </Text>
          </Stack>

          {chartData && chartData.length > 0 && (
            <div className="mt-auto pt-2">
              <DashboardChart 
                data={chartData} 
                color={chartColors[variant]} 
              />
            </div>
          )}

          <Group justify="flex-end" mt="auto">
            <Text size="xs" fw={700} tt="uppercase" lts={1} c={variant}>
              Open Layer →
            </Text>
          </Group>
        </Stack>
      </MantineCard>
    </UnstyledButton>
  );
}

type PipelineAccentHeaderProps = {
  activeKey: "data" | "topics" | "knowmore" | "checklist";
  title: string;
  icon: string;
  toneClassName: string;
  borderClassName: string;
  backgroundClassName: string;
};

export function PipelineAccentHeader({
  activeKey,
  title,
  icon,
  toneClassName,
  borderClassName,
  backgroundClassName,
}: PipelineAccentHeaderProps) {
  const segments = [
    { key: "data", className: "pipeline-accent-data" },
    { key: "topics", className: "pipeline-accent-topics" },
    { key: "knowmore", className: "pipeline-accent-knowmore" },
    { key: "checklist", className: "pipeline-accent-checklist" },
  ] as const;

  return (
    <>
      <div
        className={cn(
          "mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium md:hidden",
          toneClassName,
          borderClassName,
          backgroundClassName,
        )}
      >
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
        {title}
      </div>

      <div className="mb-4 hidden grid-cols-4 items-center gap-3 md:grid">
        {segments.map((segment) =>
          segment.key === activeKey ? (
            <div
              key={segment.key}
              className={cn(
                "inline-flex h-12 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium shadow-card",
                toneClassName,
                borderClassName,
                backgroundClassName,
              )}
            >
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
              <span>{title}</span>
            </div>
          ) : (
            <div key={segment.key} className="flex items-center">
              <div className={cn("h-2 w-full rounded-full", segment.className)} />
            </div>
          ),
        )}
      </div>
    </>
  );
}
