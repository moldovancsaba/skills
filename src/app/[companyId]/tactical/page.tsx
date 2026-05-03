/**
 * TACTICAL BOARD PAGE
 * v1.1.0
 * 
 * Dynamic import with ssr:false is REQUIRED for @hello-pangea/dnd.
 * The library uses browser-only APIs (pointer events, DOM refs) that
 * crash during Next.js server-side rendering.
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
        <Stack align="center" gap="sm">
          <Loader size="lg" variant="dots" color="orange" />
          <Text c="dimmed" size="sm">Loading Tactical Board...</Text>
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
