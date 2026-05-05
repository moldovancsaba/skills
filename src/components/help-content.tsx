"use client";

import { BookOpen, CircleHelp, Lightbulb } from "lucide-react";
import { faqItems, manualSections } from "@/content/help";
import { 
  Accordion, 
  Badge, 
  Button, 
  Card, 
  Text, 
  Title, 
  Stack, 
  Group, 
  ThemeIcon,
  rem,
  SimpleGrid
} from "@mantine/core";
import { Notice, PageShell } from "@/components/ui/app-shell";
import Link from "next/link";

export function ManualPageContent() {
  return (
    <PageShell width="5xl">
      <Stack gap="xl">
        <Group justify="flex-end">
          <Button component={Link} href="/faq" variant="subtle" size="xs">
            Open FAQ
          </Button>
        </Group>

        <Notice icon={Lightbulb} title="Fastest path to better output">
          Better source quality and sharper feedback improve the system faster than simply refreshing the same weak inputs.
        </Notice>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Card p="xl" radius="lg" withBorder>
            <Stack gap="md">
              <Title order={3} size="h4">Use these source types first</Title>
              <Stack gap={4}>
                <Text size="sm">Product and pricing pages</Text>
                <Text size="sm">Competitor pricing and positioning pages</Text>
                <Text size="sm">Customer notes and interview summaries</Text>
                <Text size="sm">Sales decks, briefs, onboarding docs, and internal files</Text>
              </Stack>
            </Stack>
          </Card>
          <Card p="xl" radius="lg" withBorder>
            <Stack gap="md">
              <Title order={3} size="h4">Useful decline language</Title>
              <Stack gap={4}>
                <Text size="sm">Already doing this</Text>
                <Text size="sm">Not relevant for this company</Text>
                <Text size="sm">Too early, revisit after summer</Text>
                <Text size="sm">Blocked until launch, budget approval, or hiring</Text>
              </Stack>
            </Stack>
          </Card>
        </SimpleGrid>

        <Stack gap="md">
          {manualSections.map((section) => (
            <Card key={section.id} p="xl" radius="lg" withBorder>
              <Stack gap="md">
                <Group>
                  <Badge variant="light" color="brand">{section.title}</Badge>
                </Group>
                <Title order={3} size="h4">{section.summary}</Title>
                <Stack gap="sm">
                  {section.bullets.map((bullet) => (
                    <Card key={bullet} p="md" radius="md" withBorder variant="light">
                      <Text size="sm">{bullet}</Text>
                    </Card>
                  ))}
                </Stack>
              </Stack>
            </Card>
          ))}
        </Stack>

        <Card p="xl" radius="lg" withBorder>
          <Stack align="center" gap="md">
            <Title order={3} size="h4">Need quick answers?</Title>
            <Button 
              component={Link} 
              href="/faq" 
              variant="light" 
              color="brand"
              leftSection={<CircleHelp size={16} />}
            >
              Open FAQ
            </Button>
          </Stack>
        </Card>
      </Stack>
    </PageShell>
  );
}

export function FaqPageContent() {
  return (
    <PageShell width="5xl">
      <Stack gap="xl">
        <Notice icon={BookOpen} title="Before you refresh again">
          If the output feels weak, check source quality and feedback quality first. That usually matters more than another blind rerun.
        </Notice>

        <Card p="xl" radius="lg" withBorder>
          <Accordion variant="separated" radius="md">
            {faqItems.map((item) => (
              <Accordion.Item key={item.id} value={item.id} style={{ border: 'none', marginBottom: rem(8) }}>
                <Accordion.Control>
                  <Text fw={700}>{item.question}</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm" c="dimmed">{item.answer}</Text>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Card>
      </Stack>
    </PageShell>
  );
}
