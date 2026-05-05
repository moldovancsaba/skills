/**
 * TACTICAL BOARD PAGE
 * v1.1.0
 * 
 * Dynamic import with ssr:false is REQUIRED for @hello-pangea/dnd.
 */
'use client';

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Center, Loader, Stack, Text } from "@mantine/core";

const TacticalBoard = dynamic(
  () => import("@/components/tactical-board").then(m => ({ default: m.TacticalBoard })),
  {
    ssr: false,
    loading: () => (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader size="xl" variant="bars" color="brand" />
          <Text size="sm" fw={800} tt="uppercase" lts={1} c="dimmed">
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
