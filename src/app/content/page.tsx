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
import { Info, PenTool, Globe, Eye, Heart, Share2 } from "lucide-react";
import { PageHeader, PageShell, MetricGrid } from "@/components/ui/app-shell";

export default function ContentPage() {
  return (
    <PageShell>
      <PageHeader 
        title="Digital Presence"
        description="Website, social profiles, and content assets."
        actions={
          <Button size="xs" variant="light" color="gray" disabled>
            Coming soon
          </Button>
        }
      />

      <MetricGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {[
          { label: "Total Views", value: "--", icon: Eye, color: "blue" },
          { label: "Engagement", value: "--", icon: Heart, color: "teal" },
          { label: "Followers", value: "--", icon: Globe, color: "orange" },
          { label: "Shares", value: "--", icon: Share2, color: "indigo" },
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
            <Title order={2} fw={900} lts={-0.5}>Content Pipeline Suspended</Title>
            <Text size="sm" c="dimmed" maw={500} mx="auto" fw={500} style={{ fontStyle: "italic" }}>
              The digital presence management suite is awaiting database activation to enable cross-platform content orchestration and engagement harvesting.
            </Text>
          </Stack>
        </Stack>
      </Card>
    </PageShell>
  );
}