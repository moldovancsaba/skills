'use client';

import { 
  Stack, 
  Group, 
  Title, 
  Text, 
  Button, 
  Card, 
  Box, 
  ThemeIcon, 
  rem 
} from "@mantine/core";
import { Info, Beaker, FlaskConical, TrendingUp, CheckCircle } from "lucide-react";
import { PageHeader, PageShell, MetricGrid } from "@/components/ui/app-shell";

export default function PreFortitudePage() {
  return (
    <PageShell>
      <PageHeader 
        title="Pre-Fortitude AI"
        actions={
          <Button size="xs" variant="light" color="gray" disabled>
            Coming soon
          </Button>
        }
      />

      <MetricGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {[
          { label: "Active Experiments", value: "--", icon: Beaker, color: "blue" },
          { label: "Total Participants", value: "--", icon: FlaskConical, color: "teal" },
          { label: "Avg. Conversion", value: "--", icon: TrendingUp, color: "orange" },
          { label: "Successful Tests", value: "--", icon: CheckCircle, color: "indigo" },
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
            <Title order={2} fw={900} lts={-0.5}>Validation Engine Standby</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto" fw={500} style={{ fontStyle: "italic" }}>
              The Pre-Fortitude AI validation engine is awaiting system-wide initialization to enable high-confidence market testing and programmatic experiment management.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}