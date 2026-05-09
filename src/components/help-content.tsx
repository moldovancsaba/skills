"use client";

import { IconBook as BookOpen, IconHelpCircle as CircleHelp, IconBulb as Lightbulb, IconArrowLeft as ArrowLeft, IconHelpCircle as HelpCircle, IconFileText as FileText } from "@tabler/icons-react";
import { faqItems, manualSections } from "@/content/help";
import { 
  Accordion, 
  Badge, 
  Button, 
  Text, 
  Stack, 
  Group, 
  ThemeIcon,
  rem,
  SimpleGrid,
  Box,
  Anchor
} from "@mantine/core";
import { Notice, PageShell } from "@/components/ui/app-shell";
import { BodyText, CardTitle, MetaText, PageTitle } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardSection } from "@/components/ui/unified-card";
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
              <PageTitle>Operations Manual</PageTitle>
            </Group>
            <MetaText ml={rem(44)}>System Guidance & Best Practices</MetaText>
          </Stack>
          <Button component={Link} href="/faq" variant="subtle" color="gray" leftSection={<CircleHelp size={16} />}>
            Open FAQ
          </Button>
        </Group>

        <Notice icon={Lightbulb} title="Strategic Yield Optimization">
          Better source quality and sharper feedback improve the system faster than simply refreshing the same weak inputs. Focus on high-integrity data ingress.
        </Notice>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <UnifiedCard tone="neutral">
            <UnifiedCardBody>
              <Stack gap="lg">
                <CardTitle>Source Priority Layer</CardTitle>
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
                      <BodyText c="var(--text-primary)">{item}</BodyText>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>
          <UnifiedCard tone="neutral">
            <UnifiedCardBody>
              <Stack gap="lg">
                <CardTitle>Calibration Vocabulary</CardTitle>
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
                      <BodyText c="var(--text-primary)">{item}</BodyText>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </UnifiedCardBody>
          </UnifiedCard>
        </SimpleGrid>

        <Stack gap="xl">
          {manualSections.map((section) => (
            <UnifiedCard key={section.id} tone="neutral" layoutStyle={{ position: "relative" }}>
              <Badge 
                color="ingress" 
                size="xs" 
                style={{ position: 'absolute', top: -10, left: 20 }}
              >
                {section.title}
              </Badge>
              <Stack gap="lg" mt="sm">
                <CardTitle>{section.summary}</CardTitle>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {section.bullets.map((bullet) => (
                    <UnifiedCardSection key={bullet} tone="neutral">
                      <BodyText c="var(--text-primary)">{bullet}</BodyText>
                    </UnifiedCardSection>
                  ))}
                </SimpleGrid>
              </Stack>
            </UnifiedCard>
          ))}
        </Stack>

        <UnifiedCard tone="neutral" layoutStyle={{ borderStyle: "dashed" }}>
          <UnifiedCardBody>
            <Stack align="center" gap="md">
              <CardTitle>Need rapid operational support?</CardTitle>
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
          </UnifiedCardBody>
        </UnifiedCard>
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
              <PageTitle>Intelligence FAQ</PageTitle>
            </Group>
            <MetaText ml={rem(44)}>Core Protocol Inquiries</MetaText>
          </Stack>
          <Anchor component={Link} href="/" size="xs" c="dimmed">
            Return to Dashboard →
          </Anchor>
        </Group>

        <Notice icon={BookOpen} title="Operational Context">
          If the intelligence output feels weak, check source quality and calibration history first. System performance is a direct reflection of evidence fidelity.
        </Notice>

        <UnifiedCard tone="neutral">
          <UnifiedCardBody>
          <Accordion variant="separated" >
            {faqItems.map((item) => (
              <Accordion.Item key={item.id} value={item.id} style={{ border: 'none', marginBottom: rem(12) }}>
                <Accordion.Control>
                  <BodyText c="var(--text-primary)">{item.question}</BodyText>
                </Accordion.Control>
                <Accordion.Panel>
                  <UnifiedCardSection tone="neutral">
                    <BodyText>{item.answer}</BodyText>
                  </UnifiedCardSection>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
          </UnifiedCardBody>
        </UnifiedCard>
      </Stack>
    </PageShell>
  );
}
