'use client';
/**
 * Tactical board route.
 *
 * The board is dynamically imported with `ssr: false` because the drag-and-drop
 * layer depends on browser-only APIs.
 */
import { Text } from "@/components/ui/typography";

import dynamic from "next/dynamic";
import { Center, Loader, Stack } from "@/components/gds/primitives";

const TacticalBoard = dynamic(
  () => import("@/components/tactical-board").then(m => ({ default: m.TacticalBoard })),
  {
    ssr: false,
    loading: () => (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader color="tactical" />
          <Text c="dimmed">
            Initializing Tactical Board...
          </Text>
        </Stack>
      </Center>
    ),
  }
);

type TacticalPageProps = {
  companyId: string;
};

export default function TacticalPage({ companyId }: TacticalPageProps) {
  return <TacticalBoard companyId={companyId} />;
}
