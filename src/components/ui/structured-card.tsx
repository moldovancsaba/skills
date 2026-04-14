import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardText, 
  UnifiedCardActions 
} from "@/components/ui/unified-card";

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
      <UnifiedCardHeader badges={chips} title={title} />
      <UnifiedCardBody>
        {body ? <UnifiedCardText>{body}</UnifiedCardText> : null}
        {actions ? <UnifiedCardActions>{actions}</UnifiedCardActions> : null}
        {details ? <div className="pt-2">{details}</div> : null}
      </UnifiedCardBody>
    </UnifiedCard>
  );
}

export function StructuredChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function StructuredActionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
