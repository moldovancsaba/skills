import { Suspense } from "react";
import HomeClient from "./home-client";
import { Center, Loader, Stack } from "@mantine/core";
import { Text } from "@/components/ui/typography";
import { getHomeInitialData } from "@/lib/server-home-page-data";

export default async function Home() {
  const initialData = await getHomeInitialData();
  return (
    <Suspense fallback={
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader color="ingress" />
          <Text size="sm" c="dimmed">Hardening OS Infrastructure...</Text>
        </Stack>
      </Center>
    }>
      <HomeClient
        initialCompanies={initialData.companies}
        initialSuggestedIndustries={initialData.suggestedIndustries}
        initialSession={initialData.session}
        initialDataReady
      />
    </Suspense>
  );
}
