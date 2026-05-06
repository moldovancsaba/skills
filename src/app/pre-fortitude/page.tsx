'use client';

import Link from "next/link";
import { Container, Title, Text, Anchor, Stack, rem } from "@mantine/core";

export default function PreFortitudePage() {
  return (
    <Container size="sm" py={rem(100)}>
      <Stack align="center" ta="center" gap="md">
        <Title order={1} >Legacy View Removed</Title>
        <Text size="sm" c="dimmed" maw={500}>
          Pre-Fortitude AI experiments and market validation data are now handled through the unified Data Ingress pipeline. Use #experiment or #validation tags to feed the intelligence engine.
        </Text>
        <Anchor component={Link} href="/data" size="sm" >
          Open Data Layer →
        </Anchor>
      </Stack>
    </Container>
  );
}