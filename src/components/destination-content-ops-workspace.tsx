'use client';

import { Stack, Tabs } from "@mantine/core";
import { IconActivity, IconChecklist, IconSettings, IconStack2 } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/ui/app-shell";
import { PipelineAccentHeader } from "@/components/ui/app-shell";
import { DestinationLearningPanel } from "@/components/destination-learning-panel";
import { DestinationLiveListingOps } from "@/components/destination-live-listing-ops";
import { DestinationMissionControl } from "@/components/destination-mission-control";
import { DestinationMissionSetup } from "@/components/destination-mission-setup";
import { DestinationReviewWorkspace } from "@/components/destination-review-workspace";
import { DestinationRulebookRunner } from "@/components/destination-rulebook-runner";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import {
  normalizeDestinationKey,
  resolveDestinationLabel,
  supportsDestinationLiveListingOps,
} from "@/lib/destination-scope";

const TabsContent = Tabs.Panel;
const TabsList = Tabs.List;
const TabsTab = Tabs.Tab;

export function DestinationContentOpsWorkspace({
  companyId,
  initialDestinationKey,
}: {
  companyId: string;
  initialDestinationKey?: DestinationKey;
}) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedDestinationKey = searchParams.get("destinationKey");
  const destinationKey: DestinationKey = normalizeDestinationKey(requestedDestinationKey) ?? initialDestinationKey ?? "classscout";
  const destinationLabel = resolveDestinationLabel(destinationKey);
  const supportsLiveListingOps = supportsDestinationLiveListingOps(destinationKey);
  const defaultValue = requestedTab === "setup" || requestedTab === "review" || requestedTab === "mission" || requestedTab === "ops"
    ? (requestedTab === "ops" && !supportsLiveListingOps ? "setup" : requestedTab)
    : "setup";

  return (
    <PageShell width="full">
      <PipelineAccentHeader
        activeKey="review"
        title={`${destinationLabel} Intelligence Unit`}
        icon={IconStack2}
      />

      <Tabs defaultValue={defaultValue}>
        <TabsList>
          <TabsTab value="setup" leftSection={<IconSettings size={14} />}>
            Mission setup
          </TabsTab>
          {supportsLiveListingOps ? (
            <TabsTab value="ops" leftSection={<IconStack2 size={14} />}>
              Ops queue
            </TabsTab>
          ) : null}
          <TabsTab value="review" leftSection={<IconChecklist size={14} />}>
            Review cards
          </TabsTab>
          <TabsTab value="mission" leftSection={<IconActivity size={14} />}>
            Mission control
          </TabsTab>
        </TabsList>

        <TabsContent value="setup" pt="md">
          <DestinationMissionSetup companyId={companyId} destinationKey={destinationKey} />
        </TabsContent>

        {supportsLiveListingOps ? (
          <TabsContent value="ops" pt="md">
            <DestinationLiveListingOps companyId={companyId} />
          </TabsContent>
        ) : null}

        <TabsContent value="review" pt="md">
          <DestinationReviewWorkspace companyId={companyId} destinationKey={destinationKey} embedded />
        </TabsContent>

        <TabsContent value="mission" pt="md">
          <Stack gap="xl">
            <DestinationRulebookRunner companyId={companyId} destinationKey={destinationKey} />
            <DestinationMissionControl companyId={companyId} destinationKey={destinationKey} />
            <DestinationLearningPanel companyId={companyId} destinationKey={destinationKey} />
          </Stack>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
