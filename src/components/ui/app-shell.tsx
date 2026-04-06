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
import { UnifiedCard, UnifiedCardHeader } from "@/components/ui/unified-card";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";

type PageShellProps = {
  children: ReactNode;
  width?: "md" | "lg" | "xl" | "2xl" | "5xl" | "7xl";
  className?: string;
};

const widthClasses: Record<NonNullable<PageShellProps["width"]>, string> = {
  md: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
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
  className?: string;
};

export function LinkCard({
  href,
  icon: Icon,
  title,
  description,
  className,
}: LinkCardProps) {
  return (
    <Link href={href} className={cn("group block", className)}>
      <StructuredCard
        className="h-full transition-colors group-hover:bg-muted/40"
        chips={
          <StructuredChipRow>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 transition-colors group-hover:bg-accent/15">
              <Icon className="h-5 w-5 text-accent transition-colors" />
            </span>
          </StructuredChipRow>
        }
        title={<span className="text-base">{title}</span>}
        body={description}
        actions={
          <StructuredActionRow>
            <span className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Open</span>
          </StructuredActionRow>
        }
      />
    </Link>
  );
}
