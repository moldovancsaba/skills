'use client';

import Link from "next/link";
import { Container, Title, Text, Anchor, Stack, rem } from "@mantine/core";

export default function ProductsPage() {
  return (
    <Container size="sm" py={rem(100)}>
      <Stack align="center" ta="center" gap="md">
        <Title order={1} size="h2" fw={900} lts={-1}>Legacy View Removed</Title>
        <Text size="sm" c="dimmed" maw={500}>
          The system no longer treats products as a hardcoded source class. Use the unified Data page to add raw sources and let AI clustering organize them.
        </Text>
        <Anchor component={Link} href="/data" size="sm" fw={800} tt="uppercase" lts={1}>
          Open Data Layer →
        </Anchor>
      </Stack>
    </Container>
  );
}
