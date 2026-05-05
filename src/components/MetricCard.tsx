import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { Paper, Text, Group, Stack, rem } from "@mantine/core";

interface MetricCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  delay?: number;
}

const MetricCard = ({ label, value, change, changeType = "neutral", icon: Icon, delay = 0 }: MetricCardProps) => {
  const getChangeColor = () => {
    if (changeType === "positive") return "green";
    if (changeType === "negative") return "red";
    return "dimmed";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: delay * 0.06 }}
      style={{ height: '100%' }}
    >
      <Paper
        p="md"
        radius="lg"
        withBorder
        style={{
          height: '100%',
          backgroundColor: 'light-dark(white, var(--mantine-color-dark-7))',
          boxShadow: 'var(--mantine-shadow-xs)',
        }}
      >
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="xs" fw={900} tt="uppercase" lts={1} c="dimmed">
              {label}
            </Text>
            <Icon size={16} style={{ opacity: 0.5 }} />
          </Group>
          
          <Group align="baseline" gap="sm">
            <Text size="xl" fw={900} style={{ fontSize: rem(24) }}>
              {value}
            </Text>
            {change && (
              <Text size="xs" fw={800} c={getChangeColor()}>
                {change}
              </Text>
            )}
          </Group>
        </Stack>
      </Paper>
    </motion.div>
  );
};

export default MetricCard;