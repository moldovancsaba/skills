"use client";

import Link from "next/link";
import { Button, Group, Stack } from "@mantine/core";
import { IconCheck as Check, IconCircleDashed as CircleDashed, IconRocket as Rocket, IconDatabase as Database, IconSparkles as Sparkles } from "@tabler/icons-react";
import { EmptyState, LinkCard, PageHeader, PageShell, RouteCardGrid } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { type UnitModuleKey } from "@/lib/intelligence-unit-capabilities";
import { type ModuleTone } from "@/lib/semantic-theme";

type CapabilityRecord = Partial<Record<UnitModuleKey, boolean>>;

const COMPARE_QUICK_ACTIONS: Array<{ key: UnitModuleKey; href: string; title: string; description: string; tone: ModuleTone | "neutral"; icon: any }> = [
  { key: "data", href: "data", title: "Data", description: "Review discovered sources and uploads", tone: "ingress", icon: Database },
  { key: "knowmore", href: "knowmore", title: "Knowmore", description: "Inspect evidence and generated knowledge", tone: "knowmore", icon: Sparkles },
  { key: "analytics", href: "analytics", title: "Analytics", description: "Monitor compare confidence and health", tone: "review", icon: Rocket },
  { key: "pipeline", href: "pipeline", title: "AI Queue", description: "Validate compare-driven pipeline work", tone: "neutral", icon: CircleDashed },
  { key: "checklist", href: "checklist", title: "Checklist", description: "AI supported execution checklist", tone: "checklist", icon: Check },
];

export function CompareHome({ companyId, modules = {} }: { companyId: string; modules?: CapabilityRecord }) {

  const actions = COMPARE_QUICK_ACTIONS.filter((action) => modules[action.key] !== false);

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PageHeader
          title="Compare"
          description="Compare is the second dedicated webapp surface. Use this control page to operate compare-oriented tasks and AI queue items."
        />

        <EmptyState
          icon={Rocket}
          title="Compare surface available"
          description="This webapp profile is active for this unit. Use the Compare actions below to open the modules that are currently enabled."
          tone="ingress"
        />

        <RouteCardGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          {actions.map((action) => (
            <LinkCard
              key={action.key}
              href={`/${companyId}/${action.href}`}
              icon={action.icon}
              variant={action.tone}
              title={action.title}
              description={action.description}
              density="compact"
            />
          ))}
        </RouteCardGrid>

        <Group>
          <Button variant="light" color="synthesis" component={Link} href={`/${companyId}/unit-board`}>
            Open project board
          </Button>
          <Button variant="outline" component={Link} href={`/${companyId}/settings`}>
            Unit capabilities
          </Button>
          <MetaText>Capabilities for this unit are configured in Settings.</MetaText>
        </Group>
      </Stack>
    </PageShell>
  );
}
