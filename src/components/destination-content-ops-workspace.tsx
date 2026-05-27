'use client';

import { Tabs } from "@mantine/core";
import { IconActivity, IconChecklist, IconStack2 } from "@tabler/icons-react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/ui/app-shell";
import { PipelineAccentHeader } from "@/components/ui/app-shell";
import { DestinationLearningPanel } from "@/components/destination-learning-panel";
import { DestinationLiveListingOps } from "@/components/destination-live-listing-ops";
import { DestinationMissionControl } from "@/components/destination-mission-control";
import { DestinationReviewWorkspace } from "@/components/destination-review-workspace";
import { DestinationRulebookRunner } from "@/components/destination-rulebook-runner";

const TabsContent = Tabs.Panel;
const TabsList = Tabs.List;
const TabsTab = Tabs.Tab;

export function DestinationContentOpsWorkspace({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const defaultValue = requestedTab === "review" || requestedTab === "mission" || requestedTab === "ops"
    ? requestedTab
    : "ops";

  return (
    <PageShell width="full">
      <PipelineAccentHeader
        activeKey="review"
        title="ClassScout Intelligence Unit"
        icon={IconStack2}
      />

      <Tabs defaultValue={defaultValue}>
        <TabsList>
          <TabsTab value="ops" leftSection={<IconStack2 size={14} />}>
            Ops queue
          </TabsTab>
          <TabsTab value="review" leftSection={<IconChecklist size={14} />}>
            Review packets
          </TabsTab>
          <TabsTab value="mission" leftSection={<IconActivity size={14} />}>
            Mission control
          </TabsTab>
        </TabsList>

        <TabsContent value="ops" pt="md">
          <DestinationLiveListingOps companyId={companyId} />
        </TabsContent>

        <TabsContent value="review" pt="md">
          <DestinationReviewWorkspace companyId={companyId} embedded />
        </TabsContent>

        <TabsContent value="mission" pt="md">
          <DestinationRulebookRunner companyId={companyId} />
          <div style={{ height: 24 }} />
          <DestinationMissionControl companyId={companyId} />
          <div style={{ height: 24 }} />
          <DestinationLearningPanel companyId={companyId} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
