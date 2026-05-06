'use client';

import { 
  Stack, 
  Group, 
  Title, 
  Text, 
  Button, 
  Card, 
  ThemeIcon, 
  rem 
} from "@mantine/core";
import { IconInfoCircle as Info, IconTarget as Target, IconTrendingUp as TrendingUp, IconUsers as Users, IconCurrencyDollar as DollarSign } from "@tabler/icons-react";
import { PageHeader, PageShell, MetricGrid } from "@/components/ui/app-shell";

export default function StrategyPage() {
  return (
    <PageShell>
      <PageHeader 
        title="Strategy & Performance"
        actions={
          <Button size="xs" variant="light" color="gray" disabled>
            Coming soon
          </Button>
        }
      />

      <MetricGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {[
          { label: "Revenue vs Goal", value: "--", icon: DollarSign, color: "blue" },
          { label: "Enrollment Rate", value: "--", icon: Users, color: "teal" },
          { label: "Retention Rate", value: "--", icon: TrendingUp, color: "orange" },
          { label: "NPS Score", value: "--", icon: Target, color: "indigo" },
        ].map((m, i) => (
          <Card key={i}>
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <ThemeIcon color={m.color} size="md">
                  <m.icon size={18} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  {m.label}
                </Text>
              </Group>
              <Text size="xl">
                {m.value}
              </Text>
            </Stack>
          </Card>
        ))}
      </MetricGrid>

      <Card ta="center">
        <Stack align="center" gap="xl">
          <ThemeIcon color="gray" size={64}>
            <Info size={32} />
          </ThemeIcon>
          <Stack gap="xs">
            <Title order={2}>Strategic Protocol Pending</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto">
              The strategic planning and performance tracking engine is awaiting database synchronization to enable high-fidelity priorities and checkpoints.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}