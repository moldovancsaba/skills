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
import { Info, Package, DollarSign, Users, TrendingUp } from "lucide-react";
import { PageHeader, PageShell, MetricGrid } from "@/components/ui/app-shell";

export default function PortfolioPage() {
  return (
    <PageShell>
      <PageHeader 
        title="Portfolio & Offerings"
        actions={
          <Button size="xs" variant="light" color="gray" disabled>
            Coming soon
          </Button>
        }
      />

      <MetricGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {[
          { label: "Total Offerings", value: "--", icon: Package, color: "blue" },
          { label: "Monthly Revenue", value: "--", icon: DollarSign, color: "teal" },
          { label: "Active Enrollments", value: "--", icon: Users, color: "orange" },
          { label: "Avg. Retention", value: "--", icon: TrendingUp, color: "indigo" },
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
            <Title order={2} fw={900} lts={-0.5}>Portfolio Management Offline</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto" fw={500} style={{ fontStyle: "italic" }}>
              The program and pricing management engine is awaiting database integration to serve dynamic offering structures and high-fidelity revenue tracking.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}