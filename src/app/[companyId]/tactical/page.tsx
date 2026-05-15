import { Text } from "@/components/ui/typography";
/**
 * Tactical board route.
 *
 * The board is dynamically imported with `ssr: false` because the drag-and-drop
 * layer depends on browser-only APIs.
 */
'use client';

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Center, Loader, Stack } from "@mantine/core";

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

export default function TacticalPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  return <TacticalBoard companyId={companyId} />;
}
