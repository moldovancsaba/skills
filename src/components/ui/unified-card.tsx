import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type UnifiedCardProps = {
  children: ReactNode;
  className?: string;
};

export function UnifiedCard({ children, className }: UnifiedCardProps) {
  return (
    <Card className={cn("overflow-hidden border-border/80 bg-card/95 shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:border-accent/20 hover:shadow-card-hover", className)}>
      {children}
    </Card>
  );
}

type UnifiedCardHeaderProps = {
  badges?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function UnifiedCardHeader({
  badges,
  title,
  description,
  aside,
  className,
}: UnifiedCardHeaderProps) {
  return (
    <CardHeader className={cn("gap-4", className)}>
      {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-xl leading-tight md:text-[1.35rem]">{title}</CardTitle>
          {description ? <CardDescription className="mt-2 text-[0.95rem]">{description}</CardDescription> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </CardHeader>
  );
}

export function UnifiedCardBody({ children, className }: UnifiedCardProps) {
  return <CardContent className={cn("space-y-4", className)}>{children}</CardContent>;
}

export function UnifiedCardText({ children, className }: UnifiedCardProps) {
  return <p className={cn("text-sm leading-6 text-foreground", className)}>{children}</p>;
}

export function UnifiedCardSection({ children, className }: UnifiedCardProps) {
  return <div className={cn("rounded-lg border border-border/80 bg-muted/40 p-4 shadow-card", className)}>{children}</div>;
}

export function UnifiedCardActions({ children, className }: UnifiedCardProps) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
