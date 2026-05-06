"use client";

import { IconBook as BookOpen, IconHelpCircle as CircleHelp, IconBulb as Lightbulb, IconArrowLeft as ArrowLeft, IconHelpCircle as HelpCircle, IconFileText as FileText } from "@tabler/icons-react";
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
  SimpleGrid,
  Box,
  Paper,
  Anchor
} from "@mantine/core";
import { Notice, PageShell } from "@/components/ui/app-shell";
import Link from "next/link";

export function ManualPageContent() {
  return (
    <PageShell width="5xl">
      <Stack gap={48}>
        <Group justify="space-between" align="center">
          <Stack gap={4}>
            <Group gap="sm">
              <ThemeIcon variant="light" color="brand" size="lg" radius="md">
                <FileText size={20} />
              </ThemeIcon>
              <Title order={1} fw={700}>Operations Manual</Title>
            </Group>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" ml={rem(44)}>
              System Guidance & Best Practices
            </Text>
          </Stack>
          <Button component={Link} href="/faq" variant="subtle" color="gray" leftSection={<CircleHelp size={16} />}>
            Open FAQ
          </Button>
        </Group>

        <Notice icon={Lightbulb} title="Strategic Yield Optimization">
          Better source quality and sharper feedback improve the system faster than simply refreshing the same weak inputs. Focus on high-integrity data ingress.
        </Notice>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Card p="xl" radius="lg" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
            <Stack gap="lg">
              <Title order={3} size="h5" fw={700} tt="uppercase">Source Priority Layer</Title>
              <Stack gap="sm">
                {[
                  "Product and pricing pages",
                  "Competitor pricing and positioning pages",
                  "Customer notes and interview summaries",
                  "Sales decks, briefs, and internal files"
                ].map((item, i) => (
                  <Group key={i} gap="sm" wrap="nowrap">
                    <ThemeIcon size="xs" variant="subtle" color="brand" radius="xl">
                      <Box style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'currentColor' }} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>{item}</Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
          <Card p="xl" radius="lg" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))' }}>
            <Stack gap="lg">
              <Title order={3} size="h5" fw={700} tt="uppercase">Calibration Vocabulary</Title>
              <Stack gap="sm">
                {[
                  "Already doing this",
                  "Not relevant for this company",
                  "Too early, revisit after summer",
                  "Blocked until launch or budget approval"
                ].map((item, i) => (
                  <Group key={i} gap="sm" wrap="nowrap">
                    <ThemeIcon size="xs" variant="subtle" color="orange" radius="xl">
                      <Box style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'currentColor' }} />
                    </ThemeIcon>
                    <Text size="sm" fw={500}>{item}</Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
        </SimpleGrid>

        <Stack gap="xl">
          {manualSections.map((section) => (
            <Paper key={section.id} p="xl" radius="lg" withBorder style={{ position: 'relative' }}>
              <Badge 
                variant="filled" 
                color="brand" 
                size="xs" 
                radius="sm" 
                style={{ position: 'absolute', top: -10, left: 20 }}
              >
                {section.title}
              </Badge>
              <Stack gap="lg" mt="sm">
                <Title order={3} size="h4" fw={700}>{section.summary}</Title>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {section.bullets.map((bullet) => (
                    <Paper key={bullet} p="md" radius="md" withBorder style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-7))' }}>
                      <Text size="sm" fw={500} style={{ lineHeight: 1.5 }}>{bullet}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </Stack>
            </Paper>
          ))}
        </Stack>

        <Card p="xl" radius="lg" withBorder ta="center" style={{ borderStyle: 'dashed' }}>
          <Stack align="center" gap="md">
            <Title order={3} size="h4" fw={700}>Need rapid operational support?</Title>
            <Button 
              component={Link} 
              href="/faq" 
              variant="light" 
              color="brand"
              leftSection={<CircleHelp size={18} />}
            >
              Access Intelligence FAQ
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
      <Stack gap={48}>
        <Group justify="space-between" align="center">
          <Stack gap={4}>
            <Group gap="sm">
              <ThemeIcon variant="light" color="indigo" size="lg" radius="md">
                <HelpCircle size={20} />
              </ThemeIcon>
              <Title order={1} fw={700}>Intelligence FAQ</Title>
            </Group>
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" ml={rem(44)}>
              Core Protocol Inquiries
            </Text>
          </Stack>
          <Anchor component={Link} href="/" size="xs" fw={700} tt="uppercase" c="dimmed">
            Return to Dashboard →
          </Anchor>
        </Group>

        <Notice icon={BookOpen} title="Operational Context">
          If the intelligence output feels weak, check source quality and calibration history first. System performance is a direct reflection of evidence fidelity.
        </Notice>

        <Paper p="xl" radius="lg" withBorder style={{ backgroundColor: 'light-dark(white, var(--mantine-color-dark-8))' }}>
          <Accordion variant="separated" radius="md">
            {faqItems.map((item) => (
              <Accordion.Item key={item.id} value={item.id} style={{ border: 'none', marginBottom: rem(12) }}>
                <Accordion.Control>
                  <Text fw={700} size="sm" tt="uppercase">{item.question}</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Paper p="md" radius="md" style={{ backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-9))', borderLeft: '3px solid var(--mantine-color-brand-6)' }}>
                    <Text size="sm" c="dimmed" fw={500} style={{ lineHeight: 1.6 }}>{item.answer}</Text>
                  </Paper>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Paper>
      </Stack>
    </PageShell>
  );
}
