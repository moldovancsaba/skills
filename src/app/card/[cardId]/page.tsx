'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Box, Center, Group, Loader, Paper, Stack, Text, ThemeIcon, rem } from "@mantine/core";
import { IconSparkles as Sparkles, IconTarget as Target, IconListCheck as ListCheck } from "@tabler/icons-react";
import { PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { stripTechnicalMetadata } from "@/lib/ui-utils";

type SharedCard = {
  id: string;
  companyId: string;
  entityType: "TASK" | "GOAL" | "KNOWLEDGE";
  title: string;
  body: string;
  processingStatus: string;
  iceScore: number;
  hashtags: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  publicId?: number | null;
};

function toneForEntity(entityType: SharedCard["entityType"]) {
  if (entityType === "GOAL") return "strategy";
  if (entityType === "KNOWLEDGE") return "knowmore";
  return "checklist";
}

export default function SharedCardPage() {
  const params = useParams();
  const cardId = params.cardId as string;
  const [card, setCard] = useState<SharedCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cardId) return;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cards/${cardId}`, { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to load card");
        }
        const data = await res.json();
        setCard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load card");
      } finally {
        setLoading(false);
      }
    })();
  }, [cardId]);

  if (loading) {
    return (
      <PageShell width="md">
        <Center h="70vh">
          <Stack align="center" gap="md">
            <Loader color="checklist" />
            <Text size="sm" c="dimmed">Loading shared card…</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  if (!card || error) {
    return (
      <PageShell width="md">
        <Center h="70vh">
          <Stack align="center" gap="md">
            <Text size="lg">{error || "Card not found"}</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  const tone = toneForEntity(card.entityType);

  return (
    <PageShell width="md">
      <Center style={{ minHeight: "100vh" }}>
        <Stack gap="xl" maw={760} w="100%">
          <Group justify="center">
            <ThemeIcon color={tone} size="xl" radius="xl">
              {card.entityType === "GOAL" ? (
                <Target size={22} />
              ) : card.entityType === "KNOWLEDGE" ? (
                <Sparkles size={22} />
              ) : (
                <ListCheck size={22} />
              )}
            </ThemeIcon>
          </Group>

          <UnifiedCard tone={tone} style={{ width: "100%" }}>
            <UnifiedCardHeader
              clampTitle={false}
              supporting={
                <Group justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
                  <Badge color={tone}>ICE {Math.round(card.iceScore)}</Badge>
                  <Text size="sm" c="dimmed">
                    {card.entityType} | {card.processingStatus}
                  </Text>
                </Group>
              }
              title={stripTechnicalMetadata(card.title)}
            />
            <UnifiedCardBody>
              <Text size="lg" lh={1.7}>
                {stripTechnicalMetadata(card.body)}
              </Text>

              {card.hashtags.length > 0 && (
                <Paper
                  p="md"
                  style={{
                    borderRadius: rem(12),
                    backgroundColor: "var(--surface-subtle)",
                    border: "1px solid var(--surface-section-border)",
                  }}
                >
                  <Text size="sm" style={{ letterSpacing: "0.04em" }}>
                    {card.hashtags.map((tag) => `#${String(tag).toUpperCase()}`).join(" ")}
                  </Text>
                </Paper>
              )}

              <Box>
                <Text size="xs" c="dimmed">
                  UUID: {card.id}
                </Text>
              </Box>
            </UnifiedCardBody>
          </UnifiedCard>
        </Stack>
      </Center>
    </PageShell>
  );
}
