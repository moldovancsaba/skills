'use client';

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Group, Loader, Select, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { IconRefresh as Refresh, IconSend as Send } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/app-shell";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";

type LiveListingSummary = {
  id: string;
  type: "provider" | "meetupGroup";
  title: string;
  borough: string;
  neighborhood: string;
  categoryOrGroupType: string;
  imageUrl: string | null;
  websiteUrl: string | null;
  updatedAt: string | null;
  revisionStatus: {
    packetId: string | null;
    packetState: string | null;
    latestOutcomeEvent: string | null;
    latestDecision: string | null;
    lastSubmittedAt: string | null;
  };
};

const LISTING_TYPE_OPTIONS = [
  { value: "all", label: "All listing types" },
  { value: "provider", label: "Providers" },
  { value: "meetupGroup", label: "Meet-up groups" },
];

const BOROUGH_OPTIONS = [
  { value: "", label: "All boroughs" },
  { value: "Manhattan", label: "Manhattan" },
  { value: "Brooklyn", label: "Brooklyn" },
  { value: "Queens", label: "Queens" },
  { value: "Bronx", label: "Bronx" },
  { value: "Staten Island", label: "Staten Island" },
];

function statusLabel(item: LiveListingSummary) {
  if (item.revisionStatus.packetState) {
    return `${item.revisionStatus.packetState}${item.revisionStatus.latestOutcomeEvent ? ` · ${item.revisionStatus.latestOutcomeEvent}` : ""}`;
  }
  return "No revision yet";
}

export function DestinationLiveListingOps({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LiveListingSummary[]>([]);
  const [listingType, setListingType] = useState<string>("all");
  const [borough, setBorough] = useState<string>("");
  const [query, setQuery] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyId });
      params.set("destinationKey", "classscout");
      if (listingType && listingType !== "all") params.set("listingType", listingType);
      if (borough) params.set("borough", borough);
      if (query.trim()) params.set("query", query.trim());
      const response = await fetch(`/api/destination-review/live-listings?${params.toString()}`);
      const payload = response.ok ? await response.json() : null;
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } finally {
      setLoading(false);
    }
  }, [borough, companyId, listingType, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createRevision = useCallback(
    async (item: LiveListingSummary) => {
      setActingId(`${item.type}:${item.id}`);
      try {
        await fetch("/api/destination-review/live-listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            destinationKey: "classscout",
            listingId: item.id,
            listingType: item.type,
          }),
        });
        await load();
      } finally {
        setActingId(null);
      }
    },
    [companyId, load],
  );

  return (
    <UnifiedCard tone="strategy">
      <UnifiedCardHeader
        title="Live Destination Listings"
        supporting={
          <Group gap="xs">
            <Badge variant="light" color="strategy">
              {items.length} listing{items.length === 1 ? "" : "s"}
            </Badge>
            <Button variant="subtle" size="compact-sm" color="strategy" leftSection={<Refresh size={14} />} onClick={() => void load()}>
              Refresh
            </Button>
          </Group>
        }
      />
      <UnifiedCardBody>
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <Select label="Listing type" value={listingType} data={LISTING_TYPE_OPTIONS} allowDeselect={false} onChange={(value) => setListingType(value || "all")} />
            <Select label="Borough" value={borough} data={BOROUGH_OPTIONS} allowDeselect={false} onChange={(value) => setBorough(value || "")} />
            <TextInput label="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Title, category, borough..." />
          </SimpleGrid>

          {loading ? (
            <Stack align="center" py="xl">
              <Loader />
            </Stack>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Send}
              tone="strategy"
              title="No live listings match these filters"
              description="Adjust the filters or refresh the bridge if new destination rows are available to manage."
            />
          ) : (
            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
              {items.slice(0, 40).map((item) => (
                <UnifiedCardSection key={`${item.type}:${item.id}`} tone="strategy">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={2}>
                        <SectionTitle>{item.title}</SectionTitle>
                        <BodyText>{item.categoryOrGroupType}</BodyText>
                        <MetaText>
                          {item.borough} · {item.neighborhood} · {item.type}
                        </MetaText>
                      </Stack>
                      <Badge variant="light" color={item.revisionStatus.packetState ? "review" : "gray"}>
                        {statusLabel(item)}
                      </Badge>
                    </Group>
                    <Group justify="space-between" align="center">
                      <Stack gap={2}>
                        <MetaText>{item.id}</MetaText>
                        <MetaText>{item.websiteUrl || "No public URL"}</MetaText>
                      </Stack>
                      <Button
                        size="xs"
                        color="strategy"
                        leftSection={<Send size={14} />}
                        loading={actingId === `${item.type}:${item.id}`}
                        onClick={() => void createRevision(item)}
                      >
                        {item.revisionStatus.packetId ? "Create new revision" : "Create revision"}
                      </Button>
                    </Group>
                  </Stack>
                </UnifiedCardSection>
              ))}
            </SimpleGrid>
          )}

          {items.length > 40 ? (
            <Text size="xs" c="dimmed">
              Showing the first 40 listings after filters. Narrow the query for a smaller working set.
            </Text>
          ) : null}
        </Stack>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
