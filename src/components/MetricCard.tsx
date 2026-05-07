import { Paper, Text, Group, Stack, rem } from "@mantine/core";

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
          backgroundColor: 'light-dark(white, var(--mantine-color-dark-7))',
          boxShadow: 'var(--mantine-shadow-xs)',
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
