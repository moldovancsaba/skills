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
  Badge,
  rem 
} from "@mantine/core";
import { Info, Paintbrush } from "lucide-react";
import { PageHeader, PageShell, MetricGrid } from "@/components/ui/app-shell";

export default function BrandPage() {
  return (
    <PageShell>
      <PageHeader 
        title="Brand Management"
        description="Brand identity, messaging, and visual guidelines."
        actions={
          <Button size="xs" variant="light" color="gray" disabled>
            Coming soon
          </Button>
        }
      />

      <MetricGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {[
          { label: "Brand Status", value: "--", status: "Coming soon", color: "blue" },
          { label: "Messaging", value: "--", status: "Coming soon", color: "teal" },
          { label: "Visual Assets", value: "--", status: "Coming soon", color: "violet" },
        ].map((m, i) => (
          <Card key={i} radius="lg" withBorder p="xl">
            <Stack gap="md">
              <Text size="xs" fw={800} c="dimmed" tt="uppercase" lts={1}>
                {m.label}
              </Text>
              <Text size="xl" fw={900} lts={-0.5}>
                {m.value}
              </Text>
              <Badge variant="light" color={m.color} size="sm" radius="sm">
                {m.status}
              </Badge>
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
            <Title order={2} fw={900} lts={-0.5}>Identity Protocol Locked</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto" fw={500} style={{ fontStyle: "italic" }}>
              The brand management suite is offline. System initialization requires database availability to serve visual guidelines and messaging frameworks.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}