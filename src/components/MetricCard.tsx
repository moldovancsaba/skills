import { Paper, Text, Group, Stack, rem } from "@mantine/core";
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: any;
  delay?: number;
}

const MetricCard = ({ label, value, change, changeType = "neutral", icon: Icon, delay = 0 }: MetricCardProps) => {
  const getChangeColor = () => {
    if (changeType === "positive") return "green";
    if (changeType === "negative") return "red";
    return "dimmed";
  };

  return (
    <div style={{ height: '100%' }}>
      <Paper
        p="md"
        style={{
          height: '100%',
          ...getSemanticSurfaceStyle("neutral", { elevated: false }),
        }}
      >
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs"    c="dimmed">
              {label}
            </Text>
            <Icon size={16} style={{ opacity: 0.5 }} />
          </Group>
          
          <Group align="baseline" gap="sm">
            <Text size="xl"  style={{ fontSize: rem(24) }}>
              {value}
            </Text>
            {change && (
              <Text size="xs"  c={getChangeColor()}>
                {change}
              </Text>
            )}
          </Group>
        </Stack>
      </Paper>
    </div>
  );
};

export default MetricCard;
