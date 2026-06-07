"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Group, Loader, SimpleGrid, Stack } from "@/components/gds/primitives";
import { IconActivity, IconArrowRight, IconChecklist, IconRefresh, IconSparkles } from "@/components/gds/icons";
import { useRouter } from "next/navigation";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";
import { BodyText, MetaText, SectionTitle } from "@/components/ui/typography";
import { resolveClassScoutEntryPoint } from "@/lib/classscout-routes";
import { logClientInteraction } from "@/lib/client-events";

type LiveListingSummary = {
  id: string;
  type: "provider" | "meetupGroup";
  revisionStatus: {
    packetId: string | null;
    packetState: string | null;
    latestOutcomeEvent: string | null;
  };
};

type LearningSummary = {
  totals?: {
    packets?: number;
    approved?: number;
    rejected?: number;
    rework?: number;
    published?: number;
    failed?: number;
  };
};

export function DestinationClassScoutUnitPanel({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [listingCount, setListingCount] = useState(0);
  const [packetCount, setPacketCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [reviewRequiredCount, setReviewRequiredCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [liveRes, learningRes] = await Promise.all([
        fetch(`/api/destination-review/live-listings?companyId=${encodeURIComponent(companyId)}`),
        fetch(`/api/destination-learning/summary?companyId=${encodeURIComponent(companyId)}&destinationKey=classscout`),
      ]);

      const livePayload = liveRes.ok ? await liveRes.json() : null;
      const learningPayload = learningRes.ok ? (await learningRes.json()) as LearningSummary : null;
      const liveItems: LiveListingSummary[] = Array.isArray(livePayload?.items) ? livePayload.items : [];

      setListingCount(liveItems.length);
      setReviewRequiredCount(
        liveItems.filter((item) =>
          item.revisionStatus.packetState === "REVIEW_REQUIRED" ||
          item.revisionStatus.packetState === "DRAFTED" ||
          item.revisionStatus.packetState === "VALIDATED"
        ).length,
      );
      setPacketCount(Number(learningPayload?.totals?.packets ?? 0));
      setPublishedCount(Number(learningPayload?.totals?.published ?? 0));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const homeEntry = resolveClassScoutEntryPoint({
    companyId,
    sourceSurface: "destination-classscout-unit-panel",
    intent: "open-app-home",
  });
  const missionControlEntry = resolveClassScoutEntryPoint({
    companyId,
    sourceSurface: "destination-classscout-unit-panel",
    intent: "open-mission-control",
  });
  const liveCatalogEntry = resolveClassScoutEntryPoint({
    companyId,
    sourceSurface: "destination-classscout-unit-panel",
    intent: "open-live-catalog",
  });

  const openEntryPoint = useCallback(
    (entry: { intent: string; targetDestination: string; accessibleLabel: string; preservesDeepLink: boolean }) => {
      void logClientInteraction({
        companyId,
        surface: "destination-classscout-unit-panel",
        interactionType: "CLASSSCOUT_ENTRY_POINT_OPEN",
        entityType: "ROUTE",
        entityId: entry.intent,
        payload: {
          href: entry.targetDestination,
          preservesDeepLink: entry.preservesDeepLink,
        },
        teachingWeight: 25,
      });
      router.push(entry.targetDestination);
    },
    [companyId, router],
  );

  return (
    <UnifiedCard tone="review">
      <UnifiedCardHeader
        title="ClassScout Intelligence Unit"
        supporting={
          <Group gap="xs">
            <Badge variant="light" color="review">Destination: ClassScout</Badge>
            <Button variant="subtle" size="compact-sm" color="review" leftSection={<IconRefresh size={14} />} onClick={() => void load()}>
              Refresh
            </Button>
          </Group>
        }
      />
      <UnifiedCardBody>
        {loading ? (
          <Stack align="center" py="xl">
            <Loader />
          </Stack>
        ) : (
          <Stack gap="md">
            <BodyText>
              Manage the full ClassScout content workflow for this unit: live catalog revisions, review cards,
              human corrections, publication, replay, and learning feedback.
            </BodyText>

            <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
              <UnifiedCardSection tone="review">
                <Stack gap={4}>
                  <MetaText>Live listings</MetaText>
                  <SectionTitle>{listingCount}</SectionTitle>
                </Stack>
              </UnifiedCardSection>
              <UnifiedCardSection tone="review">
                <Stack gap={4}>
                  <MetaText>Workflow cards</MetaText>
                  <SectionTitle>{packetCount}</SectionTitle>
                </Stack>
              </UnifiedCardSection>
              <UnifiedCardSection tone="review">
                <Stack gap={4}>
                  <MetaText>Needs review</MetaText>
                  <SectionTitle>{reviewRequiredCount}</SectionTitle>
                </Stack>
              </UnifiedCardSection>
              <UnifiedCardSection tone="review">
                <Stack gap={4}>
                  <MetaText>Published outcomes</MetaText>
                  <SectionTitle>{publishedCount}</SectionTitle>
                </Stack>
              </UnifiedCardSection>
            </SimpleGrid>

            <Group gap="sm">
              <Button
                color="review"
                leftSection={<IconChecklist size={16} />}
                rightSection={<IconArrowRight size={16} />}
                aria-label={homeEntry.accessibleLabel}
                onClick={() => openEntryPoint(homeEntry)}
              >
                Open ClassScout Home
              </Button>
              <Button
                variant="light"
                color="strategy"
                leftSection={<IconActivity size={16} />}
                aria-label={missionControlEntry.accessibleLabel}
                onClick={() => openEntryPoint(missionControlEntry)}
              >
                Open Mission Control
              </Button>
              <Button
                variant="light"
                color="knowmore"
                leftSection={<IconSparkles size={16} />}
                aria-label={liveCatalogEntry.accessibleLabel}
                onClick={() => openEntryPoint(liveCatalogEntry)}
              >
                Open Live Catalog Queue
              </Button>
            </Group>
          </Stack>
        )}
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
