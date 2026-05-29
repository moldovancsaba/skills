'use client';

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Center, Loader, Stack } from "@mantine/core";
import { Text } from "@/components/ui/typography";

const UnitProjectBoardClient = dynamic(
  () => import("./unit-project-board-client").then((module) => ({ default: module.UnitProjectBoardClient })),
  {
    ssr: false,
    loading: () => (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader color="review" />
          <Text c="dimmed">Initializing Unit Project Board...</Text>
        </Stack>
      </Center>
    ),
  },
);

export default function UnitProjectBoardPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  return <UnitProjectBoardClient companyId={companyId} />;
}
