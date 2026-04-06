import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { UnifiedCard, UnifiedCardSection } from "@/components/ui/unified-card";

type StructuredCardProps = {
  chips?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  details?: ReactNode;
  className?: string;
};

export function StructuredCard({ chips, title, body, actions, details, className }: StructuredCardProps) {
  return (
    <UnifiedCard className={className}>
      <div className="space-y-0">
        {chips ? <div className="border-b border-border/70 px-6 py-4">{chips}</div> : null}
        <div className="border-b border-border/70 px-6 py-4">
          <h3 className="font-display text-xl font-semibold leading-tight text-foreground md:text-[1.35rem]">{title}</h3>
        </div>
        {body ? <div className="border-b border-border/70 px-6 py-4 text-sm leading-6 text-foreground">{body}</div> : null}
        {actions ? <div className="px-6 py-4">{actions}</div> : null}
        {details ? <UnifiedCardSection className="m-4 mt-0">{details}</UnifiedCardSection> : null}
      </div>
    </UnifiedCard>
  );
}

export function StructuredChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function StructuredActionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
