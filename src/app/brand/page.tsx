'use client';

import Link from "next/link";
import { Container, Title, Text, Anchor, Stack, rem } from "@mantine/core";

export default function BrandPage() {
  return (
    <Container size="sm" py={rem(100)}>
      <Stack align="center" ta="center" gap="md">
        <Title order={1} size="h2" fw={900} lts={-1}>Legacy View Removed</Title>
        <Text size="sm" c="dimmed" maw={500}>
          Brand identity and messaging frameworks are now synthesized from evidence units within the Data Ingress pipeline. Use #brand or #identity tags to feed the intelligence engine.
        </Text>
        <Anchor component={Link} href="/data" size="sm" fw={800} tt="uppercase" lts={1}>
          Open Data Layer →
        </Anchor>
      </Stack>
    </Container>
  );
}