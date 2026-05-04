import type { ReactNode } from "react";
import { Group, Stack } from "@mantine/core";
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
      <UnifiedCardHeader supporting={chips} title={title} />
      <UnifiedCardBody>
        {body ? <UnifiedCardText>{body}</UnifiedCardText> : null}
        {actions ? <UnifiedCardActions>{actions}</UnifiedCardActions> : null}
        {details ? <Stack gap="xs" mt="xs">{details}</Stack> : null}
      </UnifiedCardBody>
    </UnifiedCard>
  );
}

export function StructuredChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <Group gap="xs" wrap="wrap" className={className}>{children}</Group>;
}

export function StructuredActionRow({ children, className }: { children: ReactNode; className?: string }) {
  return <Group gap="sm" wrap="wrap" className={className}>{children}</Group>;
}
