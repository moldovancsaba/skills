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
import { Info, Users, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { PageHeader, PageShell, MetricGrid } from "@/components/ui/app-shell";

export default function CrmPage() {
  return (
    <PageShell>
      <PageHeader 
        title="CRM & Automation"
        actions={
          <Button size="xs" variant="light" color="gray" disabled>
            Coming soon
          </Button>
        }
      />

      <MetricGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {[
          { label: "Active Leads", value: "--", icon: Users, color: "blue" },
          { label: "This Month", value: "--", icon: TrendingUp, color: "teal" },
          { label: "Pipeline Value", value: "--", icon: CheckCircle, color: "orange" },
          { label: "Avg. Response", value: "--", icon: Clock, color: "indigo" },
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
            <Title order={2} fw={900} lts={-0.5}>CRM Pipeline Inactive</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto" fw={500} style={{ fontStyle: "italic" }}>
              The automated CRM pipeline is awaiting database synchronization to enable real-time lead management and customer journey orchestration.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}