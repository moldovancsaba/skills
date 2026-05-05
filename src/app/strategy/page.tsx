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
          <Card key={i} radius="lg" withBorder p="xl">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <ThemeIcon variant="light" color={m.color} size="md" radius="md">
                  <m.icon size={18} />
                </ThemeIcon>
                <Text size="xs" fw={800} c="dimmed" tt="uppercase" lts={1}>
                  {m.label}
                </Text>
              </Group>
              <Text size="32px" fw={900} lts={-1}>
                {m.value}
              </Text>
            </Stack>
          </Card>
        ))}
      </MetricGrid>

      <Card radius="lg" withBorder p={rem(60)} ta="center">
        <Stack align="center" gap="xl">
          <ThemeIcon variant="light" color="gray" size={64} radius="xl">
            <Info size={32} />
          </ThemeIcon>
          <Stack gap="xs">
            <Title order={2} fw={900} lts={-0.5}>Strategic Protocol Pending</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto" fw={500} style={{ fontStyle: "italic" }}>
              The strategic planning and performance tracking engine is awaiting database synchronization to enable high-fidelity priorities and checkpoints.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}