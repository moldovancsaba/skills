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
import { Info, Target, Users, TrendingUp, DollarSign } from "lucide-react";
import { PageHeader, PageShell, MetricGrid } from "@/components/ui/app-shell";

export default function LeadsPage() {
  return (
    <PageShell>
      <PageHeader 
        title="Lead Generation"
        description="Campaigns, tracking, and conversion optimization."
        actions={
          <Button size="xs" variant="light" color="gray" disabled>
            Coming soon
          </Button>
        }
      />

      <MetricGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {[
          { label: "Total Leads", value: "--", icon: Users, color: "blue" },
          { label: "New This Week", value: "--", icon: TrendingUp, color: "teal" },
          { label: "Conversion Rate", value: "--", icon: Target, color: "orange" },
          { label: "Cost per Lead", value: "--", icon: DollarSign, color: "indigo" },
        ].map((m, i) => (
          <Card key={i} radius="lg" withBorder p="xl" style={{ position: 'relative', overflow: 'hidden' }}>
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
            <Title order={2} fw={900} lts={-0.5}>Protocol Deployment Pending</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto" fw={500} style={{ fontStyle: "italic" }}>
              The lead generation engine is awaiting database integration to enable high-yield campaign tracking and automated conversion optimization.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}