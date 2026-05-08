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
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";

export function ManualPageContent() {
  return (
    <PageShell width="5xl">
      <Stack gap={48}>
        <Group justify="space-between" align="center">
          <Stack gap={4}>
            <Group gap="sm">
              <ThemeIcon color="ingress">
                <FileText size={20} />
              </ThemeIcon>
              <Title order={1}>Operations Manual</Title>
            </Group>
            <Text size="xs" c="dimmed" ml={rem(44)}>
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
          <Card p="xl" style={getSemanticSurfaceStyle("neutral", { elevated: false })}>
            <Stack gap="lg">
              <Title order={3}>Source Priority Layer</Title>
              <Stack gap="sm">
                {[
                  "Product and pricing pages",
                  "Competitor pricing and positioning pages",
                  "Customer notes and interview summaries",
                  "Sales decks, briefs, and internal files"
                ].map((item, i) => (
                  <Group key={i} gap="sm" wrap="nowrap">
                    <ThemeIcon size="xs" variant="subtle" color="ingress" >
                      <Box style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'currentColor' }} />
                    </ThemeIcon>
                    <Text>{item}</Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
          <Card p="xl" style={getSemanticSurfaceStyle("neutral", { elevated: false })}>
            <Stack gap="lg">
              <Title order={3}>Calibration Vocabulary</Title>
              <Stack gap="sm">
                {[
                  "Already doing this",
                  "Not relevant for this company",
                  "Too early, revisit after summer",
                  "Blocked until launch or budget approval"
                ].map((item, i) => (
                  <Group key={i} gap="sm" wrap="nowrap">
                    <ThemeIcon size="xs" variant="subtle" color="review" >
                      <Box style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'currentColor' }} />
                    </ThemeIcon>
                    <Text>{item}</Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </Card>
        </SimpleGrid>

        <Stack gap="xl">
          {manualSections.map((section) => (
            <Paper key={section.id} p="xl" style={{ position: 'relative', ...getSemanticSurfaceStyle("neutral", { elevated: false }) }}>
              <Badge 
                color="ingress" 
                size="xs" 
                style={{ position: 'absolute', top: -10, left: 20 }}
              >
                {section.title}
              </Badge>
              <Stack gap="lg" mt="sm">
                <Title order={3}>{section.summary}</Title>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {section.bullets.map((bullet) => (
                    <Paper key={bullet} p="md" style={getSemanticSurfaceStyle("neutral", { elevated: false })}>
                      <Text>{bullet}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </Stack>
            </Paper>
          ))}
        </Stack>

        <Card p="xl"   ta="center" style={{ borderStyle: 'dashed' }}>
          <Stack align="center" gap="md">
            <Title order={3}>Need rapid operational support?</Title>
            <Button 
              component={Link} 
              href="/faq" 
              variant="light" 
              color="ingress"
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
              <ThemeIcon color="synthesis">
                <HelpCircle size={20} />
              </ThemeIcon>
              <Title order={1}>Intelligence FAQ</Title>
            </Group>
            <Text size="xs" c="dimmed" ml={rem(44)}>
              Core Protocol Inquiries
            </Text>
          </Stack>
          <Anchor component={Link} href="/" size="xs" c="dimmed">
            Return to Dashboard →
          </Anchor>
        </Group>

        <Notice icon={BookOpen} title="Operational Context">
          If the intelligence output feels weak, check source quality and calibration history first. System performance is a direct reflection of evidence fidelity.
        </Notice>

        <Paper p="xl" style={getSemanticSurfaceStyle("neutral", { elevated: false })}>
          <Accordion variant="separated" >
            {faqItems.map((item) => (
              <Accordion.Item key={item.id} value={item.id} style={{ border: 'none', marginBottom: rem(12) }}>
                <Accordion.Control>
                  <Text size="sm">{item.question}</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Paper p="md" style={{ ...getSemanticSurfaceStyle("neutral", { elevated: false }), borderLeft: '3px solid var(--mantine-color-ingress-6)' }}>
                    <Text c="dimmed">{item.answer}</Text>
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
