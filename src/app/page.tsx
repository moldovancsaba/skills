import { Suspense } from "react";
import HomeClient from "./home-client";
import { Center, Loader, Stack } from "@mantine/core";
import { Text } from "@/components/ui/typography";

export default function Home() {
  return (
    <Suspense fallback={
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader color="ingress" />
          <Text size="sm" c="dimmed">Hardening OS Infrastructure...</Text>
        </Stack>
      </Center>
    }>
      <HomeClient />
    </Suspense>
  );
}
