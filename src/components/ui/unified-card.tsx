/**
 * UNIFIED DESIGN SYSTEM: SINGULAR CARD UI
 * v0.14.0-PRODUCTION (Hardened)
 */
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
    <Card className={cn(
      "overflow-hidden border-zinc-200/10 bg-zinc-950/40 shadow-card transition-[transform,box-shadow,border-color] duration-300 hover:border-accent/20 hover:shadow-card-hover",
      className
    )}>
      {children}
    </Card>
  );
}

type UnifiedCardHeaderProps = {
  supporting?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function UnifiedCardHeader({
  supporting,
  title,
  description,
  actions,
  className,
}: UnifiedCardHeaderProps) {
  return (
    <div className={cn("px-6 pt-6 pb-2 space-y-4", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-4 flex-1">
          {supporting ? <div className="flex flex-wrap items-center gap-2">{supporting}</div> : null}
          <div className="space-y-2">
            <h3 className="font-display text-[1.45rem] font-bold leading-tight tracking-tight text-white">{title}</h3>
            {description ? <p className="text-[0.95rem] leading-relaxed text-zinc-400">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}

export function UnifiedCardBody({ children, className }: UnifiedCardProps) {
  return <div className={cn("px-6 py-4 space-y-4", className)}>{children}</div>;
}

export function UnifiedCardText({ children, className }: UnifiedCardProps) {
  return <p className={cn("text-[0.925rem] leading-relaxed text-zinc-300/90", className)}>{children}</p>;
}

export function UnifiedCardSection({ children, className }: UnifiedCardProps) {
  return <div className={cn("rounded-xl border border-zinc-200/5 bg-zinc-400/5 p-4", className)}>{children}</div>;
}

export function UnifiedCardActions({ children, className }: UnifiedCardProps) {
  return <div className={cn("flex flex-wrap gap-2 pt-2", className)}>{children}</div>;
}

export function UnifiedCardFooter({ children, className }: UnifiedCardProps) {
  return (
    <div className={cn("border-t border-zinc-200/5 bg-zinc-900/20 px-6 py-5", className)}>
      {children}
    </div>
  );
}
