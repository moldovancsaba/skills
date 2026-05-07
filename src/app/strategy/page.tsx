'use client';

import { 
  Stack, 
  Title, 
  Text, 
  Button, 
  Card, 
  ThemeIcon, 
  Badge,
  List
} from "@mantine/core";
import { IconInfoCircle as Info } from "@tabler/icons-react";
import { PageHeader, PageShell } from "@/components/ui/app-shell";

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
      <Card ta="center">
        <Stack align="center" gap="xl">
          <ThemeIcon color="gray" size={64}>
            <Info size={32} />
          </ThemeIcon>
          <Stack gap="xs">
            <Title order={2}>Strategic Protocol Pending</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto">
              This surface does not expose live performance indicators yet. Placeholder metrics have been removed until the product has a real source of truth for strategy KPIs.
            </Text>
          </Stack>
          <Badge color="gray" variant="light">
            No live KPI feed connected
          </Badge>
          <List size="sm" c="dimmed" spacing="xs" style={{ textAlign: "left", maxWidth: 560 }}>
            <List.Item>Revenue, enrollment, retention, and NPS are not currently stored in the operational schema.</List.Item>
            <List.Item>The page remains available as a roadmap surface, but it no longer renders fake values.</List.Item>
            <List.Item>Once those metrics have a backed data model, they should be wired through the same snapshot contract as the other route indicators.</List.Item>
          </List>
        </Stack>
      </Card>
    </PageShell>
  );
}
