import { Group, Stack, ThemeIcon } from "@/components/gds/primitives";
import { UnifiedCard, UnifiedCardBody } from "@/components/ui/unified-card";
import { LabelText, MetaText, SectionTitle } from "@/components/ui/typography";
import { resolveStateTextColor } from "@/lib/ui-state";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: any;
}

const MetricCard = ({ label, value, change, changeType = "neutral", icon: Icon }: MetricCardProps) => {
  const getChangeColor = () => {
    if (changeType === "positive") return resolveStateTextColor("success");
    if (changeType === "negative") return resolveStateTextColor("danger");
    return resolveStateTextColor("muted");
  };

  return (
    <UnifiedCard tone="neutral" fullHeight>
      <UnifiedCardBody>
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <MetaText>{label}</MetaText>
            <ThemeIcon color="gray">
              <Icon size={16} />
            </ThemeIcon>
          </Group>

          <Group align="baseline" gap="sm">
            <SectionTitle>{value}</SectionTitle>
            {change ? <LabelText c={getChangeColor()}>{change}</LabelText> : null}
          </Group>
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
};

export default MetricCard;
