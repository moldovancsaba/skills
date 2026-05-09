'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Box, Center, Group, Loader, Paper, Stack, Text, ThemeIcon, rem } from "@mantine/core";
import { IconDatabase as Database, IconLayersIntersect as Layers, IconSparkles as Sparkles, IconTarget as Target, IconListCheck as ListCheck } from "@tabler/icons-react";
import { PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { getSemanticInsetStyle } from "@/lib/semantic-theme";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import type { SharedCardEntityType, SharedCardTone } from "@/lib/shared-card";

type SharedCard = {
  id: string;
  companyId: string;
  entityType: SharedCardEntityType;
  title: string;
  body: string;
  statusLabel: string;
  subtypeLabel?: string | null;
  tone: SharedCardTone;
  iceScore: number;
  hashtags: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  publicId?: number | null;
};

function iconForEntity(entityType: SharedCard["entityType"]) {
  if (entityType === "DATA") return <Database size={22} />;
  if (entityType === "TOPIC") return <Layers size={22} />;
  if (entityType === "GOAL") return <Target size={22} />;
  if (entityType === "KNOWLEDGE") return <Sparkles size={22} />;
  return <ListCheck size={22} />;
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

  return (
    <PageShell width="md">
      <Center style={{ minHeight: "100vh" }}>
        <Stack gap="xl" maw={760} w="100%">
          <Group justify="center">
            <ThemeIcon color={card.tone} size="xl" radius="xl">
              {iconForEntity(card.entityType)}
            </ThemeIcon>
          </Group>

          <UnifiedCard tone={card.tone} style={{ width: "100%" }}>
            <UnifiedCardHeader
              clampTitle={false}
              supporting={
                <Group justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
                  {card.iceScore > 0 ? (
                    <Badge color={card.tone}>ICE {Math.round(card.iceScore)}</Badge>
                  ) : (
                    <Badge color={card.tone}>{card.statusLabel}</Badge>
                  )}
                  <Text size="sm" c="dimmed">
                    {card.statusLabel}{card.subtypeLabel ? ` | ${card.subtypeLabel}` : ""}
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
                    ...getSemanticInsetStyle(card.tone),
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
