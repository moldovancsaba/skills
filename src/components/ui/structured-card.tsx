import type { ReactNode } from "react";
import { Group, Stack } from "@/components/gds/primitives";
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
};

export function StructuredCard({ chips, title, body, actions, details }: StructuredCardProps) {
  return (
    <UnifiedCard>
      <UnifiedCardHeader supporting={chips} title={title} />
      <UnifiedCardBody>
        {body ? <UnifiedCardText>{body}</UnifiedCardText> : null}
        {actions ? <UnifiedCardActions>{actions}</UnifiedCardActions> : null}
        {details ? <Stack gap="xs" mt="xs">{details}</Stack> : null}
      </UnifiedCardBody>
    </UnifiedCard>
  );
}

export function StructuredChipRow({ children }: { children: ReactNode }) {
  return <Group gap="xs" wrap="wrap">{children}</Group>;
}

export function StructuredActionRow({ children }: { children: ReactNode }) {
  return <Group gap="sm" wrap="wrap">{children}</Group>;
}
