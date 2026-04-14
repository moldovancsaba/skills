"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

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
    <div className={cn("mx-auto w-full space-y-8 px-4 py-6 md:px-8 md:py-10", widthClasses[width], className)}>
      {children}
    </div>
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
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-2">
        {backHref ? (
          <Link href={backHref} className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto px-0 text-muted-foreground hover:text-foreground")}>
            {backLabel}
          </Link>
        ) : null}
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-[0.95rem]">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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
};

export function LinkCard({
  href,
  icon: Icon,
  title,
  description,
  metric,
  variant,
  className,
}: LinkCardProps) {
  const variantClasses = {
    blue: "bg-blue-500/10 border-blue-500/20 group-hover:bg-blue-500/20",
    amber: "bg-amber-500/10 border-amber-500/20 group-hover:bg-amber-500/20",
    green: "bg-green-500/10 border-green-500/20 group-hover:bg-green-500/20",
    violet: "bg-violet-500/10 border-violet-500/20 group-hover:bg-violet-500/20",
    teal: "bg-teal-500/10 border-teal-500/20 group-hover:bg-teal-500/20",
  };

  const iconClasses = {
    blue: "text-blue-400 bg-blue-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    green: "text-green-400 bg-green-500/10",
    violet: "text-violet-400 bg-violet-500/10",
    teal: "text-teal-400 bg-teal-500/10",
  };

  return (
    <Link href={href} className={cn("group block h-full", className)}>
      <UnifiedCard
        className={cn(
          "h-full transition-all duration-300",
          variant && variantClasses[variant]
        )}
      >
        <UnifiedCardHeader
          badges={
            <div className="flex items-center justify-between w-full">
              <span className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                variant ? iconClasses[variant] : "bg-accent/10 text-accent group-hover:bg-accent/15"
              )}>
                <Icon className="h-5 w-5" />
              </span>
              {metric !== undefined && (
                <span className={cn(
                  "text-4xl font-black italic tracking-tighter opacity-80 transition-transform duration-300 group-hover:scale-110",
                  variant ? iconClasses[variant].split(' ')[0] : "text-zinc-500"
                )}>
                  {metric}
                </span>
              )}
            </div>
          }
          title={title}
        />
        <UnifiedCardBody>
          <UnifiedCardText className="text-zinc-400 text-sm">
            {description}
          </UnifiedCardText>
        </UnifiedCardBody>
        <UnifiedCardActions>
          <span className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-8 px-3 text-[10px] uppercase font-bold tracking-widest border border-white/5 bg-white/5 hover:bg-white/10"
          )}>
            Open
          </span>
        </UnifiedCardActions>
      </UnifiedCard>
    </Link>
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
