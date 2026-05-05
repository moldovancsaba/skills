import { Suspense } from "react";
import HomeClient from "./home-client";
import { Center, Loader, Stack, Text } from "@mantine/core";

export default function Home() {
  return (
    <Suspense fallback={
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader size="xl" variant="bars" color="brand" />
          <Text size="sm" fw={700} c="dimmed">Hardening OS Infrastructure...</Text>
        </Stack>
      </Center>
    }>
      <HomeClient />
    </Suspense>
  );
}